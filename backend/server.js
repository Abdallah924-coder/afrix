import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";
import { nanoid } from "nanoid";
import multer from "multer";
import pinoHttp from "pino-http";
import { z } from "zod";
import path from "path";
import {
  ADMIN_EMAIL,
  ADMIN_NAME,
  ADMIN_PASSWORD,
  APP_URL,
  MONGODB_URI,
  PORT,
  PUBLIC_ORIGIN,
  TOKEN_TTL,
  bonusRates,
  defaultDb,
  isProduction,
  jwtSecret,
  legacyPageRoutes,
  logger,
  pageRoutes,
  plans,
  publicFiles,
  rootDir
} from "./config.js";
import {
  addTransaction,
  consumeReservedFunds,
  creditMerchantAvailable,
  creditMerchantBonus,
  creditPlatform,
  creditUser,
  daysBetween,
  debitMerchantAvailable,
  debitPlatform,
  debitUser,
  ensurePlatform,
  formatAmount,
  makeReference,
  money,
  nowIso,
  releaseReservedFunds,
  reserveUserFunds,
  today
} from "./ledger.js";
import { maskEmail, notifyAdmin, sendBrevoMail } from "./mailer.js";
import {
  CicoRequestModel,
  DisputeModel,
  ExchangeAdModel,
  ExchangeOrderModel,
  LedgerEntryModel,
  MerchantApplicationModel,
  PlatformAccountModel,
  SettingModel,
  TransactionModel,
  UserModel,
  mongoose
} from "./models.js";

let mongoReadyPromise = null;
const transactionListProjection = {};

function normalizeDb(db = {}) {
  return {
    ...defaultDb,
    ...db,
    users: Array.isArray(db.users) ? db.users.map(normalizeUserRecord) : [],
    transactions: Array.isArray(db.transactions) ? db.transactions : [],
    cicoRequests: Array.isArray(db.cicoRequests) ? db.cicoRequests : [],
    exchangeAds: Array.isArray(db.exchangeAds) ? db.exchangeAds : [],
    exchangeOrders: Array.isArray(db.exchangeOrders) ? db.exchangeOrders : [],
    merchantApplications: Array.isArray(db.merchantApplications) ? db.merchantApplications : [],
    disputes: Array.isArray(db.disputes) ? db.disputes : [],
    ledgerEntries: Array.isArray(db.ledgerEntries) ? db.ledgerEntries : [],
    passwordResetTokens: Array.isArray(db.passwordResetTokens) ? db.passwordResetTokens : [],
    platformAccount: { ...defaultDb.platformAccount, ...(db.platformAccount || {}) },
    platformControls: { ...defaultDb.platformControls, ...(db.platformControls || {}) },
    paymentTargets: defaultDb.paymentTargets
  };
}

function normalizeUserRecord(user = {}) {
  if (!user) return null;
  return {
    ...user,
    balance: money(user.balance),
    reservedBalance: money(user.reservedBalance),
    activity: money(user.activity),
    bonus: money(user.bonus),
    merchantWallet: {
      available: money(user.merchantWallet?.available),
      pending: money(user.merchantWallet?.pending),
      bonus: money(user.merchantWallet?.bonus)
    },
    activePlans: Array.isArray(user.activePlans) ? user.activePlans : []
  };
}

async function ensureStorage() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is required. AFRIX stores application data in MongoDB only.");
  }

  try {
    if (!mongoReadyPromise) {
      mongoose.set("strictQuery", true);
      mongoReadyPromise = mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 10000
      }).then(() => logger.info("MongoDB Atlas connected"));
    }
    await mongoReadyPromise;
    await Promise.all([
      SettingModel.updateOne({ key: "platformControls" }, { $setOnInsert: { value: defaultDb.platformControls } }, { upsert: true }),
      SettingModel.updateOne({ key: "paymentTargets" }, { $setOnInsert: { value: defaultDb.paymentTargets } }, { upsert: true }),
      SettingModel.updateOne({ key: "passwordResetTokens" }, { $setOnInsert: { value: defaultDb.passwordResetTokens } }, { upsert: true }),
      PlatformAccountModel.updateOne({ id: "platform" }, { $setOnInsert: { ...defaultDb.platformAccount, createdAt: nowIso() } }, { upsert: true })
    ]);
  } catch (error) {
    mongoReadyPromise = null;
    logger.error({ err: error }, "Mongo unavailable");
    throw error;
  }
}

async function readDb(session = null) {
  await ensureStorage();
  const queryOptions = session ? { session } : {};
  let users;
  let transactions;
  let cicoRequests;
  let exchangeAds;
  let exchangeOrders;
  let merchantApplications;
  let disputes;
  let ledgerEntries;
  let settings;
  let platformAccount;
  if (session) {
    users = await UserModel.find({}, null, queryOptions).lean();
    transactions = await TransactionModel.find({}, transactionListProjection, queryOptions).lean();
    cicoRequests = await CicoRequestModel.find({}, null, queryOptions).lean();
    exchangeAds = await ExchangeAdModel.find({}, null, queryOptions).lean();
    exchangeOrders = await ExchangeOrderModel.find({}, null, queryOptions).lean();
    merchantApplications = await MerchantApplicationModel.find({}, null, queryOptions).lean();
    disputes = await DisputeModel.find({}, null, queryOptions).lean();
    ledgerEntries = await LedgerEntryModel.find({}, null, queryOptions).lean();
    settings = await SettingModel.find({}, null, queryOptions).lean();
    platformAccount = await PlatformAccountModel.findOne({ id: "platform" }, null, queryOptions).lean();
  } else {
    [users, transactions, cicoRequests, exchangeAds, exchangeOrders, merchantApplications, disputes, ledgerEntries, settings, platformAccount] = await Promise.all([
      UserModel.find({}, null, queryOptions).lean(),
      TransactionModel.find({}, transactionListProjection, queryOptions).lean(),
      CicoRequestModel.find({}, null, queryOptions).lean(),
      ExchangeAdModel.find({}, null, queryOptions).lean(),
      ExchangeOrderModel.find({}, null, queryOptions).lean(),
      MerchantApplicationModel.find({}, null, queryOptions).lean(),
      DisputeModel.find({}, null, queryOptions).lean(),
      LedgerEntryModel.find({}, null, queryOptions).lean(),
      SettingModel.find({}, null, queryOptions).lean(),
      PlatformAccountModel.findOne({ id: "platform" }, null, queryOptions).lean()
    ]);
  }
  const settingMap = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
  return normalizeDb({
    users,
    transactions,
    cicoRequests,
    exchangeAds,
    exchangeOrders,
    merchantApplications,
    disputes,
    ledgerEntries,
    passwordResetTokens: settingMap.passwordResetTokens,
    platformAccount,
    platformControls: settingMap.platformControls,
    paymentTargets: settingMap.paymentTargets
  });
}

async function syncCollection(model, docs, key, session, { removeMissing = true } = {}) {
  const cleanDocs = docs.map((doc) => {
    const { _id, __v, ...clean } = doc;
    return clean;
  });
  if (cleanDocs.length) {
    await model.bulkWrite(cleanDocs.map((doc) => ({
      updateOne: {
        filter: { [key]: doc[key] },
        update: { $set: doc },
        upsert: true
      }
    })), { session });
  }
  if (removeMissing) {
    const ids = cleanDocs.map((doc) => doc[key]);
    await model.deleteMany(ids.length ? { [key]: { $nin: ids } } : {}, { session });
  }
}

async function writeDb(db, session = null) {
  db = normalizeDb(db);
  await ensureStorage();
  const keepExisting = { removeMissing: false };
  await syncCollection(UserModel, db.users, "id", session, keepExisting);
  await syncCollection(TransactionModel, db.transactions, "id", session, keepExisting);
  await syncCollection(CicoRequestModel, db.cicoRequests, "id", session, keepExisting);
  await syncCollection(ExchangeAdModel, db.exchangeAds, "id", session, keepExisting);
  await syncCollection(ExchangeOrderModel, db.exchangeOrders, "id", session, keepExisting);
  await syncCollection(MerchantApplicationModel, db.merchantApplications, "id", session, keepExisting);
  await syncCollection(DisputeModel, db.disputes, "id", session, keepExisting);
  await syncCollection(LedgerEntryModel, db.ledgerEntries, "id", session, { removeMissing: false });
  if (session) {
    await SettingModel.updateOne({ key: "platformControls" }, { $set: { value: db.platformControls } }, { upsert: true, session });
    await SettingModel.updateOne({ key: "paymentTargets" }, { $set: { value: db.paymentTargets } }, { upsert: true, session });
    await SettingModel.updateOne({ key: "passwordResetTokens" }, { $set: { value: db.passwordResetTokens } }, { upsert: true, session });
    await PlatformAccountModel.updateOne({ id: "platform" }, { $set: db.platformAccount }, { upsert: true, session });
  } else {
    await Promise.all([
      SettingModel.updateOne({ key: "platformControls" }, { $set: { value: db.platformControls } }, { upsert: true, session }),
      SettingModel.updateOne({ key: "paymentTargets" }, { $set: { value: db.paymentTargets } }, { upsert: true, session }),
      SettingModel.updateOne({ key: "passwordResetTokens" }, { $set: { value: db.passwordResetTokens } }, { upsert: true, session }),
      PlatformAccountModel.updateOne({ id: "platform" }, { $set: db.platformAccount }, { upsert: true, session })
    ]);
  }
}

function isTransientMongoError(error) {
  return Boolean(
    error?.errorLabels?.includes?.("TransientTransactionError") ||
    error?.errorLabelSet?.has?.("TransientTransactionError") ||
    error?.code === 112 ||
    /write conflict/i.test(error?.message || "")
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateDb(mutator) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const db = await readDb(session);
        result = await mutator(db);
        await writeDb(db, session);
      });
      return result;
    } catch (error) {
      lastError = error;
      if (!isTransientMongoError(error) || attempt === 3) throw error;
      logger.warn({ err: error, attempt }, "Transient Mongo transaction error, retrying");
      await wait(100 * attempt);
    } finally {
      await session.endSession();
    }
  }
  throw lastError;
}

async function withMongoRetry(operation) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientMongoError(error) || attempt === 3) throw error;
      logger.warn({ err: error, attempt }, "Transient Mongo write error, retrying");
      await wait(100 * attempt);
    }
  }
  throw lastError;
}

function buildLedgerEntries(entries, metadata = {}) {
  const groupId = metadata.groupId || nanoid();
  const createdAt = nowIso();
  return entries
    .filter((entry) => money(entry.amount) > 0)
    .map((entry) => ({
      id: nanoid(),
      groupId,
      accountType: entry.accountType,
      accountId: entry.accountId,
      direction: entry.direction,
      amount: money(entry.amount),
      balanceAfter: money(entry.balanceAfter),
      description: entry.description,
      referenceId: metadata.referenceId || null,
      source: metadata.source || "system",
      createdAt,
      metadata: metadata.extra || {}
    }));
}

function sanitizeUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: TOKEN_TTL });
}

function hashResetToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}

function prunePasswordResetTokens(db) {
  const now = Date.now();
  db.passwordResetTokens = (db.passwordResetTokens || []).filter((item) => !item.usedAt && Date.parse(item.expiresAt) > now);
}

function parsePlan(planName) {
  const normalized = String(planName || "").toLowerCase();
  if (normalized.includes("starter")) return plans[0];
  if (normalized.includes("smart")) return plans[1];
  if (normalized.includes("premium")) return plans[2];
  if (normalized.includes("elite")) return plans[3];
  return plans.find((plan) => plan.id === normalized) || null;
}

function planForAmount(amount) {
  amount = money(amount);
  return plans
    .slice()
    .sort((a, b) => b.minAmount - a.minAmount)
    .find((plan) => amount >= plan.minAmount) || null;
}

function validateExchangeRate(type, rate) {
  const numericRate = Number(rate);
  if (!Number.isFinite(numericRate)) return "Taux invalide.";
  if (type === "sell" && (numericRate < 550 || numericRate > 600)) {
    return "Le prix de vente doit être compris entre 550 et 600 FCFA.";
  }
  if (type === "buy" && (numericRate < 630 || numericRate > 650)) {
    return "Le prix d'achat doit être compris entre 630 et 650 FCFA.";
  }
  return "";
}

function normalizePaymentMethods(value) {
  const methods = Array.isArray(value) ? value : String(value || "").split(",");
  return methods
    .map((method) => String(method || "").trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeCountry(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function isCongoBrazzaville(value) {
  const country = normalizeCountry(value);
  return country === "congo brazzaville" || country === "republique du congo" || country === "congo" || country === "cg";
}

function publicExchangeAd(ad, merchant) {
  return {
    ...ad,
    merchantName: merchant?.merchantProfile?.businessName || merchant?.fullName || "Merchant AFRIX",
    merchantEmail: merchant?.email || "",
    country: ad.country || merchant?.merchantProfile?.country || "",
    city: ad.city || merchant?.merchantProfile?.city || "",
    whatsapp: ad.whatsapp || merchant?.merchantProfile?.phone || "",
    methods: normalizePaymentMethods(ad.methods),
    rate: money(ad.rate),
    minAmount: money(ad.minAmount),
    maxAmount: money(ad.maxAmount)
  };
}

function rankFromActivity(activity) {
  const activeLevels = Math.max(0, Math.min(20, Math.floor(Number(activity || 0) / 100)));
  if (activeLevels >= 20) return "Niveau 20";
  return `Niveau ${activeLevels}`;
}

function progressFromActivity(activity) {
  return Math.max(0, Math.min(100, Number(activity || 0) % 100));
}

function composeUser(db, user) {
  const directPartners = db.users
    .filter((candidate) => candidate.referrerId === user.id)
    .map((candidate) => ({
      fullName: candidate.fullName || candidate.email.split("@")[0],
      email: candidate.email,
      activity: candidate.activity
    }));

  const approvedMerchants = db.users
    .filter((candidate) => candidate.merchantProfile?.status === "approved")
    .map((candidate) => candidate.merchantProfile);

  const ownCicoRequests = user.role === "admin"
    ? db.cicoRequests
    : db.cicoRequests.filter((request) => request.userId === user.id || request.merchantId === user.id);
  const ownExchangeOrders = user.role === "admin"
    ? db.exchangeOrders
    : db.exchangeOrders.filter((order) => order.userId === user.id || order.merchantId === user.id || order.customerEmail === user.email);
  const ownExchangeAds = db.exchangeAds
    .filter((ad) => user.role === "admin" || ad.merchantId === user.id)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  return {
    ...sanitizeUser(user),
    balance: money(user.balance),
    reservedBalance: money(user.reservedBalance),
    activity: money(user.activity),
    team: directPartners.length,
    bonus: money(user.bonus),
    rank: rankFromActivity(user.activity),
    progress: progressFromActivity(user.activity),
    progressText: "Progression calculee selon votre activite validee.",
    paymentTargets: db.paymentTargets,
    refLink: `${process.env.APP_URL || "http://localhost:" + PORT}/register?ref=${user.refCode}`,
    transactions: db.transactions
      .filter((tx) => tx.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((tx) => ({
        id: tx.id,
        date: tx.createdAt.slice(0, 10),
        type: tx.type,
        description: tx.description,
        amount: tx.displayAmount,
        status: tx.status
      })),
    adminTransactions: user.role === "admin"
      ? db.transactions
        .slice()
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .map((tx) => {
          const owner = db.users.find((candidate) => candidate.id === tx.userId);
          return {
            id: tx.id,
            reference: tx.id,
            userId: tx.userId,
            userEmail: owner?.email || "",
            date: String(tx.createdAt || "").slice(0, 10),
            type: tx.type,
            description: tx.description,
            amount: tx.displayAmount,
            rawAmount: money(tx.amount),
            status: tx.status,
            hasProof: Boolean(tx.metadata?.proof?.dataBase64 || tx.metadata?.proof?.mimeType),
            metadata: {
              method: tx.metadata?.method || "",
              txRef: tx.metadata?.txRef || "",
              address: tx.metadata?.address || ""
            }
          };
        })
      : [],
    directPartners,
    merchants: approvedMerchants,
    merchantWallet: {
      available: money(user.merchantWallet?.available),
      pending: money(user.merchantWallet?.pending),
      bonus: money(user.merchantWallet?.bonus),
      mainBalance: money(user.balance)
    },
    merchantApplicationStatus: user.merchantProfile?.status || "Aucun profil",
    cicoRequests: ownCicoRequests.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    exchangeAds: ownExchangeAds.map((ad) => publicExchangeAd(ad, db.users.find((candidate) => candidate.id === ad.merchantId))),
    exchangeOrders: ownExchangeOrders.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
    adminExchangeOrders: user.role === "admin"
      ? db.exchangeOrders
        .slice()
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      : [],
    merchantApplications: user.role === "admin" ? db.merchantApplications : db.merchantApplications.filter((item) => item.userId === user.id),
    disputes: user.role === "admin" ? db.disputes : db.disputes.filter((item) => item.userId === user.id),
    platformControls: user.role === "admin" ? db.platformControls : {}
    ,
    adminUsers: user.role === "admin"
      ? db.users
        .slice()
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .map((candidate) => ({
          id: candidate.id,
          email: candidate.email,
          fullName: candidate.fullName || candidate.email,
          role: candidate.role || "user",
          status: candidate.status || "active",
          balance: money(candidate.balance),
          reservedBalance: money(candidate.reservedBalance),
          activity: money(candidate.activity),
          merchantStatus: candidate.merchantProfile?.status || "Aucun profil",
          createdAt: candidate.createdAt
        }))
      : [],
    ledgerEntries: user.role === "admin"
      ? db.ledgerEntries.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500)
      : db.ledgerEntries.filter((entry) => entry.accountId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200),
    platformAccount: user.role === "admin" ? ensurePlatform(db) : {}
  };
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Authentification requise." });

  try {
    const payload = jwt.verify(token, jwtSecret);
    const db = await readDb();
    const user = db.users.find((candidate) => candidate.id === payload.sub);
    if (!user || user.status === "blocked") return res.status(401).json({ message: "Session invalide." });
    req.user = user;
    req.db = db;
    next();
  } catch {
    res.status(401).json({ message: "Session expiree." });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ message: "Acces admin requis." });
  next();
}

function requireMerchant(req, res, next) {
  if (req.user?.merchantProfile?.status !== "approved" && req.user?.role !== "admin") {
    return res.status(403).json({ message: "Compte merchant approuve requis." });
  }
  next();
}

function isBusinessRuleError(error) {
  return [
    "Solde insuffisant.",
    "Reserve insuffisante.",
    "Wallet merchant insuffisant."
  ].includes(error?.message);
}

function requirePlatformAccess({ cico = false } = {}) {
  return (req, res, next) => {
    const controls = req.db?.platformControls || {};
    if (controls.maintenanceMode && req.user?.role !== "admin") {
      return res.status(503).json({ message: "AFRIX est temporairement en maintenance." });
    }
    if (cico && controls.cicoMerchants === false && req.user?.role !== "admin") {
      return res.status(403).json({ message: "Les operations CICO merchant sont temporairement indisponibles." });
    }
    next();
  };
}

function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: result.error.issues[0]?.message || "Donnees invalides." });
    }
    req.body = result.data;
    next();
  };
}

async function distributeNetworkBonus(db, sourceUser, amount) {
  let currentReferrerId = sourceUser.referrerId;
  for (let level = 0; level < bonusRates.length && currentReferrerId; level += 1) {
    const referrer = db.users.find((user) => user.id === currentReferrerId);
    if (!referrer) break;

    const unlockedLevels = Math.floor(Number(referrer.activity || 0) / 100);
    if (unlockedLevels > level) {
      const bonus = money((amount * bonusRates[level]) / 100);
      creditUser(db, referrer, bonus, `Bonus reseau niveau ${level + 1}`, {
        source: "network_bonus",
        referenceId: sourceUser.id,
        extra: { sourceUserId: sourceUser.id, level: level + 1 }
      });
      referrer.bonus = money(referrer.bonus + bonus);
      addTransaction(db, {
        userId: referrer.id,
        type: "Bonus",
        description: `Bonus reseau niveau ${level + 1}`,
        amount: bonus,
        displayAmount: formatAmount(bonus, "+"),
        status: "Completed",
        metadata: { sourceUserId: sourceUser.id, level: level + 1 }
      });
    }

    currentReferrerId = referrer.referrerId;
  }
}

function completePlanWithCapitalReturn(db, user, plan, payoutDate) {
  if (plan.capitalReturnedAt) {
    plan.status = "completed";
    plan.completedAt = plan.completedAt || nowIso();
    return false;
  }

  const capital = money(plan.amount);
  if (capital <= 0) {
    plan.status = "completed";
    plan.completedAt = plan.completedAt || nowIso();
    return false;
  }

  creditUser(db, user, capital, `Remboursement capital ${plan.name}`, {
    source: "plan_capital_return",
    referenceId: plan.id,
    extra: { planId: plan.planId, payoutDate }
  });
  debitPlatform(db, capital, `Remboursement capital ${plan.name}`, {
    source: "plan_capital_return",
    referenceId: plan.id,
    extra: { userId: user.id, planId: plan.planId, payoutDate }
  });
  addTransaction(db, {
    userId: user.id,
    type: "Capital",
    description: `Remboursement capital ${plan.name}`,
    amount: capital,
    displayAmount: formatAmount(capital, "+"),
    status: "Completed",
    metadata: { planId: plan.planId, activePlanId: plan.id, payoutDate }
  });

  plan.status = "completed";
  plan.completedAt = nowIso();
  plan.capitalReturnedAt = nowIso();
  return true;
}

async function processDailyPlanEarnings() {
  const payoutDate = today();
  return updateDb(async (db) => {
    let creditedUsers = 0;
    let creditedAmount = 0;

    db.users.forEach((user) => {
      const activePlans = Array.isArray(user.activePlans) ? user.activePlans : [];
      activePlans.forEach((plan) => {
        if (plan.status !== "active") return;

        const durationDays = Number(plan.durationDays || 0);
        const daysPaid = Number(plan.daysPaid || 0);
        if (!durationDays || daysPaid >= durationDays) {
          if (durationDays && daysPaid >= durationDays) {
            completePlanWithCapitalReturn(db, user, plan, payoutDate);
          } else {
            plan.status = "completed";
            plan.completedAt = plan.completedAt || nowIso();
          }
          return;
        }

        const lastPayoutDate = String(plan.lastPayoutDate || plan.activatedAt || payoutDate).slice(0, 10);
        const dueDays = Math.min(daysBetween(lastPayoutDate, payoutDate), durationDays - daysPaid);
        if (dueDays <= 0) return;

        const payout = money(Number(plan.amount || 0) * Number(plan.dailyRate || 0) * dueDays);
        if (payout <= 0) return;

        creditUser(db, user, payout, `Gain journalier ${plan.name}`, {
          source: "plan_daily_earning",
          referenceId: plan.id,
          extra: { planId: plan.planId, days: dueDays, payoutDate }
        });
        debitPlatform(db, payout, `Gain journalier ${plan.name}`, {
          source: "plan_daily_earning",
          referenceId: plan.id,
          extra: { userId: user.id, planId: plan.planId, days: dueDays, payoutDate }
        });
        addTransaction(db, {
          userId: user.id,
          type: "Gain",
          description: `Gain journalier ${plan.name} (${dueDays} jour${dueDays > 1 ? "s" : ""})`,
          amount: payout,
          displayAmount: formatAmount(payout, "+"),
          status: "Completed",
          metadata: { planId: plan.planId, activePlanId: plan.id, days: dueDays, payoutDate }
        });

        plan.daysPaid = daysPaid + dueDays;
        plan.earnedAmount = money(Number(plan.earnedAmount || 0) + payout);
        plan.lastPayoutDate = payoutDate;
        if (plan.daysPaid >= durationDays) {
          completePlanWithCapitalReturn(db, user, plan, payoutDate);
        }
        creditedUsers += 1;
        creditedAmount = money(creditedAmount + payout);
      });
    });

    return { creditedUsers, creditedAmount, payoutDate };
  });
}

async function ensureAdminUser() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    logger.warn("ADMIN_EMAIL or ADMIN_PASSWORD missing: admin bootstrap skipped");
    return null;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await ensureStorage();
  const adminId = nanoid();
  const refCode = `AFX-${nanoid(8).toUpperCase()}`;
  const admin = normalizeUserRecord(await UserModel.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    {
      $set: {
        email: ADMIN_EMAIL,
        fullName: ADMIN_NAME,
        passwordHash,
        role: "admin",
        status: "active"
      },
      $setOnInsert: {
        id: adminId,
        balance: 0,
        reservedBalance: 0,
        activity: 0,
        bonus: 0,
        wallet: "",
        refCode,
        referrerId: null,
        merchantWallet: { available: 0, pending: 0, bonus: 0 },
        activePlans: [],
        createdAt: nowIso()
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean());

  logger.info({ email: maskEmail(admin.email), userId: admin.id }, "Admin account ready");
  return sanitizeUser(admin);
}

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.set("trust proxy", 1);
app.use(pinoHttp({ logger }));
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  }
}));
app.use(cors({ origin: PUBLIC_ORIGIN === "*" ? true : PUBLIC_ORIGIN, credentials: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 120 }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", async (_req, res) => {
  try {
    await ensureStorage();
    res.json({ status: "ok", mode: "mongo", time: nowIso() });
  } catch (error) {
    logger.error({ err: error }, "Healthcheck storage check failed");
    res.status(503).json({
      status: "degraded",
      mode: "mongo",
      time: nowIso(),
      message: "Storage not fully reachable."
    });
  }
});

app.post("/api/auth/register", validate(z.object({
  email: z.string().email(),
  password: z.string().min(10),
  country: z.string().min(2),
  ref: z.string().optional()
})), async (req, res) => {
  const { email, password, ref } = req.body;
  const normalizedEmail = email.trim().toLowerCase();
  const country = req.body.country.trim();

  const createUserRecord = async (referrerId = null) => ({
    id: nanoid(),
    email: normalizedEmail,
    fullName: normalizedEmail.split("@")[0],
    country,
    passwordHash: await bcrypt.hash(password, 12),
    role: "user",
    status: "active",
    balance: 0,
    reservedBalance: 0,
    activity: 0,
    bonus: 0,
    wallet: "",
    refCode: `AFX-${nanoid(8).toUpperCase()}`,
    referrerId,
    merchantWallet: { available: 0, pending: 0, bonus: 0 },
    activePlans: [],
    createdAt: nowIso()
  });

  await ensureStorage();
  const result = await (async () => {
    if (await UserModel.exists({ email: normalizedEmail })) {
      return { error: "Cet email est deja enregistre." };
    }
    const referrer = ref ? await UserModel.findOne({ refCode: ref }).lean() : null;
    try {
      const user = await UserModel.create(await createUserRecord(referrer?.id || null));
      return { user: normalizeUserRecord(user.toObject()) };
    } catch (error) {
      if (error?.code === 11000) return { error: "Cet email est deja enregistre." };
      throw error;
    }
  })();

  if (result.error) return res.status(409).json({ message: result.error });
  res.status(201).json({ token: signToken(result.user), user: sanitizeUser(result.user) });
  Promise.all([
    sendBrevoMail({
      to: result.user.email,
      subject: "AFRIX - Bienvenue",
      title: "Votre compte AFRIX est prêt",
      intro: "Votre espace AFRIX a été créé avec succès.",
      rows: [
        { label: "Email", value: result.user.email },
        { label: "Rôle", value: result.user.role }
      ],
      actionLabel: "Accéder au tableau de bord",
      actionUrl: `${APP_URL}/dashboard`
    }),
    notifyAdmin("AFRIX - Nouvelle inscription", "Nouvelle inscription", "Un nouveau compte vient d'être créé.", [
      { label: "Email", value: result.user.email },
      { label: "Rôle", value: result.user.role }
    ])
  ]).catch((error) => logger.error({ err: error }, "Register notification failed"));
});

app.post("/api/auth/login", validate(z.object({
  email: z.string().email(),
  password: z.string().min(1)
})), async (req, res) => {
  const normalizedEmail = req.body.email.trim().toLowerCase();
  await ensureStorage();
  const user = normalizeUserRecord(await UserModel.findOne({ email: normalizedEmail }).sort({ updatedAt: -1, createdAt: -1 }).lean());
  if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
    return res.status(401).json({ message: "Identifiants invalides." });
  }
  res.json({ token: signToken(user), user: sanitizeUser(user) });
});

app.post("/api/auth/forgot-password", validate(z.object({
  email: z.string().email()
})), async (req, res) => {
  const normalizedEmail = req.body.email.trim().toLowerCase();
  let resetUrl = "";

  await updateDb(async (db) => {
    prunePasswordResetTokens(db);
    const user = db.users.find((candidate) => candidate.email === normalizedEmail);
    if (!user) return null;

    const token = randomBytes(32).toString("hex");
    resetUrl = `${APP_URL}/reset-password?token=${token}`;
    db.passwordResetTokens = db.passwordResetTokens.filter((item) => item.userId !== user.id);
    db.passwordResetTokens.push({
      id: nanoid(),
      userId: user.id,
      tokenHash: hashResetToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      createdAt: nowIso()
    });
    return null;
  });

  if (resetUrl) {
    sendBrevoMail({
      to: normalizedEmail,
      subject: "AFRIX - Réinitialisation du mot de passe",
      title: "Réinitialisation du mot de passe",
      intro: "Utilisez ce lien pour définir un nouveau mot de passe. Il expire dans 1 heure.",
      rows: [{ label: "Compte", value: normalizedEmail }],
      actionLabel: "Réinitialiser le mot de passe",
      actionUrl: resetUrl
    }).catch((error) => logger.error({ err: error }, "Forgot password email failed"));
  }

  res.json({ message: "Si ce compte existe, un lien de reinitialisation a ete envoye." });
});

app.post("/api/auth/reset-password", validate(z.object({
  token: z.string().min(32),
  password: z.string().min(10)
})), async (req, res) => {
  const result = await updateDb(async (db) => {
    prunePasswordResetTokens(db);
    const tokenHash = hashResetToken(req.body.token);
    const resetToken = db.passwordResetTokens.find((item) => item.tokenHash === tokenHash);
    if (!resetToken) return { error: "Lien de reinitialisation invalide ou expire." };

    const user = db.users.find((candidate) => candidate.id === resetToken.userId);
    if (!user) return { error: "Compte introuvable." };

    user.passwordHash = await bcrypt.hash(req.body.password, 12);
    resetToken.usedAt = nowIso();
    db.passwordResetTokens = db.passwordResetTokens.filter((item) => item.id !== resetToken.id);
    return { user };
  });

  if (result.error) return res.status(400).json({ message: result.error });
  res.json({ token: signToken(result.user), user: sanitizeUser(result.user) });
});

app.get("/api/me", authenticate, (req, res) => {
  res.json({ user: composeUser(req.db, req.user) });
});

app.get("/api/merchants", authenticate, (req, res) => {
  const query = String(req.query.query || "").trim().toLowerCase();
  const merchants = req.db.users
    .filter((user) => user.merchantProfile?.status === "approved")
    .map((user) => user.merchantProfile)
    .filter((merchant) => !query || merchant.country.toLowerCase().includes(query) || merchant.city.toLowerCase().includes(query));
  res.json({ merchants });
});

app.post("/api/deposits", authenticate, requirePlatformAccess(), upload.single("proof"), async (req, res) => {
  const amount = Number(req.body.amount || 0);
  const method = String(req.body.method || "bep20");
  const txRef = String(req.body.txRef || "").trim();
  const isMtnCongoDeposit = method === "mtn_cg";
  if (amount < 10) return res.status(400).json({ message: "Montant minimum depot: 10 USDT." });
  if (!["bep20", "trc20", "mtn_cg"].includes(method)) {
    return res.status(400).json({ message: "Seuls les depots USDT BEP20, TRC20 et MTN Congo Brazzaville sont disponibles." });
  }
  if (isMtnCongoDeposit && !isCongoBrazzaville(req.user.country)) {
    return res.status(403).json({ message: "Le depot MTN Mobile Money est reserve aux comptes Congo Brazzaville." });
  }
  if (!isMtnCongoDeposit && !txRef) {
    return res.status(400).json({ message: "Reference transaction crypto requise." });
  }
  if (!req.file?.buffer?.length) {
    return res.status(400).json({ message: "Preuve de paiement requise." });
  }
  const proof = {
    originalName: req.file.originalname || "preuve-paiement",
    mimeType: req.file.mimetype || "application/octet-stream",
    size: req.file.size || req.file.buffer.length,
    dataBase64: req.file.buffer.toString("base64")
  };

  const result = await withMongoRetry(async () => {
    const tx = {
      id: nanoid(),
      userId: req.user.id,
      type: "Depot",
      description: isMtnCongoDeposit ? "Depot MTN Mobile Money Congo Brazzaville" : `Depot wallet ${method.toUpperCase()}`,
      amount: money(amount),
      displayAmount: formatAmount(amount, "+"),
      status: "Pending",
      createdAt: nowIso(),
      metadata: {
        method,
        ...(txRef ? { txRef } : {}),
        proof
      }
    };
    await TransactionModel.create(tx);
    return { transaction: tx };
  });

  res.status(201).json({
    reference: result.request?.reference || result.transaction?.id,
    amount,
    fee: result.request?.fee || 0,
    status: result.request?.status || result.transaction?.status
  });

  Promise.all([
    sendBrevoMail({
    to: req.user.email,
    subject: "AFRIX - Depot enregistre",
    title: "Votre depot est en attente",
    intro: "Votre demande de depot a ete recue par AFRIX.",
    rows: [
      { label: "Methode", value: method.toUpperCase() },
      { label: "Montant", value: formatAmount(amount) },
      { label: "Reference", value: result.request?.reference || result.transaction?.id },
      { label: "Statut", value: result.request?.status || result.transaction?.status }
    ]
    }),
    notifyAdmin("AFRIX - Depot a traiter", "Depot a traiter", "Une demande de depot est en attente.", [
    { label: "Client", value: req.user.email },
    { label: "Methode", value: method.toUpperCase() },
    { label: "Montant", value: formatAmount(amount) }
    ])
  ]).catch((error) => logger.error({ err: error }, "Deposit notification failed"));
});

app.post("/api/withdrawals", authenticate, requirePlatformAccess(), validate(z.object({
  method: z.enum(["bep20", "mtn_cg"]),
  amount: z.coerce.number().positive(),
  address: z.string().optional(),
  phone: z.string().optional(),
  beneficiary: z.string().optional()
})), async (req, res) => {
  const { amount, method } = req.body;
  const address = String(req.body.address || "").trim();
  const phone = String(req.body.phone || "").trim();
  const beneficiary = String(req.body.beneficiary || "").trim();
  const isMtnCongoWithdrawal = method === "mtn_cg";
  if (amount < 10) return res.status(400).json({ message: "Montant minimum retrait: 10 USDT." });
  if (method === "bep20" && !address) {
    return res.status(400).json({ message: "Adresse wallet BEP20 requise." });
  }
  if (isMtnCongoWithdrawal && !isCongoBrazzaville(req.user.country)) {
    return res.status(403).json({ message: "Le retrait MTN Mobile Money est reserve aux comptes Congo Brazzaville." });
  }
  if (isMtnCongoWithdrawal && (!phone || !beneficiary)) {
    return res.status(400).json({ message: "Numero MTN et nom beneficiaire requis." });
  }
  const fee = isMtnCongoWithdrawal ? money(amount * 0.10) : 0;
  const reservedAmount = money(amount + fee);
  if (money(req.user.balance) < reservedAmount) {
    return res.status(400).json({ message: "Solde insuffisant." });
  }

  let result;
  try {
    result = await withMongoRetry(async () => {
      const tx = {
        id: nanoid(),
        userId: req.user.id,
        type: "Retrait",
        description: isMtnCongoWithdrawal ? "Retrait MTN Mobile Money Congo Brazzaville" : `Retrait wallet ${method.toUpperCase()}`,
        amount: money(amount),
        displayAmount: formatAmount(amount, "-"),
        status: "Pending",
        createdAt: nowIso(),
        metadata: {
          method,
          fee,
          reservedAmount,
          ...(address ? { address } : {}),
          ...(phone ? { phone } : {}),
          ...(beneficiary ? { beneficiary } : {})
        }
      };

      const session = await mongoose.startSession();
      try {
        let updatedUser;
        await session.withTransaction(async () => {
          updatedUser = await UserModel.findOneAndUpdate(
            {
              id: req.user.id,
              $expr: { $gte: [{ $toDouble: "$balance" }, reservedAmount] }
            },
            [{
              $set: {
                balance: { $round: [{ $subtract: [{ $toDouble: "$balance" }, reservedAmount] }, 2] },
                reservedBalance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$reservedBalance", 0] } }, reservedAmount] }, 2] }
              }
            }],
            { new: true, session, lean: true }
          );
          if (!updatedUser) {
            throw new Error("Solde insuffisant.");
          }

          const ledgerEntries = buildLedgerEntries([{
            accountType: "user",
            accountId: req.user.id,
            direction: "debit",
            amount: reservedAmount,
            balanceAfter: updatedUser.balance,
            description: `${tx.description} - reserve`
          }, {
            accountType: "user_reserved",
            accountId: req.user.id,
            direction: "credit",
            amount: reservedAmount,
            balanceAfter: updatedUser.reservedBalance,
            description: tx.description
          }], {
            source: "withdrawal_request",
            referenceId: tx.id
          });

          await TransactionModel.create([tx], { session });
          if (ledgerEntries.length) await LedgerEntryModel.insertMany(ledgerEntries, { session });
        });
      } finally {
        await session.endSession();
      }

      return { transaction: tx };
    });
  } catch (error) {
    if (error.message === "Solde insuffisant.") {
      return res.status(400).json({ message: error.message });
    }
    throw error;
  }

  if (result.error) return res.status(400).json({ message: result.error });
  res.status(201).json({
    reference: result.request?.reference || result.transaction?.id,
    amount,
    fee: result.request?.fee || result.transaction?.metadata?.fee || 0,
    status: result.request?.status || result.transaction?.status
  });

  Promise.all([
    sendBrevoMail({
    to: req.user.email,
    subject: "AFRIX - Retrait soumis",
    title: "Votre retrait est en traitement",
    intro: "Votre demande de retrait a ete soumise.",
    rows: [
      { label: "Methode", value: method.toUpperCase() },
      { label: "Montant", value: formatAmount(amount) },
      { label: "Frais", value: formatAmount(result.request?.fee || result.transaction?.metadata?.fee || 0) },
      { label: "Reference", value: result.request?.reference || result.transaction?.id },
      { label: "Statut", value: result.request?.status || result.transaction?.status }
    ]
    }),
    notifyAdmin("AFRIX - Retrait a traiter", "Retrait a traiter", "Une demande de retrait est en attente.", [
    { label: "Client", value: req.user.email },
    { label: "Methode", value: method.toUpperCase() },
    { label: "Montant", value: formatAmount(amount) },
    { label: "Frais", value: formatAmount(result.transaction?.metadata?.fee || 0) },
    ...(phone ? [{ label: "Numero MTN", value: phone }] : []),
    ...(beneficiary ? [{ label: "Beneficiaire", value: beneficiary }] : [])
    ])
  ]).catch((error) => logger.error({ err: error }, "Withdrawal notification failed"));
});

app.post("/api/plans/activate", authenticate, requirePlatformAccess(), validate(z.object({
  amount: z.coerce.number().optional(),
  plan: z.string().optional()
})), async (req, res) => {
  const requestedAmount = req.body.amount ? money(req.body.amount) : null;
  const plan = requestedAmount ? planForAmount(requestedAmount) : parsePlan(req.body.plan);
  if (!plan) return res.status(400).json({ message: "Plan inconnu." });
  const investmentAmount = requestedAmount || money(plan.minAmount || plan.amount);
  if (investmentAmount < 10) return res.status(400).json({ message: "Montant minimum investissement: 10 USDT." });

  const result = await updateDb(async (db) => {
    const user = db.users.find((candidate) => candidate.id === req.user.id);
    if (user.balance < investmentAmount) return { error: "Solde insuffisant pour activer ce plan." };

    debitUser(db, user, investmentAmount, `Activation ${plan.name}`, {
      source: "plan_activation",
      referenceId: plan.id
    });
    creditPlatform(db, investmentAmount, `Activation ${plan.name}`, {
      source: "plan_activation",
      referenceId: user.id,
      extra: { planId: plan.id }
    });
    user.activity = money(user.activity + investmentAmount);
    const activePlan = {
      id: nanoid(),
      planId: plan.id,
      name: plan.name,
      amount: investmentAmount,
      dailyRate: plan.dailyRate,
      durationDays: plan.durationDays,
      activatedAt: nowIso(),
      lastPayoutDate: today(),
      daysPaid: 0,
      earnedAmount: 0,
      capitalReturnedAt: null,
      status: "active"
    };
    user.activePlans = user.activePlans || [];
    user.activePlans.push(activePlan);

    db.transactions.push({
      id: nanoid(),
      userId: user.id,
      type: "Plan",
      description: `Activation ${plan.name}`,
      amount: investmentAmount,
      displayAmount: formatAmount(investmentAmount, "-"),
      status: "Active",
      createdAt: nowIso()
    });

    await distributeNetworkBonus(db, user, investmentAmount);
    return { user, activePlan };
  });

  if (result.error) return res.status(400).json({ message: result.error });
  res.json({ user: sanitizeUser(result.user), activePlan: result.activePlan });
});

app.post("/api/p2p-transfers", authenticate, requirePlatformAccess(), validate(z.object({
  recipient: z.string().email(),
  amount: z.coerce.number().positive()
})), async (req, res) => {
  const result = await updateDb(async (db) => {
    const sender = db.users.find((user) => user.id === req.user.id);
    const recipient = db.users.find((user) => user.email === req.body.recipient.trim().toLowerCase());
    if (!recipient) return { error: "Destinataire introuvable." };
    const fee = money(req.body.amount * 0.01);
    const total = money(req.body.amount + fee);
    if (sender.balance < total) return { error: "Solde insuffisant." };

    debitUser(db, sender, total, `Transfert vers ${recipient.email}`, {
      source: "p2p_transfer",
      referenceId: recipient.id
    });
    creditUser(db, recipient, req.body.amount, `Reception depuis ${sender.email}`, {
      source: "p2p_transfer",
      referenceId: sender.id
    });
    creditPlatform(db, fee, "Frais P2P", {
      source: "p2p_fee",
      referenceId: sender.id,
      extra: { recipientId: recipient.id }
    });
    db.transactions.push({
      id: nanoid(),
      userId: sender.id,
      type: "P2P",
      description: `Transfert vers ${recipient.email}`,
      amount: total,
      displayAmount: formatAmount(total, "-"),
      status: "Completed",
      createdAt: nowIso()
    }, {
      id: nanoid(),
      userId: recipient.id,
      type: "P2P",
      description: `Reception depuis ${sender.email}`,
      amount: req.body.amount,
      displayAmount: formatAmount(req.body.amount, "+"),
      status: "Completed",
      createdAt: nowIso()
    });
    return { transferId: nanoid() };
  });

  if (result.error) return res.status(400).json({ message: result.error });
  res.status(201).json(result);
});

app.get("/api/exchange/ads", authenticate, requirePlatformAccess(), async (req, res) => {
  const type = String(req.query.type || "").trim();
  const ads = req.db.exchangeAds
    .filter((ad) => ad.status === "active")
    .filter((ad) => !type || ad.type === type)
    .map((ad) => publicExchangeAd(ad, req.db.users.find((user) => user.id === ad.merchantId)))
    .filter((ad) => ad.whatsapp && ad.methods.length)
    .sort((a, b) => type === "buy" ? b.rate - a.rate : a.rate - b.rate);
  res.json({ ads });
});

app.post("/api/exchange/ads", authenticate, requirePlatformAccess(), requireMerchant, validate(z.object({
  type: z.enum(["sell", "buy"]),
  rate: z.coerce.number().positive(),
  minAmount: z.coerce.number().positive(),
  maxAmount: z.coerce.number().positive(),
  country: z.string().min(2),
  city: z.string().min(2),
  whatsapp: z.string().min(8),
  methods: z.union([z.string().min(2), z.array(z.string().min(2))]),
  paymentInstructions: z.string().min(4),
  status: z.enum(["active", "paused"]).optional()
})), async (req, res) => {
  const rateError = validateExchangeRate(req.body.type, req.body.rate);
  if (rateError) return res.status(400).json({ message: rateError });
  if (money(req.body.maxAmount) < money(req.body.minAmount)) {
    return res.status(400).json({ message: "Le montant maximum doit être supérieur au montant minimum." });
  }

  const ad = await updateDb(async (db) => {
    const item = {
      id: nanoid(),
      merchantId: req.user.id,
      type: req.body.type,
      status: req.body.status || "active",
      rate: money(req.body.rate),
      minAmount: money(req.body.minAmount),
      maxAmount: money(req.body.maxAmount),
      country: req.body.country.trim(),
      city: req.body.city.trim(),
      whatsapp: req.body.whatsapp.trim(),
      methods: normalizePaymentMethods(req.body.methods),
      paymentInstructions: req.body.paymentInstructions.trim(),
      createdAt: nowIso()
    };
    db.exchangeAds.push(item);
    return item;
  });

  res.status(201).json({ ad });
});

app.post("/api/exchange/orders", authenticate, requirePlatformAccess(), validate(z.object({
  adId: z.string().min(2),
  amount: z.coerce.number().positive(),
  paymentMethod: z.string().min(2),
  customerEmail: z.string().email(),
  txReference: z.string().optional(),
  note: z.string().optional()
})), async (req, res) => {
  const result = await updateDb(async (db) => {
    const ad = db.exchangeAds.find((item) => item.id === req.body.adId && item.status === "active");
    if (!ad) return { error: "Annonce introuvable ou inactive." };
    const merchant = db.users.find((user) => user.id === ad.merchantId);
    if (!merchant || merchant.merchantProfile?.status !== "approved") return { error: "Merchant indisponible." };

    const amount = money(req.body.amount);
    if (amount < money(ad.minAmount) || amount > money(ad.maxAmount)) {
      return { error: `Le montant doit être compris entre ${formatAmount(ad.minAmount)} et ${formatAmount(ad.maxAmount)}.` };
    }

    const methods = normalizePaymentMethods(ad.methods).map((method) => method.toLowerCase());
    if (!methods.includes(req.body.paymentMethod.trim().toLowerCase())) {
      return { error: "Ce moyen de paiement n'est pas disponible sur cette annonce." };
    }

    const customerEmail = req.body.customerEmail.trim().toLowerCase();
    const customer = db.users.find((user) => user.email === customerEmail);
    if (!customer) return { error: "L'adresse email client doit correspondre à un compte AFRIX." };

    const localAmount = money(amount * Number(ad.rate || 0));
    const reference = makeReference(ad.type === "sell" ? "BUY" : "SELL", amount);

    if (ad.type === "buy") {
      if (customer.id !== req.user.id && req.user.role !== "admin") {
        return { error: "Vous ne pouvez vendre que les USDT de votre propre compte." };
      }
      reserveUserFunds(db, customer, amount, `Vente USDT Exchange ${reference}`, {
        source: "exchange_sell_request",
        referenceId: reference,
        extra: { adId: ad.id, merchantId: merchant.id }
      });
    }

    const order = {
      id: nanoid(),
      reference,
      adId: ad.id,
      merchantId: merchant.id,
      userId: customer.id,
      customerEmail,
      type: ad.type,
      amount,
      rate: money(ad.rate),
      localAmount,
      paymentMethod: req.body.paymentMethod.trim(),
      txReference: String(req.body.txReference || "").trim(),
      note: String(req.body.note || "").trim().slice(0, 240),
      status: "pending",
      merchantWhatsapp: ad.whatsapp,
      merchantName: merchant.merchantProfile?.businessName || merchant.fullName || merchant.email,
      paymentInstructions: ad.paymentInstructions,
      createdAt: nowIso()
    };
    db.exchangeOrders.push(order);
    addTransaction(db, {
      userId: customer.id,
      type: "Exchange",
      description: ad.type === "sell" ? `Achat USDT via ${order.merchantName}` : `Vente USDT via ${order.merchantName}`,
      amount,
      displayAmount: ad.type === "sell" ? formatAmount(amount, "+") : formatAmount(amount, "-"),
      status: "Pending",
      metadata: { reference, localAmount, rate: ad.rate, paymentMethod: order.paymentMethod }
    });
    return { order };
  });

  if (result.error) return res.status(400).json({ message: result.error });
  res.status(201).json({ order: result.order });
});

app.get("/api/exchange/orders/:reference", authenticate, requirePlatformAccess(), requireMerchant, (req, res) => {
  const reference = String(req.params.reference || "").trim().toUpperCase();
  const order = req.db.exchangeOrders.find((item) => item.reference === reference && (item.merchantId === req.user.id || req.user.role === "admin"));
  if (!order) return res.status(404).json({ message: "Demande Exchange introuvable." });
  res.json({ order });
});

app.post("/api/exchange/orders/:reference/confirm", authenticate, requirePlatformAccess(), requireMerchant, async (req, res) => {
  const reference = String(req.params.reference || "").trim().toUpperCase();
  const result = await updateDb(async (db) => {
    const order = db.exchangeOrders.find((item) => item.reference === reference && (item.merchantId === req.user.id || req.user.role === "admin"));
    if (!order) return { error: "Demande Exchange introuvable." };
    if (order.status !== "pending") return { error: "Cette demande a déjà été traitée." };
    const merchant = db.users.find((user) => user.id === order.merchantId);
    const customer = db.users.find((user) => user.id === order.userId);
    if (!merchant || !customer) return { error: "Compte merchant ou client introuvable." };

    if (order.type === "sell") {
      debitMerchantAvailable(db, merchant, order.amount, `Vente USDT Exchange ${order.reference}`, {
        source: "exchange_merchant_sell",
        referenceId: order.reference,
        extra: { customerId: customer.id }
      });
      creditUser(db, customer, order.amount, `Achat USDT Exchange ${order.reference}`, {
        source: "exchange_customer_buy",
        referenceId: order.reference,
        extra: { merchantId: merchant.id }
      });
    } else {
      consumeReservedFunds(db, customer, order.amount, `Vente USDT Exchange ${order.reference}`, {
        source: "exchange_customer_sell",
        referenceId: order.reference,
        extra: { merchantId: merchant.id }
      });
      creditMerchantAvailable(db, merchant, order.amount, `Achat USDT Exchange ${order.reference}`, {
        source: "exchange_merchant_buy",
        referenceId: order.reference,
        extra: { customerId: customer.id }
      });
    }

    order.status = "completed";
    order.completedAt = nowIso();
    order.completedBy = req.user.id;
    addTransaction(db, {
      userId: customer.id,
      type: "Exchange",
      description: order.type === "sell" ? `Achat USDT confirmé ${order.reference}` : `Vente USDT confirmée ${order.reference}`,
      amount: order.amount,
      displayAmount: order.type === "sell" ? formatAmount(order.amount, "+") : formatAmount(order.amount, "-"),
      status: "Completed",
      metadata: { reference: order.reference, localAmount: order.localAmount, rate: order.rate }
    });
    return { order, customer };
  });

  if (result.error) return res.status(400).json({ message: result.error });
  res.json({ order: result.order });
  sendBrevoMail({
    to: result.customer.email,
    subject: "AFRIX - Demande Exchange validée",
    title: "Votre opération Exchange est validée",
    intro: "Le merchant a confirmé votre opération.",
    rows: [
      { label: "Référence", value: result.order.reference },
      { label: "Montant", value: formatAmount(result.order.amount) },
      { label: "Montant local", value: `${Math.round(result.order.localAmount).toLocaleString("fr-FR")} FCFA` }
    ]
  }).catch((error) => logger.error({ err: error }, "Exchange confirmation email failed"));
});

app.post("/api/cico-requests", authenticate, requirePlatformAccess({ cico: true }), validate(z.object({
  operation: z.enum(["Depot", "Retrait"]),
  country: z.string().min(2),
  amount: z.coerce.number().positive()
})), async (req, res) => {
  const result = await updateDb(async (db) => {
    const user = db.users.find((candidate) => candidate.id === req.user.id);
    const isWithdrawal = req.body.operation === "Retrait";
    if (isWithdrawal && req.body.amount < 10) return { error: "Montant minimum retrait: 10 USDT." };
    const fee = isWithdrawal ? money(req.body.amount * 0.1) : 0;
    if (isWithdrawal && user.balance < req.body.amount + fee) return { error: "Solde insuffisant." };
    if (isWithdrawal) {
      reserveUserFunds(db, user, money(req.body.amount + fee), "Retrait CICO Mobile Money", {
        source: "cico_withdrawal_request"
      });
    }

    const request = {
      id: nanoid(),
      reference: makeReference(isWithdrawal ? "WD" : "DP", req.body.amount),
      type: req.body.operation,
      userId: user.id,
      customer: user.email,
      country: req.body.country,
      amount: money(req.body.amount),
      fee,
      merchantBonus: money(req.body.amount * (isWithdrawal ? 0.03 : 0.005)),
      method: "Mobile Money",
      phone: "",
      status: "En attente merchant",
      reservedAmount: isWithdrawal ? money(req.body.amount + fee) : 0,
      createdAt: nowIso()
    };
    db.cicoRequests.push(request);
    return { request };
  });

  if (result.error) return res.status(400).json({ message: result.error });
  res.status(201).json({
    reference: result.request.reference,
    operation: result.request.type,
    amount: result.request.amount,
    fee: result.request.fee
  });
});

app.post("/api/merchant/applications", authenticate, requirePlatformAccess(), validate(z.object({
  businessName: z.string().min(2),
  country: z.string().min(2),
  city: z.string().min(2),
  phone: z.string().min(8),
  methods: z.string().min(2),
  guarantee: z.coerce.number().min(1000)
})), async (req, res) => {
  const application = await updateDb(async (db) => {
    const user = db.users.find((candidate) => candidate.id === req.user.id);
    const item = {
      id: nanoid(),
      userId: user.id,
      userEmail: user.email,
      businessName: req.body.businessName,
      country: req.body.country,
      city: req.body.city,
      phone: req.body.phone,
      methods: req.body.methods,
      guarantee: money(req.body.guarantee),
      status: "pending",
      createdAt: nowIso()
    };
    db.merchantApplications.push(item);
    user.merchantProfile = { ...item, status: "pending", rating: "En validation", limits: `10 - ${money(req.body.guarantee)} USDT` };
    return item;
  });

  res.status(201).json({ application });
  Promise.all([
    sendBrevoMail({
      to: req.user.email,
      subject: "AFRIX - Demande merchant reçue",
      title: "Votre demande merchant est en validation",
      intro: "L'équipe AFRIX va vérifier votre profil merchant.",
      rows: [
        { label: "Nom commercial", value: application.businessName },
        { label: "Ville", value: `${application.city}, ${application.country}` },
        { label: "Garantie", value: formatAmount(application.guarantee) }
      ]
    }),
    notifyAdmin("AFRIX - Nouvelle demande merchant", "Demande merchant", "Un utilisateur demande le statut merchant.", [
      { label: "Utilisateur", value: req.user.email },
      { label: "Nom commercial", value: application.businessName },
      { label: "Garantie", value: formatAmount(application.guarantee) }
    ])
  ]).catch((error) => logger.error({ err: error }, "Merchant application notification failed"));
});

app.get("/api/merchant/cico-requests/:reference", authenticate, requirePlatformAccess({ cico: true }), requireMerchant, (req, res) => {
  const request = req.db.cicoRequests.find((item) => item.reference === req.params.reference && item.status === "En attente merchant");
  if (!request) return res.status(404).json({ message: "Reference introuvable ou deja traitee." });
  res.json({ request });
});

app.post("/api/merchant/cico-requests/:reference/confirm", authenticate, requirePlatformAccess({ cico: true }), requireMerchant, async (req, res) => {
  const result = await updateDb(async (db) => {
    const merchant = db.users.find((user) => user.id === req.user.id);
    const request = db.cicoRequests.find((item) => item.reference === req.params.reference && item.status === "En attente merchant");
    if (!request) return { error: "Reference introuvable ou deja traitee." };
    const customer = db.users.find((user) => user.id === request.userId);
    if (!customer) return { error: "Client introuvable." };

    if (request.type === "Depot") {
      debitMerchantAvailable(db, merchant, request.amount, `Depot CICO ${request.reference}`, {
        source: "cico_deposit",
        referenceId: request.id
      });
      creditUser(db, customer, request.amount, `Depot CICO ${request.reference}`, {
        source: "cico_deposit",
        referenceId: request.id
      });
      creditMerchantBonus(db, merchant, request.merchantBonus, `Bonus depot CICO ${request.reference}`, {
        source: "cico_deposit_bonus",
        referenceId: request.id
      });
      db.transactions.push({
        id: nanoid(),
        userId: customer.id,
        type: "Depot",
        description: `Depot CICO ${request.reference}`,
        amount: request.amount,
        displayAmount: formatAmount(request.amount, "+"),
        status: "Completed",
        createdAt: nowIso()
      });
    } else {
      const total = money(request.amount + request.fee);
      const platformFee = money(request.fee - request.merchantBonus);
      consumeReservedFunds(db, customer, total, `Retrait CICO ${request.reference}`, {
        source: "cico_withdrawal",
        referenceId: request.id
      });
      creditMerchantAvailable(db, merchant, money(request.amount + request.merchantBonus), `Retrait CICO ${request.reference}`, {
        source: "cico_withdrawal",
        referenceId: request.id
      });
      creditMerchantBonus(db, merchant, request.merchantBonus, `Bonus retrait CICO ${request.reference}`, {
        source: "cico_withdrawal_bonus",
        referenceId: request.id
      });
      if (platformFee > 0) {
        creditPlatform(db, platformFee, `Frais retrait CICO ${request.reference}`, {
          source: "cico_withdrawal_fee",
          referenceId: request.id
        });
      }
      db.transactions.push({
        id: nanoid(),
        userId: customer.id,
        type: "Retrait",
        description: `Retrait CICO ${request.reference}`,
        amount: total,
        displayAmount: formatAmount(total, "-"),
        status: "Completed",
        createdAt: nowIso()
      });
    }

    request.status = "Completed";
    request.merchantId = merchant.id;
    request.completedAt = nowIso();
    return { request };
  });

  if (result.error) return res.status(400).json({ message: result.error });
  res.json({ request: result.request });
});

app.post("/api/merchant/transfers", authenticate, requirePlatformAccess(), requireMerchant, validate(z.object({
  amount: z.coerce.number().positive()
})), async (req, res) => {
  const result = await updateDb(async (db) => {
    const user = db.users.find((candidate) => candidate.id === req.user.id);
    debitMerchantAvailable(db, user, req.body.amount, "Transfert wallet merchant vers compte principal", {
      source: "merchant_transfer"
    });
    creditUser(db, user, req.body.amount, "Transfert wallet merchant vers compte principal", {
      source: "merchant_transfer"
    });
    db.transactions.push({
      id: nanoid(),
      userId: user.id,
      type: "Merchant",
      description: "Transfert wallet merchant vers compte principal",
      amount: req.body.amount,
      displayAmount: formatAmount(req.body.amount, "+"),
      status: "Completed",
      createdAt: nowIso()
    });
    return { user };
  });

  if (result.error) return res.status(400).json({ message: result.error });
  res.json({ user: sanitizeUser(result.user) });
});

app.post("/api/disputes", authenticate, validate(z.object({
  reference: z.string().min(2),
  reason: z.string().min(2)
})), async (req, res) => {
  const dispute = await updateDb(async (db) => {
    const item = {
      id: nanoid(),
      userId: req.user.id,
      userEmail: req.user.email,
      reference: req.body.reference,
      reason: req.body.reason,
      type: "CICO",
      status: "open",
      createdAt: nowIso()
    };
    db.disputes.push(item);
    return item;
  });
  res.status(201).json({ dispute });
  notifyAdmin("AFRIX - Nouveau litige", "Nouveau litige", "Un utilisateur a ouvert un litige.", [
    { label: "Utilisateur", value: req.user.email },
    { label: "Référence", value: dispute.reference },
    { label: "Motif", value: dispute.reason }
  ]).catch((error) => logger.error({ err: error }, "Dispute notification failed"));
});

app.get("/api/transactions/export", authenticate, (req, res) => {
  const rows = req.db.transactions.filter((tx) => req.user.role === "admin" || tx.userId === req.user.id);
  const csv = [
    "date,type,description,amount,status",
    ...rows.map((tx) => [tx.createdAt.slice(0, 10), tx.type, tx.description, tx.displayAmount, tx.status]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
  ].join("\n");
  res.type("text/csv").send(csv);
});

app.post("/api/admin/settings", authenticate, requireAdmin, validate(z.object({
  key: z.enum(["cicoMerchants", "merchantWhatsappRequired", "maintenanceMode"]),
  value: z.boolean()
})), async (req, res) => {
  const controls = await updateDb(async (db) => {
    db.platformControls[req.body.key] = req.body.value;
    return db.platformControls;
  });
  res.json({ platformControls: controls });
});

app.get("/api/admin/deposits/:id/proof", authenticate, requireAdmin, async (req, res) => {
  await ensureStorage();
  const tx = await TransactionModel.findOne({ id: req.params.id, type: "Depot" }).lean();
  const proof = tx?.metadata?.proof;
  if (!proof?.dataBase64) {
    return res.status(404).json({ message: "Capture de dépôt introuvable." });
  }
  res.json({
    id: tx.id,
    mimeType: proof.mimeType || "application/octet-stream",
    originalName: proof.originalName || proof.fileName || "preuve-depot",
    dataUrl: `data:${proof.mimeType || "application/octet-stream"};base64,${proof.dataBase64}`
  });
});

app.post("/api/admin/actions", authenticate, requireAdmin, validate(z.object({
  action: z.string().min(1),
  id: z.string().optional(),
  amount: z.coerce.number().positive().optional(),
  email: z.string().email().optional(),
  password: z.string().min(10).optional(),
  fullName: z.string().min(2).optional(),
  role: z.enum(["user", "admin"]).optional(),
  status: z.enum(["active", "blocked"]).optional()
})), async (req, res) => {
  const result = await updateDb(async (db) => {
    const { action, id, amount } = req.body;

    if (action === "user-create") {
      const email = String(req.body.email || "").trim().toLowerCase();
      const password = String(req.body.password || "");
      if (!email || !password) return { error: "Email et mot de passe requis." };
      if (db.users.some((candidate) => candidate.email === email)) {
        return { error: "Cet email est deja enregistre." };
      }

      const user = {
        id: nanoid(),
        email,
        fullName: String(req.body.fullName || email.split("@")[0]).trim(),
        passwordHash: await bcrypt.hash(password, 12),
        role: req.body.role || "user",
        status: "active",
        balance: 0,
        reservedBalance: 0,
        activity: 0,
        bonus: 0,
        wallet: "",
        refCode: `AFX-${nanoid(8).toUpperCase()}`,
        referrerId: null,
        merchantWallet: { available: 0, pending: 0, bonus: 0 },
        activePlans: [],
        createdAt: nowIso(),
        metadata: { createdByAdmin: req.user.id }
      };
      db.users.push(user);
      addTransaction(db, {
        userId: user.id,
        type: "Admin",
        description: "Compte cree par admin",
        amount: 0,
        displayAmount: formatAmount(0),
        status: "Completed",
        metadata: { reviewedBy: req.user.id, source: "admin_user_create" }
      });
      return { user: sanitizeUser(user) };
    }

    if (action === "user-suspend" || action === "user-reactivate" || action === "user-role") {
      const target = db.users.find((candidate) => candidate.id === id);
      if (!target) return { error: "Utilisateur introuvable." };
      if (target.id === req.user.id && action === "user-suspend") {
        return { error: "Un admin ne peut pas suspendre son propre compte." };
      }
      if (action === "user-suspend") {
        target.status = "blocked";
        target.suspendedAt = nowIso();
        target.suspendedBy = req.user.id;
      }
      if (action === "user-reactivate") {
        target.status = "active";
        target.reactivatedAt = nowIso();
        target.reactivatedBy = req.user.id;
      }
      if (action === "user-role") {
        target.role = req.body.role || "user";
        target.roleUpdatedAt = nowIso();
        target.roleUpdatedBy = req.user.id;
      }
      return { user: sanitizeUser(target) };
    }

    if (action === "merchant-approve" || action === "merchant-reject") {
      const application = db.merchantApplications.find((item) => item.id === id);
      if (!application) return { error: "Demande merchant introuvable." };
      const user = db.users.find((candidate) => candidate.id === application.userId);
      application.status = action === "merchant-approve" ? "approved" : "rejected";
      if (user) {
        user.merchantProfile = {
          ...application,
          status: application.status,
          rating: application.status === "approved" ? "Actif" : "Rejete",
          limits: `10 - ${application.guarantee.toLocaleString("fr-FR")} USDT`
        };
        user.merchantWallet = user.merchantWallet || { available: 0, pending: 0, bonus: 0 };
        user.merchantProfile.guaranteeRequired = money(application.guarantee);
      }
      return { application };
    }

    if (action === "merchant-fund") {
      const application = db.merchantApplications.find((item) => item.id === id);
      const user = db.users.find((candidate) => candidate.id === id || candidate.id === application?.userId);
      if (!user || user.merchantProfile?.status !== "approved") return { error: "Merchant approuve introuvable." };
      creditMerchantAvailable(db, user, amount, "Approvisionnement wallet merchant", {
        source: "admin_merchant_funding",
        referenceId: id,
        extra: { reviewedBy: req.user.id }
      });
      addTransaction(db, {
        userId: user.id,
        type: "Merchant",
        description: "Approvisionnement wallet merchant",
        amount,
        displayAmount: formatAmount(amount, "+"),
        status: "Completed",
        metadata: { reviewedBy: req.user.id, source: "admin_merchant_funding" }
      });
      return { merchant: sanitizeUser(user) };
    }

    if (action === "dispute-close") {
      const dispute = db.disputes.find((item) => item.id === id || item.reference === id);
      if (!dispute) return { error: "Litige introuvable." };
      dispute.status = "closed";
      dispute.closedAt = nowIso();
      return { dispute };
    }

    if (action === "approve" || action === "reject") {
      const tx = db.transactions.find((item) => item.id === id);
      if (!tx) return { error: "Transaction introuvable." };
      if (tx.status === "Completed" || tx.status === "Rejected") return { error: "Transaction deja traitee." };
      const user = db.users.find((candidate) => candidate.id === tx.userId);
      tx.status = action === "approve" ? "Completed" : "Rejected";
      tx.metadata = { ...(tx.metadata || {}), reviewedAt: nowIso(), reviewedBy: req.user.id };
      if (user && tx.type === "Depot") {
        if (action === "approve") {
          creditUser(db, user, tx.amount, tx.description || "Depot approuve", {
            source: "admin_deposit_approval",
            referenceId: tx.id
          });
        }
      }
      if (user && tx.type === "Retrait") {
        const reservedAmount = money(tx.metadata.reservedAmount || tx.amount);
        if (action === "approve") {
          if (money(user.reservedBalance) >= reservedAmount) {
            consumeReservedFunds(db, user, reservedAmount, tx.description || "Retrait approuve", {
              source: "admin_withdrawal_approval",
              referenceId: tx.id
            });
          }
        } else if (money(user.reservedBalance) >= reservedAmount) {
          releaseReservedFunds(db, user, reservedAmount, tx.description || "Retrait rejete", {
            source: "admin_withdrawal_rejection",
            referenceId: tx.id
          });
        } else {
          creditUser(db, user, tx.amount, `${tx.description || "Retrait"} - remboursement`, {
            source: "admin_withdrawal_rejection_legacy",
            referenceId: tx.id
          });
        }
      }
      return { transaction: tx };
    }

    return { error: "Action admin inconnue." };
  });

  if (result.error) return res.status(400).json({ message: result.error });
  res.json(result);
  notifyAdmin("AFRIX - Action admin executee", "Action admin executee", "Une action admin vient d'etre appliquee.", [
    { label: "Action", value: req.body.action },
    { label: "Identifiant", value: req.body.id || "" }
  ]).catch((error) => logger.error({ err: error }, "Admin action notification failed"));
});

app.use("/assets", express.static(path.join(rootDir, "assets"), {
  fallthrough: false,
  index: false,
  maxAge: isProduction ? "1d" : 0
}));

app.get([...publicFiles], (req, res) => {
  res.sendFile(path.join(rootDir, req.path.slice(1)));
});

app.use((req, res, next) => {
  if (req.method === "GET") {
    const cleanPath = req.path.replace(/\/+$/, "") || "/";
    const target = legacyPageRoutes.get(cleanPath);
    if (target) {
      res.redirect(301, `${target}${req.url.includes("?") ? `?${req.url.split("?").slice(1).join("?")}` : ""}`);
      return;
    }
  }
  next();
});

app.use((req, res, next) => {
  if (req.method === "GET") {
    const cleanPath = req.path.replace(/\/+$/, "") || "/";
    if (pageRoutes[cleanPath]) {
      res.sendFile(path.join(rootDir, pageRoutes[cleanPath]));
      return;
    }
  }
  next();
});

app.use((err, _req, res, _next) => {
  if (isBusinessRuleError(err)) {
    return res.status(400).json({ message: err.message });
  }
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ message: "Preuve de paiement trop lourde. Taille maximale: 5 Mo." });
    }
    return res.status(400).json({ message: "Preuve de paiement invalide." });
  }
  logger.error(err);
  res.status(500).json({ message: "Erreur serveur." });
});

function runDailyPlanEarnings() {
  processDailyPlanEarnings()
    .then((result) => {
      if (result.creditedUsers) logger.info(result, "Daily plan earnings processed");
    })
    .catch((error) => logger.error({ err: error }, "Daily plan earnings failed"));
}

async function bootstrapServer() {
  const skipStorageBoot = !isProduction && process.env.AFRIX_TEST_SKIP_STORAGE_BOOT === "1";
  if (!skipStorageBoot) {
    await ensureStorage();
    await ensureAdminUser();
  } else {
    logger.warn("Storage bootstrap skipped for local smoke test");
  }

  app.listen(PORT, () => {
    logger.info(`AFRIX server listening on http://localhost:${PORT}`);
  });

  const initialPlanEarningsTimer = setTimeout(runDailyPlanEarnings, 5 * 60 * 1000);
  initialPlanEarningsTimer.unref?.();
  const planEarningsTimer = setInterval(runDailyPlanEarnings, 6 * 60 * 60 * 1000);
  planEarningsTimer.unref?.();
}

bootstrapServer().catch((error) => {
  logger.error({ err: error }, "Server bootstrap failed");
  process.exit(1);
});
