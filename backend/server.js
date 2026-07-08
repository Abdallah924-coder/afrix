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
  COMMISSION_DEVELOPER_EMAIL,
  COMMISSION_DEVELOPER_NAME,
  COMMISSION_DEVELOPER_PASSWORD,
  GRSCOIN_CONTRACT_ADDRESS,
  GRSCOIN_DEPOSIT_ADDRESS,
  GRSCOIN_PRICE_USDT,
  GRSCOIN_USDT_BEP20_DEPOSIT_ADDRESS,
  MONGODB_URI,
  PLATFORM_EMAIL,
  PLATFORM_NAME,
  PLATFORM_PASSWORD,
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
  stakingPlans,
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
let storageReadyPromise = null;
let dailyEarningsPromise = null;
const transactionListProjection = { "metadata.proof.dataBase64": 0 };
const PLAN_EARNINGS_INTERVAL_MS = 60 * 1000;
const PLAN_PAYOUT_INTERVAL_MS = 86_400_000;
const GRSCOIN_SWAP_FEE_RATE = 0.05;
const GRSCOIN_WITHDRAWAL_FEE_RATE = 0.10;
const GRSCOIN_SWAP_ADMIN_RATE = 0.02;
const GRSCOIN_SWAP_DEVELOPER_RATE = 0.02;
const GRSCOIN_SWAP_PLATFORM_RATE = 0.01;
const GRSCOIN_SWAP_BONUS_RATES = [0.05, 0.02, 0.01, 0.01, 0.01];
const GRSCOIN_REFERRAL_RATES = [0.05, 0.02, 0.01, 0.01, 0.01];
const STAKING_ADMIN_COMMISSION_RATE = 0.03;
const STAKING_DEVELOPER_COMMISSION_RATE = 0.03;
const STAKING_PLATFORM_COMMISSION_RATE = 0.04;
const GRSCOIN_TOTAL_SUPPLY = 4_200_000;
const ADMIN_RECENT_TRANSACTIONS_LIMIT = 500;
const ADMIN_RECENT_LEDGER_LIMIT = 500;
const safeUserProjection = {
  passwordHash: 0,
  password: 0,
  resetPasswordToken: 0,
  resetPasswordExpires: 0
};

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
    grsBalance: money(user.grsBalance),
    reservedBalance: money(user.reservedBalance),
    activity: money(user.activity),
    bonus: money(user.bonus),
    merchantWallet: {
      available: money(user.merchantWallet?.available),
      pending: money(user.merchantWallet?.pending),
      bonus: money(user.merchantWallet?.bonus)
    },
    activePlans: Array.isArray(user.activePlans) ? user.activePlans : [],
    activeStakes: Array.isArray(user.activeStakes) ? user.activeStakes : []
  };
}

async function ensureStorage() {
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is required. AFRIX stores application data in MongoDB only.");
  }

  try {
    if (!storageReadyPromise) {
      storageReadyPromise = (async () => {
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
          SettingModel.updateOne({ key: "dailyPlanEarningsLock" }, { $setOnInsert: { value: null } }, { upsert: true }),
          PlatformAccountModel.updateOne({ id: "platform" }, { $setOnInsert: { ...defaultDb.platformAccount, createdAt: nowIso() } }, { upsert: true })
        ]);
      })();
    }
    await storageReadyPromise;
  } catch (error) {
    mongoReadyPromise = null;
    storageReadyPromise = null;
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
    transactions = await TransactionModel.find({}, {}, queryOptions).lean();
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

async function readUserViewDb(user) {
  if (canUseBackoffice(user)) return readAdminViewDb();
  await ensureStorage();

  const directPartnerQuery = {
    $or: [
      { referrerId: user.id },
      { referrerEmail: normalizeEmail(user.email) },
      { referrerCode: normalizeInvitationCode(user.refCode) }
    ].filter((clause) => Object.values(clause)[0])
  };
  const issuedGrsQuery = {
    $or: [
      { type: "Swap", status: { $in: ["Completed", "Active"] } },
      { "metadata.asset": "GRSC_PURCHASE", status: { $in: ["Completed", "Active"] } }
    ]
  };

  const [
    directPartners,
    userTransactions,
    issuedGrsTotals
  ] = await Promise.all([
    directPartnerQuery.$or.length ? UserModel.find(directPartnerQuery).lean() : [],
    TransactionModel.find({ userId: user.id }, transactionListProjection).sort({ createdAt: -1 }).limit(300).lean(),
    TransactionModel.aggregate([
      { $match: issuedGrsQuery },
      { $group: { _id: null, issuedSupply: { $sum: { $toDouble: { $ifNull: ["$metadata.grsAmount", 0] } } } } }
    ])
  ]);

  const userMap = new Map();
  [user, ...directPartners].forEach((candidate) => {
    if (candidate?.id) userMap.set(candidate.id, candidate);
  });
  const transactionMap = new Map();
  userTransactions.forEach((tx) => {
    if (tx?.id) transactionMap.set(tx.id, tx);
  });

  return normalizeDb({
    users: Array.from(userMap.values()),
    transactions: Array.from(transactionMap.values()),
    marketStats: {
      issuedGrsSupply: money(issuedGrsTotals[0]?.issuedSupply || 0)
    },
    cicoRequests: [],
    exchangeAds: [],
    exchangeOrders: [],
    merchantApplications: [],
    disputes: [],
    ledgerEntries: [],
    passwordResetTokens: defaultDb.passwordResetTokens,
    platformAccount: defaultDb.platformAccount,
    platformControls: defaultDb.platformControls,
    paymentTargets: defaultDb.paymentTargets
  });
}

async function readAdminViewDb() {
  await ensureStorage();

  const [
    users,
    transactions,
    cicoRequests,
    exchangeAds,
    exchangeOrders,
    merchantApplications,
    disputes,
    ledgerEntries,
    settings,
    platformAccount
  ] = await Promise.all([
    UserModel.find({}, safeUserProjection).lean(),
    TransactionModel.find({}, transactionListProjection).sort({ createdAt: -1 }).limit(ADMIN_RECENT_TRANSACTIONS_LIMIT).lean(),
    CicoRequestModel.find({}).sort({ createdAt: -1 }).limit(ADMIN_RECENT_TRANSACTIONS_LIMIT).lean(),
    ExchangeAdModel.find({}).sort({ createdAt: -1 }).limit(ADMIN_RECENT_TRANSACTIONS_LIMIT).lean(),
    ExchangeOrderModel.find({}).sort({ createdAt: -1 }).limit(ADMIN_RECENT_TRANSACTIONS_LIMIT).lean(),
    MerchantApplicationModel.find({}).sort({ createdAt: -1 }).limit(ADMIN_RECENT_TRANSACTIONS_LIMIT).lean(),
    DisputeModel.find({}).sort({ createdAt: -1 }).limit(ADMIN_RECENT_TRANSACTIONS_LIMIT).lean(),
    LedgerEntryModel.find({}).sort({ createdAt: -1 }).limit(ADMIN_RECENT_LEDGER_LIMIT).lean(),
    SettingModel.find({}).lean(),
    PlatformAccountModel.findOne({ id: "platform" }).lean()
  ]);
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
    passwordResetTokens: defaultDb.passwordResetTokens,
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
        if (result?.skipWrite) return;
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

function canViewTransaction(user, tx) {
  if (tx.type === "Commission") return tx.userId === user.id;
  return user.role === "admin" || tx.userId === user.id;
}

function buildAdminStats(db) {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setUTCDate(startOfDay.getUTCDate() - 6);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const userCreatedAt = (user) => new Date(user.createdAt || 0).getTime();
  const transactions = db.transactions || [];
  const users = db.users || [];
  const activePlans = users.flatMap((user) => (user.activePlans || []).filter((plan) => plan.status === "active"));
  const completedTransactions = transactions.filter((tx) => tx.status === "Completed" || tx.status === "Active");
  const platformRevenue = completedTransactions.reduce((total, tx) => {
    if (tx.type === "Retrait") return total + Number(tx.metadata?.fee || 0);
    if (tx.type === "P2P" && tx.displayAmount?.startsWith("-")) return total + Number(tx.metadata?.fee || 0);
    return total;
  }, 0);
  const countries = new Set(users.map((user) => String(user.country || "").trim()).filter(Boolean));

  return {
    totalUsers: users.length,
    newUsersToday: users.filter((user) => userCreatedAt(user) >= startOfDay.getTime()).length,
    newUsersWeek: users.filter((user) => userCreatedAt(user) >= startOfWeek.getTime()).length,
    newUsersMonth: users.filter((user) => userCreatedAt(user) >= startOfMonth.getTime()).length,
    activeUsers: users.filter((user) => (user.status || "active") === "active").length,
    activePlansCount: activePlans.length,
    usersWithActivePlans: users.filter((user) => (user.activePlans || []).some((plan) => plan.status === "active")).length,
    investedCapital: money(activePlans.reduce((total, plan) => total + Number(plan.amount || 0), 0)),
    transactionVolume: money(completedTransactions.reduce((total, tx) => total + Math.abs(Number(tx.amount || 0)), 0)),
    platformBalance: money(platformRevenue),
    platformRevenue: money(platformRevenue),
    partners: users.filter((user) => user.referrerId).length,
    approvedMerchants: users.filter((user) => user.merchantProfile?.status === "approved").length,
    activeCountries: countries.size
  };
}

function notifyTransactionDecision(tx) {
  if (!tx || tx.status !== "Completed") return;
  UserModel.findOne({ id: tx.userId }).lean()
    .then((owner) => {
      if (!owner?.email) return null;
      if (tx.type === "Depot") {
        return sendBrevoMail({
          to: owner.email,
          subject: "AFRIX - Depot confirme",
          title: "Votre depot est confirme",
          intro: "Votre solde AFRIX vient d'etre credite.",
          rows: [
            { label: "Montant", value: formatAmount(tx.amount) },
            { label: "Reference", value: tx.id },
            { label: "Statut", value: tx.status }
          ]
        });
      }
      if (tx.type === "Retrait") {
        return sendBrevoMail({
          to: owner.email,
          subject: "AFRIX - Retrait valide",
          title: "Votre retrait est valide",
          intro: "Votre demande de retrait vient d'etre validee.",
          rows: [
            { label: "Montant demande", value: formatAmount(tx.amount) },
            { label: "Frais", value: formatAmount(tx.metadata?.fee || 0) },
            { label: "Net a recevoir", value: formatAmount(tx.metadata?.netAmount || tx.amount) },
            { label: "Reference", value: tx.id }
          ]
        });
      }
      return null;
    })
    .catch((error) => logger.error({ err: error }, "Transaction decision email failed"));
}

function notifyPlanActivation(user, activePlan, amount) {
  notifyAdmin("AFRIX - Plan active", "Plan active", "Un investissement vient d'etre active.", [
    { label: "Utilisateur", value: user.email },
    { label: "Plan", value: activePlan?.name },
    { label: "Montant", value: formatAmount(amount || activePlan?.amount || 0) },
    { label: "Cycle", value: `${activePlan?.durationDays || 0} jours` }
  ]).catch((error) => logger.error({ err: error }, "Plan activation admin email failed"));
}

async function creditPlatformUserFee({ amount, description, source, referenceId, extra = {}, session = null }) {
  const fee = money(amount);
  if (!PLATFORM_EMAIL || fee <= 0) return null;
  const options = session ? { session, new: true, lean: true } : { new: true, lean: true };
  const platformUser = await UserModel.findOneAndUpdate(
    { email: PLATFORM_EMAIL },
    [{
      $set: {
        balance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$balance", 0] } }, fee] }, 2] }
      }
    }],
    options
  );
  if (!platformUser) return null;
  await TransactionModel.create([{
    id: nanoid(),
    userId: platformUser.id,
    type: "Frais",
    description,
    amount: fee,
    displayAmount: formatAmount(fee, "+"),
    status: "Completed",
    createdAt: nowIso(),
    metadata: { source, referenceId, ...extra }
  }], session ? { session } : undefined);
  return platformUser;
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

function normalizeInvitationCode(value = "") {
  let code = String(value || "").trim();
  if (!code) return "";
  try {
    const parsedUrl = new URL(code, APP_URL);
    code = parsedUrl.searchParams.get("ref") || parsedUrl.searchParams.get("code") || code;
  } catch {
    // The value is usually just the code, not a full URL.
  }
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function stableRefCodeFromEmail(email = "") {
  const normalizedEmail = normalizeEmail(email);
  const digest = createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 8).toUpperCase();
  return `AFX-${digest}`;
}

function referralMatches(candidate, sponsor) {
  const candidateReferrerId = String(candidate?.referrerId || "");
  const sponsorId = String(sponsor?.id || "");
  const candidateReferrerEmail = normalizeEmail(candidate?.referrerEmail);
  const sponsorEmail = normalizeEmail(sponsor?.email);
  const candidateReferrerCode = normalizeInvitationCode(candidate?.referrerCode);
  const sponsorRefCode = normalizeInvitationCode(sponsor?.refCode);
  return Boolean(
    (candidateReferrerId && sponsorId && candidateReferrerId === sponsorId) ||
    (candidateReferrerEmail && sponsorEmail && candidateReferrerEmail === sponsorEmail) ||
    (candidateReferrerCode && sponsorRefCode && candidateReferrerCode === sponsorRefCode)
  );
}

async function findUserByReferralPointer(pointer = {}, session = null) {
  const clauses = [];
  if (pointer.id) clauses.push({ id: String(pointer.id) });
  if (pointer.email) clauses.push({ email: normalizeEmail(pointer.email) });
  if (pointer.code) clauses.push({ refCode: normalizeInvitationCode(pointer.code) });
  if (!clauses.length) return null;
  return normalizeUserRecord(await UserModel.findOne({ $or: clauses }, null, session ? { session } : {}).lean());
}

function parsePlan(planName) {
  const normalized = String(planName || "").toLowerCase();
  if (normalized.includes("starter")) return plans[0];
  if (normalized.includes("smart")) return plans[1];
  if (normalized.includes("premium")) return plans[2];
  if (normalized.includes("elite")) return plans[3];
  return plans.find((plan) => plan.id === normalized) || null;
}

function parseStakingPlan(planName) {
  const normalized = String(planName || "").toLowerCase();
  if (normalized.includes("starter")) return stakingPlans[0];
  if (normalized.includes("smart")) return stakingPlans[1];
  if (normalized.includes("premium")) return stakingPlans[2];
  if (normalized.includes("elite")) return stakingPlans[3];
  return stakingPlans.find((plan) => plan.id === normalized) || null;
}

function planForAmount(amount) {
  amount = money(amount);
  return plans
    .slice()
    .sort((a, b) => b.minAmount - a.minAmount)
    .find((plan) => amount >= plan.minAmount) || null;
}

const planUnlockRules = {
  smart: { requiredStakePlanId: "smart", requiredAmount: 5000, requiredName: "Smart Staking" },
  premium: { requiredStakePlanId: "premium", requiredAmount: 25000, requiredName: "Premium Staking" },
  elite: { requiredStakePlanId: "elite", requiredAmount: 50000, requiredName: "Elite Staking" }
};

function stakingActivity(user, stakePlanId = "") {
  return (Array.isArray(user.activeStakes) ? user.activeStakes : [])
    .filter((stake) => !stakePlanId || stake.planId === stakePlanId)
    .reduce((total, stake) => money(total + Number(stake.amount || 0)), 0);
}

function planUnlockError(user, plan) {
  const rule = planUnlockRules[plan.id];
  if (!rule) return "";
  const currentActivity = stakingActivity(user, rule.requiredStakePlanId);
  if (currentActivity >= rule.requiredAmount) return "";
  return `${plan.name} verrouille. Il faut ${rule.requiredAmount.toLocaleString("fr-FR")} GRSC de participation dans ${rule.requiredName}. Participation actuelle: ${currentActivity.toFixed(2)} GRSC.`;
}

function unlockedReferralLevels(user) {
  return Math.max(0, Math.min(20, Math.max(
    Math.floor(Number(user?.activity || 0) / 100),
    Number(user?.bonusLevelsOverride || 0)
  )));
}

function grsIssuedSupply(db = {}) {
  if (Number.isFinite(Number(db.marketStats?.issuedGrsSupply))) {
    return money(db.marketStats.issuedGrsSupply);
  }
  return money((db.transactions || []).reduce((total, tx) => {
    const isCompleted = tx.status === "Completed" || tx.status === "Active";
    const isIssued = tx.type === "Swap" || tx.metadata?.asset === "GRSC_PURCHASE";
    if (!isCompleted || !isIssued) return total;
    return total + Number(tx.metadata?.grsAmount || 0);
  }, 0));
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
  return country === "congo brazzaville" ||
    country === "republique du congo" ||
    country === "congo" ||
    country === "cg" ||
    country.includes("republique du congo");
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

function formatTransactionDateTime(value) {
  const date = new Date(value || 0);
  if (!Number.isFinite(date.getTime())) return String(value || "").slice(0, 10);
  const day = date.toISOString().slice(0, 10);
  const time = date.toISOString().slice(11, 16);
  return `${day} ${time}`;
}

function fullDaysBetweenTimestamps(startValue, endValue = nowIso()) {
  const start = Date.parse(startValue);
  const end = Date.parse(endValue);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor((end - start) / 86_400_000);
}

function addDaysToTimestamp(value, days) {
  const start = Date.parse(value);
  if (!Number.isFinite(start)) return nowIso();
  return new Date(start + (Number(days || 0) * PLAN_PAYOUT_INTERVAL_MS)).toISOString();
}

function planLastPayoutTimestamp(plan = {}) {
  if (plan.lastPayoutAt) return plan.lastPayoutAt;
  if (Number(plan.daysPaid || 0) > 0 && plan.lastPayoutDate) return `${String(plan.lastPayoutDate).slice(0, 10)}T00:00:00.000Z`;
  return plan.activatedAt || `${String(plan.lastPayoutDate || today()).slice(0, 10)}T00:00:00.000Z`;
}

function planNextPayoutTimestamp(plan = {}) {
  if (plan.nextPayoutAt) return plan.nextPayoutAt;
  return addDaysToTimestamp(planLastPayoutTimestamp(plan), 1);
}

function duePayoutSlots(nextPayoutAt, endValue = nowIso()) {
  const next = Date.parse(nextPayoutAt);
  const end = Date.parse(endValue);
  if (!Number.isFinite(next) || !Number.isFinite(end) || end < next) return 0;
  return Math.floor((end - next) / PLAN_PAYOUT_INTERVAL_MS) + 1;
}

function positiveFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function grsFromUsdt(usdtAmount) {
  if (!GRSCOIN_PRICE_USDT) return 0;
  return money(Number(usdtAmount || 0) / GRSCOIN_PRICE_USDT);
}

function composeUser(db, user) {
  const directPartners = db.users
    .filter((candidate) => referralMatches(candidate, user))
    .map((candidate) => ({
      fullName: candidate.fullName || candidate.email.split("@")[0],
      email: candidate.email,
      activity: candidate.activity,
      referrerId: candidate.referrerId || "",
      referrerEmail: candidate.referrerEmail || "",
      referrerCode: candidate.referrerCode || ""
    }));

  const approvedMerchants = db.users
    .filter((candidate) => candidate.merchantProfile?.status === "approved")
    .map((candidate) => candidate.merchantProfile);
  const issuedGrsSupply = grsIssuedSupply(db);
  const remainingGrsSupply = Math.max(0, money(GRSCOIN_TOTAL_SUPPLY - issuedGrsSupply));

  const ownCicoRequests = canUseBackoffice(user)
    ? db.cicoRequests
    : db.cicoRequests.filter((request) => request.userId === user.id || request.merchantId === user.id);
  const ownExchangeOrders = canUseBackoffice(user)
    ? db.exchangeOrders
    : db.exchangeOrders.filter((order) => order.userId === user.id || order.merchantId === user.id || order.customerEmail === user.email);
  const ownExchangeAds = db.exchangeAds
    .filter((ad) => canUseBackoffice(user) || ad.merchantId === user.id)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  return {
    ...sanitizeUser(user),
    balance: money(user.balance),
    grsBalance: money(user.grsBalance),
    reservedBalance: money(user.reservedBalance),
    activity: money(user.activity),
    team: directPartners.length,
    bonus: money(user.bonus),
    rank: rankFromActivity(user.activity),
    progress: progressFromActivity(user.activity),
    progressText: "Progression calculee selon votre activite validee.",
    bonusLevelsOverride: Number(user.bonusLevelsOverride || 0),
    paymentTargets: db.paymentTargets,
    swap: {
      grsCoinPriceUsdt: GRSCOIN_PRICE_USDT,
      grsCoinPerUsdt: grsFromUsdt(1),
      direction: "USDT_GRSC",
      contractAddress: GRSCOIN_CONTRACT_ADDRESS,
      grsDepositAddress: GRSCOIN_DEPOSIT_ADDRESS,
      usdtBep20DepositAddress: GRSCOIN_USDT_BEP20_DEPOSIT_ADDRESS,
      swapFeeRate: GRSCOIN_SWAP_FEE_RATE,
      bonusRate: money(GRSCOIN_SWAP_BONUS_RATES.reduce((total, rate) => total + rate, 0)),
      bonusLevelsCount: GRSCOIN_SWAP_BONUS_RATES.length,
      market: {
        totalSupply: GRSCOIN_TOTAL_SUPPLY,
        issuedSupply: issuedGrsSupply,
        remainingSupply: remainingGrsSupply,
        issuedPercent: GRSCOIN_TOTAL_SUPPLY ? Math.min(100, Math.max(0, (issuedGrsSupply / GRSCOIN_TOTAL_SUPPLY) * 100)) : 0
      }
    },
    refLink: `${process.env.APP_URL || "http://localhost:" + PORT}/register?ref=${user.refCode}`,
    transactions: db.transactions
      .filter((tx) => tx.userId === user.id)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .map((tx) => ({
        id: tx.id,
        date: formatTransactionDateTime(tx.createdAt),
        type: tx.type,
        description: tx.description,
        amount: tx.displayAmount,
        status: tx.status
      })),
    adminTransactions: canUseBackoffice(user)
      ? db.transactions
        .filter((tx) => canViewTransaction(user, tx))
        .slice()
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .map((tx) => {
          const owner = db.users.find((candidate) => candidate.id === tx.userId);
          return {
            id: tx.id,
            reference: tx.id,
            userId: tx.userId,
            userEmail: owner?.email || "",
            date: formatTransactionDateTime(tx.createdAt),
            type: tx.type,
            description: tx.description,
            amount: tx.displayAmount,
            rawAmount: money(tx.amount),
            status: tx.status,
            hasProof: Boolean(tx.metadata?.proof?.dataBase64 || tx.metadata?.proof?.mimeType),
            metadata: {
              method: tx.metadata?.method || "",
              txRef: tx.metadata?.txRef || "",
              address: tx.metadata?.address || "",
              phone: tx.metadata?.phone || "",
              beneficiary: tx.metadata?.beneficiary || "",
              fee: money(tx.metadata?.fee),
              netAmount: money(tx.metadata?.netAmount),
              reservedAmount: money(tx.metadata?.reservedAmount),
              reference: tx.metadata?.reference || "",
              localAmount: money(tx.metadata?.localAmount),
              rate: money(tx.metadata?.rate),
              paymentMethod: tx.metadata?.paymentMethod || "",
              asset: tx.metadata?.asset || "",
              grsAmount: money(tx.metadata?.grsAmount),
              priceUsdt: money(tx.metadata?.priceUsdt)
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
    adminExchangeOrders: canUseBackoffice(user)
      ? db.exchangeOrders
        .slice()
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      : [],
    merchantApplications: canUseBackoffice(user) ? db.merchantApplications : db.merchantApplications.filter((item) => item.userId === user.id),
    disputes: canUseBackoffice(user) ? db.disputes : db.disputes.filter((item) => item.userId === user.id),
    platformControls: canUseBackoffice(user) ? db.platformControls : {}
    ,
    adminUsers: canUseBackoffice(user)
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
          bonusLevelsOverride: Number(candidate.bonusLevelsOverride || 0),
          referrerId: candidate.referrerId || "",
          referrerEmail: candidate.referrerEmail || "",
          referrerCode: candidate.referrerCode || "",
          activePlansCount: (candidate.activePlans || []).filter((plan) => plan.status === "active").length,
          merchantStatus: candidate.merchantProfile?.status || "Aucun profil",
          createdAt: candidate.createdAt
        }))
      : [],
    ledgerEntries: canUseBackoffice(user)
      ? db.ledgerEntries.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500)
      : db.ledgerEntries.filter((entry) => entry.accountId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200),
    platformAccount: canUseBackoffice(user) ? ensurePlatform(db) : {},
    adminStats: canUseBackoffice(user) ? buildAdminStats(db) : {}
  };
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ message: "Authentification requise." });

  try {
    const payload = jwt.verify(token, jwtSecret);
    await ensureStorage();
    const user = normalizeUserRecord(await UserModel.findOne({ id: payload.sub }).lean());
    if (!user || user.status === "blocked") return res.status(401).json({ message: "Session invalide." });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Session expiree." });
  }
}

async function attachDb(req, res, next) {
  try {
    req.db = await readDb();
    next();
  } catch (error) {
    next(error);
  }
}

function canUseBackoffice(user) {
  return user?.role === "admin" || user?.role === "developer";
}

function requireAdmin(req, res, next) {
  if (!canUseBackoffice(req.user)) return res.status(403).json({ message: "Acces backoffice requis." });
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
  return async (req, res, next) => {
    try {
      await ensureStorage();
      const setting = await SettingModel.findOne({ key: "platformControls" }).lean();
      const controls = { ...defaultDb.platformControls, ...(setting?.value || {}) };
      if (controls.maintenanceMode && req.user?.role !== "admin") {
        return res.status(503).json({ message: "AFRIX est temporairement en maintenance." });
      }
      if (cico && controls.cicoMerchants === false && req.user?.role !== "admin") {
        return res.status(403).json({ message: "Les operations CICO merchant sont temporairement indisponibles." });
      }
      next();
    } catch (error) {
      next(error);
    }
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

function distributeHouseCommissions(db, sourceUser, amount) {
  const recipients = [
    {
      email: ADMIN_EMAIL,
      rate: 0.075,
      label: "Commission admin",
      source: "admin_activation_commission"
    },
    {
      email: COMMISSION_DEVELOPER_EMAIL,
      rate: 0.075,
      label: "Commission developpeur",
      source: "developer_activation_commission"
    }
  ];

  recipients.forEach((recipient) => {
    if (!recipient.email) return;
    const account = db.users.find((user) => String(user.email || "").toLowerCase() === recipient.email);
    if (!account) return;
    const commission = money(amount * recipient.rate);
    if (commission <= 0) return;
    debitPlatform(db, commission, `${recipient.label} activation plan`, {
      source: `${recipient.source}_payout`,
      referenceId: sourceUser.id,
      extra: { sourceUserId: sourceUser.id, rate: recipient.rate }
    });
    creditUser(db, account, commission, `${recipient.label} activation plan`, {
      source: recipient.source,
      referenceId: sourceUser.id,
      extra: { sourceUserId: sourceUser.id, rate: recipient.rate }
    });
    addTransaction(db, {
      userId: account.id,
      type: "Commission",
      description: `${recipient.label} activation plan`,
      amount: commission,
      displayAmount: formatAmount(commission, "+"),
      status: "Completed",
      metadata: { sourceUserId: sourceUser.id, rate: recipient.rate, source: recipient.source }
    });
  });
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

function creditDailyNetworkBonuses(db, sourceUser, plan, payout, dueDays, payoutDate) {
  let creditedAmount = 0;
  let creditedCount = 0;
  let currentReferrer = { id: sourceUser.referrerId, email: sourceUser.referrerEmail, code: sourceUser.referrerCode };

  for (let level = 0; level < bonusRates.length && (currentReferrer.id || currentReferrer.email || currentReferrer.code); level += 1) {
    const referrer = db.users.find((user) => (
      (currentReferrer.id && user.id === currentReferrer.id) ||
      (currentReferrer.email && normalizeEmail(user.email) === normalizeEmail(currentReferrer.email)) ||
      (currentReferrer.code && normalizeInvitationCode(user.refCode) === normalizeInvitationCode(currentReferrer.code))
    ));
    if (!referrer) break;

    if (unlockedReferralLevels(referrer) > level) {
      const bonus = money((payout * bonusRates[level]) / 100);
      if (bonus > 0) {
        debitPlatform(db, bonus, `Bonus reseau journalier niveau ${level + 1}`, {
          source: "network_daily_bonus",
          referenceId: plan.id,
          extra: { sourceUserId: sourceUser.id, level: level + 1, activePlanId: plan.id, planId: plan.planId, days: dueDays, payoutDate }
        });
        creditUser(db, referrer, bonus, `Bonus reseau journalier niveau ${level + 1}`, {
          source: "network_daily_bonus",
          referenceId: plan.id,
          extra: { sourceUserId: sourceUser.id, level: level + 1, activePlanId: plan.id, planId: plan.planId, days: dueDays, payoutDate }
        });
        referrer.bonus = money(Number(referrer.bonus || 0) + bonus);
        addTransaction(db, {
          userId: referrer.id,
          type: "Bonus",
          description: `Bonus reseau journalier niveau ${level + 1} (${dueDays} jour${dueDays > 1 ? "s" : ""})`,
          amount: bonus,
          displayAmount: formatAmount(bonus, "+"),
          status: "Completed",
          metadata: { sourceUserId: sourceUser.id, level: level + 1, activePlanId: plan.id, planId: plan.planId, days: dueDays, payoutDate }
        });
        creditedAmount = money(creditedAmount + bonus);
        creditedCount += 1;
      }
    }

    currentReferrer = { id: referrer.referrerId, email: referrer.referrerEmail, code: referrer.referrerCode };
  }

  return { creditedAmount, creditedCount };
}

async function processDailyPlanEarnings(options = {}) {
  const onlyUserId = options.userId || "";
  const payoutDate = today();
  await ensureStorage();

  const users = await UserModel.find(
    {
      ...(onlyUserId ? { id: onlyUserId } : {}),
      $or: [
        { activePlans: { $elemMatch: { status: "active" } } },
        { activeStakes: { $elemMatch: { status: "active" } } }
      ]
    }
  ).lean();

  const result = {
    creditedUsers: 0,
    creditedAmount: 0,
    creditedNetworkBonuses: 0,
    creditedNetworkAmount: 0,
    completedPlans: 0,
    skippedInvalidPlans: 0,
    payoutDate
  };

  for (const userSnapshot of users) {
    const activePlans = Array.isArray(userSnapshot.activePlans) ? userSnapshot.activePlans : [];
    for (const planSnapshot of activePlans) {
      if (planSnapshot.status !== "active") continue;

      const amount = positiveFiniteNumber(planSnapshot.amount);
      const dailyRate = positiveFiniteNumber(planSnapshot.dailyRate);
      const durationDays = positiveFiniteNumber(planSnapshot.durationDays);
      if (!amount || !dailyRate || !durationDays) {
        result.skippedInvalidPlans += 1;
        logger.error({ userId: userSnapshot.id, planId: planSnapshot.id, amount: planSnapshot.amount, dailyRate: planSnapshot.dailyRate, durationDays: planSnapshot.durationDays }, "Invalid active plan skipped during daily earnings");
        continue;
      }

      const session = await mongoose.startSession();
      try {
        await withMongoRetry(() => session.withTransaction(async () => {
          const user = normalizeUserRecord(await UserModel.findOne({ id: userSnapshot.id }, null, { session }).lean());
          if (!user) return;
          const plansList = Array.isArray(user.activePlans) ? user.activePlans : [];
          const plan = plansList.find((item) => item.id === planSnapshot.id);
          if (!plan || plan.status !== "active") return;

          const currentDaysPaid = Math.max(0, Number.isFinite(Number(plan.daysPaid)) ? Number(plan.daysPaid) : 0);
          const currentAmount = positiveFiniteNumber(plan.amount);
          const currentDailyRate = positiveFiniteNumber(plan.dailyRate);
          const currentDurationDays = positiveFiniteNumber(plan.durationDays);
          if (!currentAmount || !currentDailyRate || !currentDurationDays || currentDaysPaid >= currentDurationDays) return;

          const nextPayoutAt = planNextPayoutTimestamp(plan);
          const dueDays = Math.min(duePayoutSlots(nextPayoutAt), currentDurationDays - currentDaysPaid);
          if (dueDays <= 0) return;

          const payout = money(currentAmount * currentDailyRate * dueDays);
          if (payout <= 0) return;

          const lastPayoutAt = addDaysToTimestamp(nextPayoutAt, dueDays - 1);
          const paidDayFrom = currentDaysPaid + 1;
          const paidDayTo = currentDaysPaid + dueDays;
          const paidDayLabel = paidDayFrom === paidDayTo ? `Jour ${paidDayTo}` : `Jours ${paidDayFrom}-${paidDayTo}`;
          plan.daysPaid = currentDaysPaid + dueDays;
          plan.earnedAmount = money(Number(plan.earnedAmount || 0) + payout);
          plan.lastPayoutAt = lastPayoutAt;
          plan.lastPayoutDate = String(lastPayoutAt).slice(0, 10);
          plan.nextPayoutAt = addDaysToTimestamp(nextPayoutAt, dueDays);
          if (plan.daysPaid >= currentDurationDays) {
            plan.status = "completed";
            plan.completedAt = nowIso();
          }

          const updatedBalance = money(Number(user.balance || 0) + payout);
          await UserModel.updateOne(
            { id: user.id },
            { $set: { balance: updatedBalance, activePlans: plansList } },
            { session }
          );

          const platform = await PlatformAccountModel.findOneAndUpdate(
            { id: "platform" },
            { $inc: { balance: -payout }, $setOnInsert: { createdAt: nowIso(), fees: 0 } },
            { upsert: true, new: true, session, lean: true }
          );

          const ledgerEntries = buildLedgerEntries([{
            accountType: "user",
            accountId: user.id,
            direction: "credit",
            amount: payout,
            balanceAfter: updatedBalance,
            description: `Gain journalier ${plan.name}`
          }, {
            accountType: "platform",
            accountId: "platform",
            direction: "debit",
            amount: payout,
            balanceAfter: platform.balance,
            description: `Gain journalier ${plan.name}`
          }], {
            source: "plan_daily_earning",
            referenceId: plan.id,
            extra: { userId: user.id, planId: plan.planId, days: dueDays, payoutDate }
          });
          if (ledgerEntries.length) await LedgerEntryModel.insertMany(ledgerEntries, { session });

          await TransactionModel.create([{
            id: nanoid(),
            userId: user.id,
            type: "Gain",
            description: `Gain journalier ${plan.name} (${paidDayLabel})`,
            amount: payout,
            displayAmount: formatAmount(payout, "+"),
            status: "Completed",
            createdAt: nowIso(),
            metadata: { planId: plan.planId, activePlanId: plan.id, days: dueDays, dayFrom: paidDayFrom, dayTo: paidDayTo, payoutDate }
          }], { session });

          let currentReferrer = { id: user.referrerId, email: user.referrerEmail, code: user.referrerCode };
          for (let level = 0; level < bonusRates.length && (currentReferrer.id || currentReferrer.email || currentReferrer.code); level += 1) {
            const referrerQuery = [];
            if (currentReferrer.id) referrerQuery.push({ id: currentReferrer.id });
            if (currentReferrer.email) referrerQuery.push({ email: normalizeEmail(currentReferrer.email) });
            if (currentReferrer.code) referrerQuery.push({ refCode: normalizeInvitationCode(currentReferrer.code) });
            const referrer = referrerQuery.length ? normalizeUserRecord(await UserModel.findOne({ $or: referrerQuery }, null, { session }).lean()) : null;
            if (!referrer) break;

            if (unlockedReferralLevels(referrer) > level) {
              const bonus = money((payout * bonusRates[level]) / 100);
              if (bonus > 0) {
                const referrerBalance = money(Number(referrer.balance || 0) + bonus);
                const referrerBonus = money(Number(referrer.bonus || 0) + bonus);
                await UserModel.updateOne(
                  { id: referrer.id },
                  { $set: { balance: referrerBalance, bonus: referrerBonus } },
                  { session }
                );
                const bonusPlatform = await PlatformAccountModel.findOneAndUpdate(
                  { id: "platform" },
                  { $inc: { balance: -bonus }, $setOnInsert: { createdAt: nowIso(), fees: 0 } },
                  { upsert: true, new: true, session, lean: true }
                );
                const bonusLedger = buildLedgerEntries([{
                  accountType: "platform",
                  accountId: "platform",
                  direction: "debit",
                  amount: bonus,
                  balanceAfter: bonusPlatform.balance,
                  description: `Bonus reseau journalier niveau ${level + 1}`
                }, {
                  accountType: "user",
                  accountId: referrer.id,
                  direction: "credit",
                  amount: bonus,
                  balanceAfter: referrerBalance,
                  description: `Bonus reseau journalier niveau ${level + 1}`
                }], {
                  source: "network_daily_bonus",
                  referenceId: plan.id,
                  extra: { sourceUserId: user.id, level: level + 1, activePlanId: plan.id, planId: plan.planId, days: dueDays, payoutDate }
                });
                if (bonusLedger.length) await LedgerEntryModel.insertMany(bonusLedger, { session });
                await TransactionModel.create([{
                  id: nanoid(),
                  userId: referrer.id,
                  type: "Bonus",
                  description: `Bonus reseau journalier niveau ${level + 1} (${paidDayLabel})`,
                  amount: bonus,
                  displayAmount: formatAmount(bonus, "+"),
                  status: "Completed",
                  createdAt: nowIso(),
                  metadata: { sourceUserId: user.id, level: level + 1, activePlanId: plan.id, planId: plan.planId, days: dueDays, dayFrom: paidDayFrom, dayTo: paidDayTo, payoutDate }
                }], { session });
                result.creditedNetworkBonuses += 1;
                result.creditedNetworkAmount = money(result.creditedNetworkAmount + bonus);
              }
            }

            currentReferrer = { id: referrer.referrerId, email: referrer.referrerEmail, code: referrer.referrerCode };
          }

          result.creditedUsers += 1;
          result.creditedAmount = money(result.creditedAmount + payout);
          if (plan.status === "completed") result.completedPlans += 1;
        }));
      } finally {
        await session.endSession();
      }
    }

    const activeStakes = Array.isArray(userSnapshot.activeStakes) ? userSnapshot.activeStakes : [];
    for (const stakeSnapshot of activeStakes) {
      if (stakeSnapshot.status !== "active") continue;

      const rewardAmount = positiveFiniteNumber(stakeSnapshot.rewardAmount);
      const durationDays = positiveFiniteNumber(stakeSnapshot.durationDays);
      if (!rewardAmount || !durationDays) {
        result.skippedInvalidPlans += 1;
        logger.error({ userId: userSnapshot.id, stakeId: stakeSnapshot.id, rewardAmount: stakeSnapshot.rewardAmount, durationDays: stakeSnapshot.durationDays }, "Invalid active stake skipped during daily earnings");
        continue;
      }

      const session = await mongoose.startSession();
      try {
        await withMongoRetry(() => session.withTransaction(async () => {
          const user = normalizeUserRecord(await UserModel.findOne({ id: userSnapshot.id }, null, { session }).lean());
          if (!user) return;
          const stakesList = Array.isArray(user.activeStakes) ? user.activeStakes : [];
          const stake = stakesList.find((item) => item.id === stakeSnapshot.id);
          if (!stake || stake.status !== "active") return;

          const currentDaysPaid = Math.max(0, Number.isFinite(Number(stake.daysPaid)) ? Number(stake.daysPaid) : 0);
          const currentRewardAmount = positiveFiniteNumber(stake.rewardAmount);
          const currentDurationDays = positiveFiniteNumber(stake.durationDays);
          if (!currentRewardAmount || !currentDurationDays || currentDaysPaid >= currentDurationDays) return;

          const nextPayoutAt = planNextPayoutTimestamp(stake);
          const dueDays = Math.min(duePayoutSlots(nextPayoutAt), currentDurationDays - currentDaysPaid);
          if (dueDays <= 0) return;

          const payout = money((currentRewardAmount / currentDurationDays) * dueDays);
          if (payout <= 0) return;

          const lastPayoutAt = addDaysToTimestamp(nextPayoutAt, dueDays - 1);
          const paidDayFrom = currentDaysPaid + 1;
          const paidDayTo = currentDaysPaid + dueDays;
          const paidDayLabel = paidDayFrom === paidDayTo ? `Jour ${paidDayTo}` : `Jours ${paidDayFrom}-${paidDayTo}`;
          stake.daysPaid = currentDaysPaid + dueDays;
          stake.earnedAmount = money(Number(stake.earnedAmount || 0) + payout);
          stake.lastPayoutAt = lastPayoutAt;
          stake.lastPayoutDate = String(lastPayoutAt).slice(0, 10);
          stake.nextPayoutAt = addDaysToTimestamp(nextPayoutAt, dueDays);

          await UserModel.updateOne(
            { id: user.id },
            { $set: { activeStakes: stakesList } },
            { session }
          );

          const ledgerEntries = buildLedgerEntries([{
            accountType: "staking_grs",
            accountId: user.id,
            direction: "credit",
            amount: payout,
            balanceAfter: money(Number(stake.amount || 0) + Number(stake.earnedAmount || 0)),
            description: `Gain staking bloque ${stake.name || "Staking GRSCOIN"}`
          }], {
            source: "staking_daily_earning",
            referenceId: stake.id,
            extra: { userId: user.id, stakeId: stake.id, planId: stake.planId, days: dueDays, payoutDate }
          });
          if (ledgerEntries.length) await LedgerEntryModel.insertMany(ledgerEntries, { session });

          await TransactionModel.create([{
            id: nanoid(),
            userId: user.id,
            type: "Gain",
            description: `Gain staking bloque ${stake.name || "Staking GRSCOIN"} (${paidDayLabel})`,
            amount: payout,
            displayAmount: `+${payout.toFixed(2)} GRSC bloque`,
            status: "Active",
            createdAt: nowIso(),
            metadata: { stakeId: stake.id, planId: stake.planId, days: dueDays, dayFrom: paidDayFrom, dayTo: paidDayTo, payoutDate }
          }], { session });

          let currentReferrer = { id: user.referrerId, email: user.referrerEmail, code: user.referrerCode };
          for (let level = 0; level < bonusRates.length && (currentReferrer.id || currentReferrer.email || currentReferrer.code); level += 1) {
            const referrerQuery = [];
            if (currentReferrer.id) referrerQuery.push({ id: currentReferrer.id });
            if (currentReferrer.email) referrerQuery.push({ email: normalizeEmail(currentReferrer.email) });
            if (currentReferrer.code) referrerQuery.push({ refCode: normalizeInvitationCode(currentReferrer.code) });
            const referrer = referrerQuery.length ? normalizeUserRecord(await UserModel.findOne({ $or: referrerQuery }, null, { session }).lean()) : null;
            if (!referrer) break;

            if (unlockedReferralLevels(referrer) > level) {
              const bonus = money((payout * bonusRates[level]) / 100);
              if (bonus > 0) {
                const referrerGrsBalance = money(Number(referrer.grsBalance || 0) + bonus);
                await UserModel.updateOne(
                  { id: referrer.id },
                  { $set: { grsBalance: referrerGrsBalance } },
                  { session }
                );
                const bonusLedger = buildLedgerEntries([{
                  accountType: "user_grs",
                  accountId: referrer.id,
                  direction: "credit",
                  amount: bonus,
                  balanceAfter: referrerGrsBalance,
                  description: `Bonus staking journalier niveau ${level + 1}`
                }], {
                  source: "staking_daily_referral_bonus",
                  referenceId: stake.id,
                  extra: { sourceUserId: user.id, level: level + 1, stakeId: stake.id, planId: stake.planId, days: dueDays, payoutDate }
                });
                if (bonusLedger.length) await LedgerEntryModel.insertMany(bonusLedger, { session });
                await TransactionModel.create([{
                  id: nanoid(),
                  userId: referrer.id,
                  type: "Bonus",
                  description: `Bonus staking journalier niveau ${level + 1} (${paidDayLabel})`,
                  amount: bonus,
                  displayAmount: `+${bonus.toFixed(2)} GRSC`,
                  status: "Completed",
                  createdAt: nowIso(),
                  metadata: { sourceUserId: user.id, level: level + 1, stakeId: stake.id, planId: stake.planId, days: dueDays, dayFrom: paidDayFrom, dayTo: paidDayTo, payoutDate }
                }], { session });
                result.creditedNetworkBonuses += 1;
                result.creditedNetworkAmount = money(result.creditedNetworkAmount + bonus);
              }
            }

            currentReferrer = { id: referrer.referrerId, email: referrer.referrerEmail, code: referrer.referrerCode };
          }

          result.creditedUsers += 1;
          result.creditedAmount = money(result.creditedAmount + payout);
        }));
      } finally {
        await session.endSession();
      }
    }
  }

  return result;
}

async function acquireDailyEarningsLock() {
  await ensureStorage();
  const owner = `${process.pid}-${nanoid()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString();
  const staleBefore = now.toISOString();
  const lock = await SettingModel.findOneAndUpdate(
    {
      key: "dailyPlanEarningsLock",
      $or: [
        { "value.expiresAt": { $exists: false } },
        { "value.expiresAt": { $lte: staleBefore } },
        { value: null }
      ]
    },
    {
      $set: {
        value: {
          owner,
          acquiredAt: now.toISOString(),
          expiresAt
        }
      }
    },
    { new: true, lean: true }
  );
  return lock?.value?.owner === owner ? owner : null;
}

async function releaseDailyEarningsLock(owner) {
  if (!owner) return;
  await SettingModel.updateOne(
    { key: "dailyPlanEarningsLock", "value.owner": owner },
    { $set: { value: { releasedAt: nowIso() } } }
  ).catch((error) => logger.warn({ err: error }, "Daily earnings lock release failed"));
}

async function ensureDailyPlanEarnings() {
  if (dailyEarningsPromise) return dailyEarningsPromise;
  dailyEarningsPromise = (async () => {
    const lockOwner = await acquireDailyEarningsLock();
    if (!lockOwner) return { skipped: true, reason: "daily_earnings_locked" };
    try {
      return await processDailyPlanEarnings();
    } finally {
      await releaseDailyEarningsLock(lockOwner);
    }
  })().finally(() => {
    dailyEarningsPromise = null;
  });

  return dailyEarningsPromise;
}

async function ensureAdminUser() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    logger.warn("ADMIN_EMAIL or ADMIN_PASSWORD missing: admin bootstrap skipped");
    return null;
  }

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  await ensureStorage();
  const adminId = nanoid();
  const refCode = stableRefCodeFromEmail(ADMIN_EMAIL);
  const admin = normalizeUserRecord(await UserModel.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    {
      $set: {
        email: ADMIN_EMAIL,
        fullName: ADMIN_NAME,
        role: "admin",
        status: "active"
      },
      $setOnInsert: {
        id: adminId,
        passwordHash,
        balance: 0,
        grsBalance: 0,
        reservedBalance: 0,
        activity: 0,
        bonus: 0,
        wallet: "",
        refCode,
        referrerId: null,
        merchantWallet: { available: 0, pending: 0, bonus: 0 },
        activePlans: [],
        activeStakes: [],
        createdAt: nowIso()
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean());

  logger.info({ email: maskEmail(admin.email), userId: admin.id }, "Admin account ready");
  return sanitizeUser(admin);
}

async function ensureCommissionAccount({ email, password, fullName, role }) {
  if (!email || !password) return null;

  const passwordHash = await bcrypt.hash(password, 12);
  const accountId = nanoid();
  const refCode = stableRefCodeFromEmail(email);
  const account = normalizeUserRecord(await UserModel.findOneAndUpdate(
    { email },
    {
      $set: {
        email,
        fullName,
        role,
        status: "active"
      },
      $setOnInsert: {
        id: accountId,
        passwordHash,
        balance: 0,
        grsBalance: 0,
        reservedBalance: 0,
        activity: 0,
        bonus: 0,
        wallet: "",
        refCode,
        referrerId: null,
        merchantWallet: { available: 0, pending: 0, bonus: 0 },
        activePlans: [],
        activeStakes: [],
        createdAt: nowIso()
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean());

  logger.info({ email: maskEmail(account.email), userId: account.id }, "Commission account ready");
  return sanitizeUser(account);
}

async function ensureCommissionAccounts() {
  await ensureCommissionAccount({
    email: COMMISSION_DEVELOPER_EMAIL,
    password: COMMISSION_DEVELOPER_PASSWORD,
    fullName: COMMISSION_DEVELOPER_NAME,
    role: "developer"
  });
}

async function ensurePlatformUser() {
  return ensureCommissionAccount({
    email: PLATFORM_EMAIL,
    password: PLATFORM_PASSWORD,
    fullName: PLATFORM_NAME,
    role: "user"
  });
}

async function ensureReferralCodes() {
  await ensureStorage();
  const users = await UserModel.find({ $or: [{ refCode: { $exists: false } }, { refCode: "" }, { refCode: null }] }).lean();
  for (const user of users) {
    await UserModel.updateOne(
      { id: user.id, $or: [{ refCode: { $exists: false } }, { refCode: "" }, { refCode: null }] },
      { $set: { refCode: stableRefCodeFromEmail(user.email || user.id) } }
    );
  }
  if (users.length) logger.info({ count: users.length }, "Referral codes backfilled");
}

async function reconcileReferralLinks() {
  await ensureStorage();
  const users = await UserModel.find({}).lean();
  const byCode = new Map(users
    .map((user) => [normalizeInvitationCode(user.refCode), user])
    .filter(([code]) => Boolean(code)));
  const byEmail = new Map(users
    .map((user) => [normalizeEmail(user.email), user])
    .filter(([email]) => Boolean(email)));

  let fixed = 0;
  for (const user of users) {
    const sponsor = byCode.get(normalizeInvitationCode(user.referrerCode)) || byEmail.get(normalizeEmail(user.referrerEmail));
    if (!sponsor || sponsor.id === user.id) continue;
    const next = {
      referrerId: sponsor.id,
      referrerEmail: normalizeEmail(sponsor.email),
      referrerCode: normalizeInvitationCode(sponsor.refCode)
    };
    if (
      user.referrerId === next.referrerId &&
      normalizeEmail(user.referrerEmail) === next.referrerEmail &&
      normalizeInvitationCode(user.referrerCode) === next.referrerCode
    ) {
      continue;
    }
    await UserModel.updateOne(
      { id: user.id },
      { $set: { ...next, referralReconciledAt: nowIso() } }
    );
    fixed += 1;
  }
  if (fixed) logger.warn({ fixed }, "Referral links reconciled");
  return fixed;
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
  ref: z.string().min(2)
})), async (req, res) => {
  const { email, password, ref } = req.body;
  const normalizedEmail = email.trim().toLowerCase();
  const country = req.body.country.trim();
  const refCode = normalizeInvitationCode(ref);

  const createUserRecord = async (referrer = null) => ({
    id: nanoid(),
    email: normalizedEmail,
    fullName: normalizedEmail.split("@")[0],
    country,
    passwordHash: await bcrypt.hash(password, 12),
    role: "user",
    status: "active",
    balance: 0,
    grsBalance: 0,
    reservedBalance: 0,
    activity: 0,
    bonus: 0,
    wallet: "",
    refCode: stableRefCodeFromEmail(email),
    referrerId: referrer?.id || null,
    referrerEmail: normalizeEmail(referrer?.email),
    referrerCode: normalizeInvitationCode(referrer?.refCode),
    merchantWallet: { available: 0, pending: 0, bonus: 0 },
    activePlans: [],
    activeStakes: [],
    createdAt: nowIso()
  });

  await ensureStorage();
  const result = await (async () => {
    if (await UserModel.exists({ email: normalizedEmail })) {
      return { error: "Cet email est deja enregistre." };
    }

    // On exclut uniquement le compte platform (compte comptable interne) du parrainage.
    const platformEmail = normalizeEmail(PLATFORM_EMAIL || "");
    const referrer = await UserModel.findOne({
      refCode: { $regex: `^${escapeRegExp(refCode)}$`, $options: "i" },
      ...(platformEmail ? { email: { $ne: platformEmail } } : {})
    }).lean();

    if (!referrer) return { error: `Code d'invitation invalide: ${refCode || "vide"}.` };

    try {
      const created = await UserModel.create(await createUserRecord(referrer));
      const referralPatch = {
        referrerId: referrer.id,
        referrerEmail: normalizeEmail(referrer.email),
        referrerCode: normalizeInvitationCode(referrer.refCode),
        referredAt: nowIso()
      };
      const user = normalizeUserRecord(await UserModel.findOneAndUpdate(
        { id: created.id },
        { $set: referralPatch },
        { new: true, lean: true }
      ));
      if (!referralMatches(user, referrer)) {
        logger.error({ userId: user?.id, refCode, referrerId: referrer.id }, "Referral attribution failed after registration");
        return { error: "Inscription interrompue: le parrainage n'a pas ete enregistre. Reessayez avec le lien du parrain." };
      }
      return { user };
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

app.post("/api/auth/change-password", authenticate, validate(z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10)
})), async (req, res) => {
  await ensureStorage();
  const user = await UserModel.findOne({ id: req.user.id }).lean();
  if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
  if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash || ""))) {
    return res.status(400).json({ message: "Mot de passe actuel incorrect." });
  }
  await UserModel.updateOne(
    { id: req.user.id },
    { $set: { passwordHash: await bcrypt.hash(req.body.newPassword, 12), passwordUpdatedAt: nowIso() } }
  );
  res.json({ ok: true });
});

app.post("/api/auth/forgot-password", validate(z.object({
  email: z.string().email()
})), async (req, res) => {
  const normalizedEmail = req.body.email.trim().toLowerCase();
  let otpCode = "";

  await updateDb(async (db) => {
    prunePasswordResetTokens(db);
    const user = db.users.find((candidate) => candidate.email === normalizedEmail);
    if (!user) return null;

    otpCode = String(randomBytes(4).readUInt32BE(0) % 1000000).padStart(6, "0");
    db.passwordResetTokens = db.passwordResetTokens.filter((item) => item.userId !== user.id);
    db.passwordResetTokens.push({
      id: nanoid(),
      userId: user.id,
      tokenHash: hashResetToken(otpCode),
      type: "otp",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: nowIso()
    });
    return null;
  });

  if (otpCode) {
    sendBrevoMail({
      to: normalizedEmail,
      subject: "AFRIX - Code de reinitialisation",
      title: "Code de reinitialisation",
      intro: "Utilisez ce code pour definir un nouveau mot de passe. Il expire dans 10 minutes.",
      rows: [
        { label: "Compte", value: normalizedEmail },
        { label: "Code OTP", value: otpCode },
        { label: "Expiration", value: "10 minutes" }
      ]
    }).catch((error) => logger.error({ err: error }, "Forgot password email failed"));
  }

  res.json({ message: "Si ce compte existe, un code OTP de reinitialisation a ete envoye." });
});

app.post("/api/auth/reset-password", validate(z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/),
  password: z.string().min(10)
})), async (req, res) => {
  const normalizedEmail = req.body.email.trim().toLowerCase();
  const result = await updateDb(async (db) => {
    prunePasswordResetTokens(db);
    const user = db.users.find((candidate) => candidate.email === normalizedEmail);
    if (!user) return { error: "Compte introuvable." };

    const tokenHash = hashResetToken(req.body.otp);
    const resetToken = db.passwordResetTokens.find((item) => item.userId === user.id && item.tokenHash === tokenHash);
    if (!resetToken) return { error: "Code OTP invalide ou expire." };

    user.passwordHash = await bcrypt.hash(req.body.password, 12);
    user.passwordUpdatedAt = nowIso();
    resetToken.usedAt = nowIso();
    db.passwordResetTokens = db.passwordResetTokens.filter((item) => item.id !== resetToken.id);
    return { user };
  });

  if (result.error) return res.status(400).json({ message: result.error });
  res.json({ token: signToken(result.user), user: sanitizeUser(result.user) });
});

app.get("/api/me", authenticate, async (req, res, next) => {
  try {
    const db = await readUserViewDb(req.user);
    const user = db.users.find((candidate) => candidate.id === req.user.id);
    if (!user) return res.status(404).json({ message: "Utilisateur introuvable." });
    void ensureDailyPlanEarnings()
      .then((earningsResult) => {
        if (earningsResult.creditedUsers) logger.info(earningsResult, "Daily plan earnings processed");
        if (earningsResult.skippedInvalidPlans) logger.error(earningsResult, "Invalid active plans skipped");
      })
      .catch((error) => logger.error({ err: error }, "Daily plan earnings failed"));
    res.json({ user: composeUser(db, user) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/merchants", authenticate, attachDb, (req, res) => {
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

app.post("/api/swap/grscoin-deposits", authenticate, requirePlatformAccess(), upload.single("proof"), async (req, res) => {
  const rawAmount = money(req.body.amount || 0);
  const method = String(req.body.method || "grscoin");
  const txRef = String(req.body.txRef || "").trim();
  if (rawAmount < 1) return res.status(400).json({ message: "Montant minimum depot: 1." });
  if (!GRSCOIN_PRICE_USDT) return res.status(503).json({ message: "Prix GRSCOIN indisponible." });
  if (!["grscoin", "usdt_bep20"].includes(method)) return res.status(400).json({ message: "Methode de depot invalide." });
  if (!txRef) return res.status(400).json({ message: "Reference transaction requise." });
  if (!req.file?.buffer?.length) return res.status(400).json({ message: "Preuve de paiement requise." });

  const grsAmount = method === "usdt_bep20" ? grsFromUsdt(rawAmount) : rawAmount;
  const usdtAmount = method === "usdt_bep20" ? rawAmount : money(grsAmount * GRSCOIN_PRICE_USDT);
  const proof = {
    originalName: req.file.originalname || "preuve-paiement",
    mimeType: req.file.mimetype || "application/octet-stream",
    size: req.file.size || req.file.buffer.length,
    dataBase64: req.file.buffer.toString("base64")
  };
  const tx = {
    id: nanoid(),
    userId: req.user.id,
    type: "Depot",
    description: method === "usdt_bep20" ? "Depot USDT BEP20 converti en GRSCOIN" : "Depot GRSCOIN",
    amount: grsAmount,
    displayAmount: `+${grsAmount.toFixed(2)} GRSC`,
    status: "Pending",
    createdAt: nowIso(),
    metadata: {
      asset: "GRSC_PURCHASE",
      method,
      ...(txRef ? { txRef } : {}),
      originalAmount: rawAmount,
      usdtAmount,
      grsAmount,
      priceUsdt: GRSCOIN_PRICE_USDT,
      proof
    }
  };
  await TransactionModel.create(tx);
  res.status(201).json({ reference: tx.id, amount: grsAmount, grsAmount, usdtAmount, status: tx.status });

  notifyAdmin("AFRIX - Depot GRSCOIN a valider", "Depot GRSCOIN a valider", "Une demande de depot GRSCOIN est en attente.", [
    { label: "Client", value: req.user.email },
    { label: "GRSCOIN", value: `${grsAmount.toFixed(2)} GRSC` },
    { label: "Valeur", value: formatAmount(usdtAmount) }
  ]).catch((error) => logger.error({ err: error }, "GRSCOIN purchase notification failed"));
});

app.post("/api/swap/grscoin-withdrawals", authenticate, requirePlatformAccess(), validate(z.object({
  amount: z.coerce.number().positive(),
  network: z.enum(["grs_core"]),
  address: z.string().min(5)
})), async (req, res) => {
  const amount = money(req.body.amount);
  const network = String(req.body.network || "grs_core");
  const address = String(req.body.address || "").trim();
  if (amount < 1) return res.status(400).json({ message: "Montant minimum retrait GRSCOIN: 1 GRSC." });
  const fee = money(amount * GRSCOIN_WITHDRAWAL_FEE_RATE);
  const netAmount = money(amount - fee);
  if (netAmount <= 0) return res.status(400).json({ message: "Le montant apres frais doit rester positif." });

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const updatedUser = await UserModel.findOneAndUpdate(
        {
          id: req.user.id,
          $expr: { $gte: [{ $toDouble: { $ifNull: ["$grsBalance", 0] } }, amount] }
        },
        [{
          $set: {
            grsBalance: { $round: [{ $subtract: [{ $toDouble: { $ifNull: ["$grsBalance", 0] } }, amount] }, 2] }
          }
        }],
        { new: true, session, lean: true }
      );
      if (!updatedUser) {
        result = { error: "Solde GRSCOIN insuffisant." };
        return;
      }
      const tx = {
        id: nanoid(),
        userId: req.user.id,
        type: "Retrait",
        description: "Retrait GRSCOIN",
        amount,
        displayAmount: `-${amount.toFixed(2)} GRSC`,
        status: "Pending",
        createdAt: nowIso(),
        metadata: { asset: "GRSC_WITHDRAWAL", grsAmount: amount, fee, netAmount, network, address }
      };
      await TransactionModel.create([tx], { session });
      const entries = buildLedgerEntries([{
        accountType: "user_grs",
        accountId: req.user.id,
        direction: "debit",
        amount,
        balanceAfter: updatedUser.grsBalance,
        description: "Retrait GRSCOIN demande"
      }], { source: "grscoin_withdrawal_request", referenceId: tx.id, extra: { network, address } });
      if (entries.length) await LedgerEntryModel.insertMany(entries, { session });
      result = { transaction: tx, user: normalizeUserRecord(updatedUser) };
    });

    if (result?.error) return res.status(400).json({ message: result.error });
    res.status(201).json({ reference: result.transaction.id, amount, fee, netAmount, status: result.transaction.status });
  } finally {
    await session.endSession();
  }

  notifyAdmin("AFRIX - Retrait GRSCOIN a traiter", "Retrait GRSCOIN a traiter", "Une demande de retrait GRSCOIN est en attente.", [
    { label: "Client", value: req.user.email },
    { label: "Montant", value: `${amount.toFixed(2)} GRSC` },
    { label: "Frais", value: `${fee.toFixed(2)} GRSC` },
    { label: "Net a envoyer", value: `${netAmount.toFixed(2)} GRSC` },
    { label: "Reseau", value: network.toUpperCase() }
  ]).catch((error) => logger.error({ err: error }, "GRSCOIN withdrawal notification failed"));
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
  const fee = money(amount * 0.10);
  const netAmount = money(amount - fee);
  const reservedAmount = money(amount);
  if (netAmount <= 0) {
    return res.status(400).json({ message: "Le montant apres frais doit rester positif." });
  }
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
          netAmount,
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
    netAmount: result.request?.netAmount || result.transaction?.metadata?.netAmount || money(amount - fee),
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
      { label: "Net a recevoir", value: formatAmount(result.request?.netAmount || result.transaction?.metadata?.netAmount || money(amount - fee)) },
      { label: "Reference", value: result.request?.reference || result.transaction?.id },
      { label: "Statut", value: result.request?.status || result.transaction?.status }
    ]
    }),
    notifyAdmin("AFRIX - Retrait a traiter", "Retrait a traiter", "Une demande de retrait est en attente.", [
    { label: "Client", value: req.user.email },
    { label: "Methode", value: method.toUpperCase() },
    { label: "Montant", value: formatAmount(amount) },
    { label: "Frais", value: formatAmount(result.transaction?.metadata?.fee || 0) },
    { label: "Net a recevoir", value: formatAmount(result.transaction?.metadata?.netAmount || money(amount - fee)) },
    ...(phone ? [{ label: "Numero MTN", value: phone }] : []),
    ...(beneficiary ? [{ label: "Beneficiaire", value: beneficiary }] : [])
    ])
  ]).catch((error) => logger.error({ err: error }, "Withdrawal notification failed"));
});

app.post("/api/swap/usdt-to-grsc", authenticate, requirePlatformAccess(), validate(z.object({
  amount: z.coerce.number().positive()
})), async (req, res) => {
  const usdtAmount = money(req.body.amount);
  if (usdtAmount < 1) return res.status(400).json({ message: "Montant minimum swap: 1 USDT." });
  if (!GRSCOIN_PRICE_USDT) return res.status(503).json({ message: "Prix AFRIX Swap indisponible." });

  const adminCommission = money(usdtAmount * GRSCOIN_SWAP_ADMIN_RATE);
  const developerCommission = money(usdtAmount * GRSCOIN_SWAP_DEVELOPER_RATE);
  const platformCommission = money(usdtAmount * GRSCOIN_SWAP_PLATFORM_RATE);
  const platformFee = money(adminCommission + developerCommission + platformCommission);
  const bonusPool = money(GRSCOIN_SWAP_BONUS_RATES.reduce((total, rate) => total + usdtAmount * rate, 0));
  const netUsdt = money(usdtAmount - platformFee);
  if (netUsdt <= 0) return res.status(400).json({ message: "Montant swap trop faible apres frais." });

  const grsAmount = grsFromUsdt(netUsdt);
  const session = await mongoose.startSession();
  try {
    let result;
    await withMongoRetry(() => session.withTransaction(async () => {
      const user = normalizeUserRecord(await UserModel.findOne({ id: req.user.id }, null, { session }).lean());
      if (!user) {
        result = { error: "Utilisateur introuvable." };
        return;
      }
      if (money(user.balance) < usdtAmount) {
        result = { error: "Solde USDT insuffisant." };
        return;
      }

      const updatedUser = await UserModel.findOneAndUpdate(
        {
          id: user.id,
          $expr: { $gte: [{ $toDouble: { $ifNull: ["$balance", 0] } }, usdtAmount] }
        },
        [{
          $set: {
            balance: { $round: [{ $subtract: [{ $toDouble: { $ifNull: ["$balance", 0] } }, usdtAmount] }, 2] },
            grsBalance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$grsBalance", 0] } }, grsAmount] }, 2] }
          }
        }],
        { new: true, session, lean: true }
      );
      if (!updatedUser) {
        result = { error: "Solde USDT insuffisant." };
        return;
      }

      const platform = await PlatformAccountModel.findOneAndUpdate(
        { id: "platform" },
        { $inc: { balance: usdtAmount, fees: platformFee }, $setOnInsert: { createdAt: nowIso() } },
        { upsert: true, new: true, session, lean: true }
      );
      const referenceId = nanoid();
      const adminAccount = ADMIN_EMAIL && adminCommission > 0 ? await UserModel.findOneAndUpdate(
        { email: ADMIN_EMAIL },
        [{
          $set: {
            balance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$balance", 0] } }, adminCommission] }, 2] },
            bonus: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$bonus", 0] } }, adminCommission] }, 2] }
          }
        }],
        { new: true, session, lean: true }
      ) : null;
      const developerAccount = COMMISSION_DEVELOPER_EMAIL && developerCommission > 0 ? await UserModel.findOneAndUpdate(
        { email: COMMISSION_DEVELOPER_EMAIL },
        [{
          $set: {
            balance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$balance", 0] } }, developerCommission] }, 2] },
            bonus: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$bonus", 0] } }, developerCommission] }, 2] }
          }
        }],
        { new: true, session, lean: true }
      ) : null;
      const platformUserAccount = PLATFORM_EMAIL && platformCommission > 0 ? await UserModel.findOneAndUpdate(
        { email: PLATFORM_EMAIL },
        [{
          $set: {
            balance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$balance", 0] } }, platformCommission] }, 2] },
            bonus: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$bonus", 0] } }, platformCommission] }, 2] }
          }
        }],
        { new: true, session, lean: true }
      ) : null;
      let platformBalanceAfterDebits = money(platform.balance);
      const commissionRows = [];
      const commissionTransactions = [];
      if (adminAccount && adminCommission > 0) {
        platformBalanceAfterDebits = money(platformBalanceAfterDebits - adminCommission);
        commissionRows.push({
          accountType: "platform",
          accountId: "platform",
          direction: "debit",
          amount: adminCommission,
          balanceAfter: platformBalanceAfterDebits,
          description: "Commission admin AFRIX Swap"
        }, {
          accountType: "admin",
          accountId: adminAccount.id,
          direction: "credit",
          amount: adminCommission,
          balanceAfter: adminAccount.balance,
          description: "Commission admin AFRIX Swap"
        });
        commissionTransactions.push({
          id: nanoid(),
          userId: adminAccount.id,
          type: "Commission",
          description: "Commission AFRIX Swap",
          amount: adminCommission,
          displayAmount: formatAmount(adminCommission, "+"),
          status: "Completed",
          createdAt: nowIso(),
          metadata: { source: "afrix_swap_commission", swapId: referenceId, rate: GRSCOIN_SWAP_ADMIN_RATE }
        });
      }
      if (developerAccount && developerCommission > 0) {
        platformBalanceAfterDebits = money(platformBalanceAfterDebits - developerCommission);
        commissionRows.push({
          accountType: "platform",
          accountId: "platform",
          direction: "debit",
          amount: developerCommission,
          balanceAfter: platformBalanceAfterDebits,
          description: "Commission developpeur AFRIX Swap"
        }, {
          accountType: "developer",
          accountId: developerAccount.id,
          direction: "credit",
          amount: developerCommission,
          balanceAfter: developerAccount.balance,
          description: "Commission developpeur AFRIX Swap"
        });
        commissionTransactions.push({
          id: nanoid(),
          userId: developerAccount.id,
          type: "Commission",
          description: "Commission AFRIX Swap",
          amount: developerCommission,
          displayAmount: formatAmount(developerCommission, "+"),
          status: "Completed",
          createdAt: nowIso(),
          metadata: { source: "afrix_swap_commission", swapId: referenceId, rate: GRSCOIN_SWAP_DEVELOPER_RATE }
        });
      }
      if (platformUserAccount && platformCommission > 0) {
        platformBalanceAfterDebits = money(platformBalanceAfterDebits - platformCommission);
        commissionRows.push({
          accountType: "platform",
          accountId: "platform",
          direction: "debit",
          amount: platformCommission,
          balanceAfter: platformBalanceAfterDebits,
          description: "Commission plateforme AFRIX Swap"
        }, {
          accountType: "platform_user",
          accountId: platformUserAccount.id,
          direction: "credit",
          amount: platformCommission,
          balanceAfter: platformUserAccount.balance,
          description: "Commission plateforme AFRIX Swap"
        });
        commissionTransactions.push({
          id: nanoid(),
          userId: platformUserAccount.id,
          type: "Commission",
          description: "Commission AFRIX Swap",
          amount: platformCommission,
          displayAmount: formatAmount(platformCommission, "+"),
          status: "Completed",
          createdAt: nowIso(),
          metadata: { source: "afrix_swap_commission", swapId: referenceId, rate: GRSCOIN_SWAP_PLATFORM_RATE }
        });
      }

      const referralRows = [];
      const referralTransactions = [];
      let currentReferrer = { id: user.referrerId, email: user.referrerEmail, code: user.referrerCode };
      for (let level = 0; level < GRSCOIN_SWAP_BONUS_RATES.length && (currentReferrer.id || currentReferrer.email || currentReferrer.code); level += 1) {
        const referrerQuery = [];
        if (currentReferrer.id) referrerQuery.push({ id: currentReferrer.id });
        if (currentReferrer.email) referrerQuery.push({ email: normalizeEmail(currentReferrer.email) });
        if (currentReferrer.code) referrerQuery.push({ refCode: normalizeInvitationCode(currentReferrer.code) });
        const referrer = referrerQuery.length ? normalizeUserRecord(await UserModel.findOne({ $or: referrerQuery }, null, { session }).lean()) : null;
        if (!referrer) break;
        if (unlockedReferralLevels(referrer) <= level) {
          currentReferrer = { id: referrer.referrerId, email: referrer.referrerEmail, code: referrer.referrerCode };
          continue;
        }
        const bonus = money(usdtAmount * GRSCOIN_SWAP_BONUS_RATES[level]);
        if (bonus > 0) {
          const updatedReferrer = await UserModel.findOneAndUpdate(
            { id: referrer.id },
            [{
              $set: {
                balance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$balance", 0] } }, bonus] }, 2] },
                bonus: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$bonus", 0] } }, bonus] }, 2] }
              }
            }],
            { new: true, session, lean: true }
          );
          platformBalanceAfterDebits = money(platformBalanceAfterDebits - bonus);
          referralRows.push({
            accountType: "platform",
            accountId: "platform",
            direction: "debit",
            amount: bonus,
            balanceAfter: platformBalanceAfterDebits,
            description: `Bonus swap niveau ${level + 1}`
          }, {
            accountType: "user",
            accountId: referrer.id,
            direction: "credit",
            amount: bonus,
            balanceAfter: updatedReferrer?.balance || money(referrer.balance + bonus),
            description: `Bonus swap niveau ${level + 1}`
          });
          referralTransactions.push({
            id: nanoid(),
            userId: referrer.id,
            type: "Bonus",
            description: `Bonus swap niveau ${level + 1}`,
            amount: bonus,
            displayAmount: formatAmount(bonus, "+"),
            status: "Completed",
            createdAt: nowIso(),
            metadata: { sourceUserId: user.id, source: "afrix_swap_referral", level: level + 1, rate: GRSCOIN_SWAP_BONUS_RATES[level], swapId: referenceId }
          });
        }
        currentReferrer = { id: referrer.referrerId, email: referrer.referrerEmail, code: referrer.referrerCode };
      }
      if (platformBalanceAfterDebits !== money(platform.balance)) {
        await PlatformAccountModel.updateOne({ id: "platform" }, { $set: { balance: platformBalanceAfterDebits } }, { session });
      }

      const ledgerEntries = buildLedgerEntries([{
        accountType: "user",
        accountId: user.id,
        direction: "debit",
        amount: usdtAmount,
        balanceAfter: updatedUser.balance,
        description: "AFRIX Swap USDT vers GRSCOIN"
      }, {
        accountType: "platform",
        accountId: "platform",
        direction: "credit",
        amount: usdtAmount,
        balanceAfter: platform.balance,
        description: "AFRIX Swap USDT recu"
      }, {
        accountType: "user_grs",
        accountId: user.id,
        direction: "credit",
        amount: grsAmount,
        balanceAfter: updatedUser.grsBalance,
        description: "AFRIX Swap GRSCOIN credite"
      }, ...commissionRows, ...referralRows], {
        source: "afrix_swap",
        referenceId,
        extra: { priceUsdt: GRSCOIN_PRICE_USDT, usdtAmount, netUsdt, platformFee, adminCommission, developerCommission, platformCommission, bonusPool, grsAmount }
      });
      if (ledgerEntries.length) await LedgerEntryModel.insertMany(ledgerEntries, { session });
      if (commissionTransactions.length) await TransactionModel.insertMany(commissionTransactions, { session });
      if (referralTransactions.length) await TransactionModel.insertMany(referralTransactions, { session });

      const tx = {
        id: referenceId,
        userId: user.id,
        type: "Swap",
        description: "AFRIX Swap USDT vers GRSCOIN",
        amount: usdtAmount,
        displayAmount: `-${usdtAmount.toFixed(2)} USDT -> +${grsAmount.toFixed(2)} GRSC`,
        status: "Completed",
        createdAt: nowIso(),
        metadata: { priceUsdt: GRSCOIN_PRICE_USDT, usdtAmount, netUsdt, platformFee, adminCommission, developerCommission, platformCommission, bonusPool, grsAmount, direction: "USDT_GRSC" }
      };
      await TransactionModel.create([tx], { session });
      result = { transaction: tx, user: normalizeUserRecord(updatedUser), usdtAmount, netUsdt, grsAmount, platformFee, adminCommission, developerCommission, platformCommission, bonusPool, priceUsdt: GRSCOIN_PRICE_USDT };
    }));

    if (result?.error) return res.status(400).json({ message: result.error });
    return res.status(201).json(result);
  } finally {
    await session.endSession();
  }
});

app.post("/api/plans/activate", authenticate, requirePlatformAccess(), validate(z.object({
  amount: z.coerce.number().optional(),
  plan: z.string().optional()
})), async (req, res) => {
  const requestedAmount = req.body.amount ? money(req.body.amount) : null;
  const plan = req.body.plan ? parsePlan(req.body.plan) : planForAmount(requestedAmount);
  if (!plan) return res.status(400).json({ message: "Plan inconnu." });
  const investmentAmount = requestedAmount || money(plan.minAmount || plan.amount);
  if (investmentAmount < money(plan.minAmount)) {
    return res.status(400).json({ message: `Montant minimum ${plan.name}: ${formatAmount(plan.minAmount)}.` });
  }

  const result = await activatePlanDirect({ userId: req.user.id, plan, amount: investmentAmount });

  if (result.error) return res.status(400).json({ message: result.error });
  res.json({ user: sanitizeUser(result.user), activePlan: result.activePlan });
  notifyPlanActivation(result.user, result.activePlan, investmentAmount);
});

app.post("/api/staking/activate", authenticate, requirePlatformAccess(), validate(z.object({
  amount: z.coerce.number().positive(),
  plan: z.string().min(2)
})), async (req, res) => {
  const plan = parseStakingPlan(req.body.plan);
  if (!plan) return res.status(400).json({ message: "Plan staking inconnu." });
  const stakeAmount = money(req.body.amount);
  if (stakeAmount < money(plan.minAmount)) {
    return res.status(400).json({ message: `Montant minimum ${plan.name}: ${plan.minAmount.toFixed(2)} GRSC.` });
  }

  const rewardAmount = money(stakeAmount * plan.rewardRate);
  const maturityAmount = money(stakeAmount + rewardAmount);
  const activatedAt = nowIso();
  const activeStake = {
    id: nanoid(),
    planId: plan.id,
    name: plan.name,
    amount: stakeAmount,
    rewardRate: plan.rewardRate,
    rewardAmount,
    maturityAmount,
    durationDays: plan.durationDays,
    activatedAt,
    lastPayoutAt: null,
    lastPayoutDate: today(),
    nextPayoutAt: addDaysToTimestamp(activatedAt, 1),
    daysPaid: 0,
    earnedAmount: 0,
    endsAt: addDaysToTimestamp(activatedAt, plan.durationDays),
    status: "active"
  };

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const updatedUser = await UserModel.findOneAndUpdate(
        {
          id: req.user.id,
          status: "active",
          $expr: { $gte: [{ $toDouble: { $ifNull: ["$grsBalance", 0] } }, stakeAmount] }
        },
        [{
          $set: {
            grsBalance: { $round: [{ $subtract: [{ $toDouble: { $ifNull: ["$grsBalance", 0] } }, stakeAmount] }, 2] },
            activeStakes: { $concatArrays: [{ $ifNull: ["$activeStakes", []] }, [activeStake]] }
          }
        }],
        { new: true, session, lean: true }
      );
      if (!updatedUser) {
        result = { error: "Solde GRSCOIN insuffisant pour activer ce staking." };
        return;
      }

      const entries = buildLedgerEntries([{
        accountType: "user_grs",
        accountId: req.user.id,
        direction: "debit",
        amount: stakeAmount,
        balanceAfter: updatedUser.grsBalance,
        description: `Activation ${plan.name}`
      }, {
        accountType: "staking_grs",
        accountId: req.user.id,
        direction: "credit",
        amount: stakeAmount,
        balanceAfter: stakeAmount,
        description: `GRSCOIN verrouille ${plan.name}`
      }], { source: "staking_activation", referenceId: activeStake.id, extra: { planId: plan.id } });
      if (entries.length) await LedgerEntryModel.insertMany(entries, { session });

      const benefitRows = [];
      const benefitTransactions = [];
      const creditGrsBenefit = async ({ account, amount, label, source, extra = {}, accountType = "user_grs" }) => {
        const benefit = money(amount);
        if (!account?.id || benefit <= 0) return null;
        const updatedAccount = await UserModel.findOneAndUpdate(
          { id: account.id },
          [{
            $set: {
              grsBalance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$grsBalance", 0] } }, benefit] }, 2] }
            }
          }],
          { new: true, session, lean: true }
        );
        if (!updatedAccount) return null;
        benefitRows.push({
          accountType,
          accountId: account.id,
          direction: "credit",
          amount: benefit,
          balanceAfter: updatedAccount.grsBalance,
          description: label,
          source,
          extra
        });
        benefitTransactions.push({
          id: nanoid(),
          userId: account.id,
          type: label.includes("Bonus") ? "Bonus" : "Commission",
          description: label,
          amount: benefit,
          displayAmount: `+${benefit.toFixed(2)} GRSC`,
          status: "Completed",
          createdAt: nowIso(),
          metadata: { source, activeStakeId: activeStake.id, planId: plan.id, ...extra }
        });
        return updatedAccount;
      };

      const adminAccount = ADMIN_EMAIL ? await UserModel.findOne({ email: ADMIN_EMAIL }, null, { session }).lean() : null;
      const developerAccount = COMMISSION_DEVELOPER_EMAIL ? await UserModel.findOne({ email: COMMISSION_DEVELOPER_EMAIL }, null, { session }).lean() : null;
      const platformAccount = PLATFORM_EMAIL ? await UserModel.findOne({ email: PLATFORM_EMAIL }, null, { session }).lean() : null;
      await creditGrsBenefit({
        account: adminAccount,
        amount: rewardAmount * STAKING_ADMIN_COMMISSION_RATE,
        label: "Commission admin staking",
        source: "staking_admin_commission",
        accountType: "admin_grs",
        extra: { sourceUserId: req.user.id, rate: STAKING_ADMIN_COMMISSION_RATE, rewardAmount }
      });
      await creditGrsBenefit({
        account: developerAccount,
        amount: rewardAmount * STAKING_DEVELOPER_COMMISSION_RATE,
        label: "Commission developpeur staking",
        source: "staking_developer_commission",
        accountType: "developer_grs",
        extra: { sourceUserId: req.user.id, rate: STAKING_DEVELOPER_COMMISSION_RATE, rewardAmount }
      });
      await creditGrsBenefit({
        account: platformAccount,
        amount: rewardAmount * STAKING_PLATFORM_COMMISSION_RATE,
        label: "Commission plateforme staking",
        source: "staking_platform_commission",
        accountType: "platform_user_grs",
        extra: { sourceUserId: req.user.id, rate: STAKING_PLATFORM_COMMISSION_RATE, rewardAmount }
      });

      if (benefitRows.length) {
        const benefitEntries = buildLedgerEntries(benefitRows.map((row) => ({
          accountType: row.accountType,
          accountId: row.accountId,
          direction: row.direction,
          amount: row.amount,
          balanceAfter: row.balanceAfter,
          description: row.description
        })), {
          source: "staking_activation_benefits",
          referenceId: activeStake.id,
          extra: { planId: plan.id, rewardAmount }
        });
        if (benefitEntries.length) await LedgerEntryModel.insertMany(benefitEntries, { session });
      }
      if (benefitTransactions.length) await TransactionModel.insertMany(benefitTransactions, { session });

      await TransactionModel.create([{
        id: nanoid(),
        userId: req.user.id,
        type: "Staking",
        description: `Activation ${plan.name}`,
        amount: stakeAmount,
        displayAmount: `-${stakeAmount.toFixed(2)} GRSC`,
        status: "Active",
        createdAt: nowIso(),
        metadata: { planId: plan.id, activeStakeId: activeStake.id, rewardAmount, maturityAmount, endsAt: activeStake.endsAt }
      }], { session });
      result = { user: normalizeUserRecord(updatedUser), activeStake };
    });

    if (result?.error) return res.status(400).json({ message: result.error });
    res.status(201).json({ user: sanitizeUser(result.user), activeStake: result.activeStake });
  } finally {
    await session.endSession();
  }
});

app.post("/api/staking/:id/claim", authenticate, requirePlatformAccess(), async (req, res) => {
  const stakeId = String(req.params.id || "");
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const user = normalizeUserRecord(await UserModel.findOne({ id: req.user.id }, null, { session }).lean());
      const stakes = Array.isArray(user?.activeStakes) ? user.activeStakes : [];
      const stakeIndex = stakes.findIndex((stake) => stake.id === stakeId);
      const stake = stakeIndex >= 0 ? stakes[stakeIndex] : null;
      if (!stake) {
        result = { error: "Staking introuvable." };
        return;
      }
      if (stake.status !== "active") {
        result = { error: "Ce staking a deja ete reclame." };
        return;
      }
      if (Date.parse(stake.endsAt || "") > Date.now()) {
        result = { error: "Ce staking n'est pas encore arrive a maturite." };
        return;
      }

      const claimedAmount = money(Number(stake.amount || 0) + Number(stake.rewardAmount || 0));
      stakes[stakeIndex] = {
        ...stake,
        status: "completed",
        claimedAt: nowIso()
      };
      const updatedUser = await UserModel.findOneAndUpdate(
        { id: user.id },
        [{
          $set: {
            grsBalance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$grsBalance", 0] } }, claimedAmount] }, 2] },
            activeStakes: stakes
          }
        }],
        { new: true, session, lean: true }
      );

      const entries = buildLedgerEntries([{
        accountType: "staking_grs",
        accountId: user.id,
        direction: "debit",
        amount: money(stake.amount || 0),
        balanceAfter: 0,
        description: `Sortie ${stake.name || "Staking GRSCOIN"}`
      }, {
        accountType: "user_grs",
        accountId: user.id,
        direction: "credit",
        amount: claimedAmount,
        balanceAfter: updatedUser.grsBalance,
        description: `Reclamation ${stake.name || "Staking GRSCOIN"}`
      }], { source: "staking_claim", referenceId: stake.id, extra: { rewardAmount: money(stake.rewardAmount || 0), earnedAmount: money(stake.earnedAmount || 0) } });
      if (entries.length) await LedgerEntryModel.insertMany(entries, { session });
      await TransactionModel.create([{
        id: nanoid(),
        userId: user.id,
        type: "Staking",
        description: `Reclamation ${stake.name || "Staking GRSCOIN"}`,
        amount: claimedAmount,
        displayAmount: `+${claimedAmount.toFixed(2)} GRSC`,
        status: "Completed",
        createdAt: nowIso(),
        metadata: { activeStakeId: stake.id, rewardAmount: money(stake.rewardAmount || 0), earnedAmount: money(stake.earnedAmount || 0), claimedAmount }
      }], { session });
      result = { user: normalizeUserRecord(updatedUser), claimedAmount };
    });

    if (result?.error) return res.status(400).json({ message: result.error });
    res.json({ user: sanitizeUser(result.user), claimedAmount: result.claimedAmount });
  } finally {
    await session.endSession();
  }
});

function maskDisplayName(value = "") {
  const parts = String(value || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Utilisateur AFRIX";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1][0] || ""}.`;
}

app.get("/api/p2p-recipient/:email", authenticate, requirePlatformAccess(), attachDb, (req, res) => {
  const email = String(req.params.email || "").trim().toLowerCase();
  const recipient = req.db.users.find((user) => String(user.email || "").toLowerCase() === email);
  if (!recipient) return res.status(404).json({ message: "Destinataire introuvable." });
  if (recipient.id === req.user.id) {
    return res.status(400).json({ message: "Vous ne pouvez pas vous envoyer des fonds a vous-meme." });
  }
  if (recipient.status && recipient.status !== "active") {
    return res.status(400).json({ message: "Ce compte ne peut pas recevoir de transfert." });
  }
  res.json({
    email: recipient.email,
    displayName: maskDisplayName(recipient.fullName || recipient.email),
    canReceive: true
  });
});

app.post("/api/p2p-transfers", authenticate, requirePlatformAccess(), validate(z.object({
  recipient: z.string().email(),
  amount: z.coerce.number().positive(),
  note: z.string().max(180).optional()
})), async (req, res) => {
  const amount = money(req.body.amount);
  const fee = money(amount * 0.01);
  const total = money(amount + fee);
  const note = String(req.body.note || "").trim().slice(0, 180);
  const recipientEmail = req.body.recipient.trim().toLowerCase();
  const sender = await UserModel.findOne({ id: req.user.id }).lean();
  const recipient = await UserModel.findOne({ email: recipientEmail }).lean();
  if (!sender) return res.status(404).json({ message: "Expediteur introuvable." });
  if (!recipient) return res.status(404).json({ message: "Destinataire introuvable." });
  if (recipient.id === sender.id) {
    return res.status(400).json({ message: "Vous ne pouvez pas vous envoyer des fonds a vous-meme." });
  }
  if (recipient.status && recipient.status !== "active") {
    return res.status(400).json({ message: "Ce compte ne peut pas recevoir de transfert." });
  }

  const reference = makeReference("P2P", amount);
  const updatedSender = await UserModel.findOneAndUpdate(
    { id: sender.id, $expr: { $gte: [{ $toDouble: { $ifNull: ["$balance", 0] } }, total] } },
    [{ $set: { balance: { $round: [{ $subtract: [{ $toDouble: { $ifNull: ["$balance", 0] } }, total] }, 2] } } }],
    { new: true, lean: true }
  );
  if (!updatedSender) return res.status(400).json({ message: "Solde insuffisant." });

  const updatedRecipient = await UserModel.findOneAndUpdate(
    { id: recipient.id },
    [{ $set: { balance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$balance", 0] } }, amount] }, 2] } } }],
    { new: true, lean: true }
  );
  if (!updatedRecipient) return res.status(404).json({ message: "Destinataire introuvable." });

  const platform = await PlatformAccountModel.findOneAndUpdate(
    { id: "platform" },
    { $inc: { balance: fee, fees: fee }, $setOnInsert: { createdAt: nowIso() } },
    { upsert: true, new: true, lean: true }
  );
  await creditPlatformUserFee({
    amount: fee,
    description: "Frais transfert AFRIX Money",
    source: "p2p_fee",
    referenceId: reference,
    extra: { senderId: sender.id, recipientId: recipient.id }
  });
  const ledgerEntries = buildLedgerEntries([{
    accountType: "user",
    accountId: sender.id,
    direction: "debit",
    amount: total,
    balanceAfter: updatedSender.balance,
    description: `Transfert vers ${recipient.email}`
  }, {
    accountType: "user",
    accountId: recipient.id,
    direction: "credit",
    amount,
    balanceAfter: updatedRecipient.balance,
    description: `Reception depuis ${sender.email}`
  }, {
    accountType: "platform",
    accountId: "platform",
    direction: "credit",
    amount: fee,
    balanceAfter: platform.balance,
    description: "Frais P2P"
  }], { source: "p2p_transfer", referenceId: reference, extra: { senderId: sender.id, recipientId: recipient.id, amount, fee, note } });
  if (ledgerEntries.length) await LedgerEntryModel.insertMany(ledgerEntries);
  await TransactionModel.insertMany([{
    id: nanoid(),
    userId: sender.id,
    type: "P2P",
    description: `Transfert vers ${recipient.email}`,
    amount: total,
    displayAmount: formatAmount(total, "-"),
    status: "Completed",
    createdAt: nowIso(),
    metadata: { reference, amount, fee, total, recipientEmail: recipient.email, note }
  }, {
    id: nanoid(),
    userId: recipient.id,
    type: "P2P",
    description: `Reception depuis ${sender.email}`,
    amount,
    displayAmount: formatAmount(amount, "+"),
    status: "Completed",
    createdAt: nowIso(),
    metadata: { reference, amount, senderEmail: sender.email, note }
  }]);

  const result = {
    reference,
    amount,
    fee,
    total,
    recipient: { email: recipient.email, displayName: maskDisplayName(recipient.fullName || recipient.email) }
  };
  res.status(201).json(result);
  Promise.all([
    sendBrevoMail({
      to: sender.email,
      subject: "AFRIX - Transfert AFRIX Money envoye",
      title: "Votre transfert est confirme",
      intro: "Votre transfert AFRIX Money a ete execute avec succes.",
      rows: [
        { label: "Destinataire", value: recipient.email },
        { label: "Montant envoye", value: formatAmount(amount) },
        { label: "Frais", value: formatAmount(fee) },
        { label: "Total debite", value: formatAmount(total) },
        { label: "Reference", value: reference }
      ]
    }),
    sendBrevoMail({
      to: recipient.email,
      subject: "AFRIX - Transfert AFRIX Money recu",
      title: "Vous avez recu un transfert",
      intro: "Un transfert AFRIX Money vient d'etre credite sur votre compte.",
      rows: [
        { label: "Expediteur", value: sender.email },
        { label: "Montant recu", value: formatAmount(amount) },
        { label: "Reference", value: reference }
      ]
    })
  ]).catch((error) => logger.error({ err: error }, "P2P transfer email failed"));
});

app.get("/api/exchange/ads", authenticate, requirePlatformAccess(), attachDb, async (req, res) => {
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

app.get("/api/exchange/orders/:reference", authenticate, requirePlatformAccess(), requireMerchant, attachDb, (req, res) => {
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

app.get("/api/merchant/cico-requests/:reference", authenticate, requirePlatformAccess({ cico: true }), requireMerchant, attachDb, (req, res) => {
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

app.get("/api/transactions/export", authenticate, attachDb, (req, res) => {
  const rows = req.db.transactions.filter((tx) => canViewTransaction(req.user, tx));
  const csv = [
    "date,type,description,amount,status,reference",
    ...rows
      .slice()
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .map((tx) => [String(tx.createdAt || "").slice(0, 10), tx.type, tx.description, tx.displayAmount, tx.status, tx.metadata?.reference || tx.id]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
  ].join("\n");
  res
    .type("text/csv")
    .set("Content-Disposition", `attachment; filename="afrix-transactions-${today()}.csv"`)
    .send(csv);
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

async function payDirectCommission({ session, accountId, amount, label, source, referenceId, extra = {} }) {
  const commission = money(amount);
  if (commission <= 0 || !accountId) return;
  const account = await UserModel.findOneAndUpdate(
    { id: accountId },
    [{
      $set: {
        balance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$balance", 0] } }, commission] }, 2] }
      }
    }],
    { new: true, session, lean: true }
  );
  if (!account) return;
  const platform = await PlatformAccountModel.findOneAndUpdate(
    { id: "platform" },
    { $inc: { balance: -commission }, $setOnInsert: { createdAt: nowIso() } },
    { upsert: true, new: true, session, lean: true }
  );
  const ledgerEntries = buildLedgerEntries([{
    accountType: "platform",
    accountId: "platform",
    direction: "debit",
    amount: commission,
    balanceAfter: platform.balance,
    description: label
  }, {
    accountType: "user",
    accountId,
    direction: "credit",
    amount: commission,
    balanceAfter: account.balance,
    description: label
  }], { source, referenceId, extra });
  if (ledgerEntries.length) await LedgerEntryModel.insertMany(ledgerEntries, { session });
  await TransactionModel.create([{
    id: nanoid(),
    userId: accountId,
    type: "Commission",
    description: label,
    amount: commission,
    displayAmount: formatAmount(commission, "+"),
    status: "Completed",
    createdAt: nowIso(),
    metadata: { source, referenceId, ...extra }
  }], { session });
}

async function activatePlanDirect({ userId, plan, amount, bypassUnlock = false, initiatedBy = null }) {
  const investmentAmount = money(amount || plan.minAmount);
  if (investmentAmount < money(plan.minAmount)) {
    return { error: `Montant minimum ${plan.name}: ${formatAmount(plan.minAmount)}.` };
  }

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const user = normalizeUserRecord(await UserModel.findOne({ id: userId }, null, { session }).lean());
      if (!user) {
        result = { error: "Utilisateur introuvable." };
        return;
      }
      if (user.status && user.status !== "active") {
        result = { error: "Ce compte est suspendu." };
        return;
      }
      if (!bypassUnlock) {
        const unlockError = planUnlockError(user, plan);
        if (unlockError) {
          result = { error: unlockError };
          return;
        }
      }

      const activatedAt = nowIso();
      const activePlan = {
        id: nanoid(),
        planId: plan.id,
        name: plan.name,
        amount: investmentAmount,
        dailyRate: plan.dailyRate,
        durationDays: plan.durationDays,
        activatedAt,
        lastPayoutAt: null,
        lastPayoutDate: today(),
        nextPayoutAt: addDaysToTimestamp(activatedAt, 1),
        daysPaid: 0,
        earnedAmount: 0,
        capitalReturnedAt: null,
        status: "active"
      };

      const updatedUser = await UserModel.findOneAndUpdate(
        {
          id: user.id,
          $expr: { $gte: [{ $toDouble: { $ifNull: ["$balance", 0] } }, investmentAmount] }
        },
        [{
          $set: {
            balance: { $round: [{ $subtract: [{ $toDouble: { $ifNull: ["$balance", 0] } }, investmentAmount] }, 2] },
            activity: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$activity", 0] } }, investmentAmount] }, 2] },
            activePlans: { $concatArrays: [{ $ifNull: ["$activePlans", []] }, [activePlan]] }
          }
        }],
        { new: true, session, lean: true }
      );
      if (!updatedUser) {
        result = { error: "Solde insuffisant pour activer ce plan." };
        return;
      }

      const platform = await PlatformAccountModel.findOneAndUpdate(
        { id: "platform" },
        { $inc: { balance: investmentAmount, fees: investmentAmount }, $setOnInsert: { createdAt: nowIso() } },
        { upsert: true, new: true, session, lean: true }
      );
      const activationLedger = buildLedgerEntries([{
        accountType: "user",
        accountId: user.id,
        direction: "debit",
        amount: investmentAmount,
        balanceAfter: updatedUser.balance,
        description: `Activation ${plan.name}`
      }, {
        accountType: "platform",
        accountId: "platform",
        direction: "credit",
        amount: investmentAmount,
        balanceAfter: platform.balance,
        description: `Activation ${plan.name}`
      }], { source: "plan_activation", referenceId: activePlan.id, extra: { planId: plan.id, initiatedBy } });
      if (activationLedger.length) await LedgerEntryModel.insertMany(activationLedger, { session });
      await TransactionModel.create([{
        id: nanoid(),
        userId: user.id,
        type: "Plan",
        description: `Activation ${plan.name}`,
        amount: investmentAmount,
        displayAmount: formatAmount(investmentAmount, "-"),
        status: "Active",
        createdAt: nowIso(),
        metadata: { planId: plan.id, activePlanId: activePlan.id, initiatedBy }
      }], { session });

      const adminAccount = ADMIN_EMAIL ? await UserModel.findOne({ email: ADMIN_EMAIL }, null, { session }).lean() : null;
      const developerAccount = COMMISSION_DEVELOPER_EMAIL ? await UserModel.findOne({ email: COMMISSION_DEVELOPER_EMAIL }, null, { session }).lean() : null;
      await payDirectCommission({
        session,
        accountId: adminAccount?.id,
        amount: investmentAmount * 0.075,
        label: "Commission admin activation plan",
        source: "admin_activation_commission",
        referenceId: user.id,
        extra: { sourceUserId: user.id, rate: 0.075 }
      });
      await payDirectCommission({
        session,
        accountId: developerAccount?.id,
        amount: investmentAmount * 0.075,
        label: "Commission developpeur activation plan",
        source: "developer_activation_commission",
        referenceId: user.id,
        extra: { sourceUserId: user.id, rate: 0.075 }
      });

      result = { user: normalizeUserRecord(updatedUser), activePlan };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

async function performFastAdminAction({ action, id, amount, role, adminId, email, referrerEmail, note, levels, plan }) {
  if (action === "manual-deposit" || action === "admin-fund-add" || action === "admin-fund-deduct") {
    const targetEmail = String(email || "").trim().toLowerCase();
    if (!targetEmail || !amount) return { error: "Email et montant requis." };
    const target = await UserModel.findOne({ email: targetEmail }).lean();
    if (!target) return { error: "Utilisateur introuvable." };
    if (target.status && target.status !== "active") return { error: "Ce compte est suspendu." };

    const isDeduct = action === "admin-fund-deduct";
    const reference = `ADM-${nanoid(10).toUpperCase()}`;
    const description = isDeduct ? "Deduction admin" : "Depot manuel admin";
    const session = await mongoose.startSession();
    try {
      let result;
      await session.withTransaction(async () => {
        const updatedUser = await UserModel.findOneAndUpdate(
          {
            id: target.id,
            ...(isDeduct ? { $expr: { $gte: [{ $toDouble: { $ifNull: ["$balance", 0] } }, money(amount)] } } : {})
          },
          [{
            $set: {
              balance: {
                $round: [
                  isDeduct
                    ? { $subtract: [{ $toDouble: { $ifNull: ["$balance", 0] } }, money(amount)] }
                    : { $add: [{ $toDouble: { $ifNull: ["$balance", 0] } }, money(amount)] },
                  2
                ]
              }
            }
          }],
          { new: true, session, lean: true }
        );
        if (!updatedUser) {
          result = { error: "Solde insuffisant ou utilisateur introuvable." };
          return;
        }
        const tx = {
          id: nanoid(),
          userId: target.id,
          type: isDeduct ? "Admin" : "Depot",
          description,
          amount: money(amount),
          displayAmount: formatAmount(amount, isDeduct ? "-" : "+"),
          status: "Completed",
          createdAt: nowIso(),
          metadata: { source: action, reviewedBy: adminId, reference, note: note || "" }
        };
        await TransactionModel.create([tx], { session });
        const entries = buildLedgerEntries([{
          accountType: "user",
          accountId: target.id,
          direction: isDeduct ? "debit" : "credit",
          amount,
          balanceAfter: updatedUser.balance,
          description
        }], { source: action, referenceId: reference, extra: { reviewedBy: adminId } });
        if (entries.length) await LedgerEntryModel.insertMany(entries, { session });
        result = { reference, user: sanitizeUser(normalizeUserRecord(updatedUser)) };
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  if (action === "bonus-levels") {
    const targetEmail = String(email || "").trim().toLowerCase();
    const selectedLevels = Number(levels || 0);
    if (!targetEmail || ![5, 10, 15, 20].includes(selectedLevels)) return { error: "Email et niveau bonus valides requis." };
    const user = await UserModel.findOneAndUpdate(
      { email: targetEmail },
      { $set: { bonusLevelsOverride: selectedLevels, bonusLevelsUpdatedAt: nowIso(), bonusLevelsUpdatedBy: adminId } },
      { new: true, lean: true }
    );
    if (!user) return { error: "Utilisateur introuvable." };
    return { user: sanitizeUser(normalizeUserRecord(user)) };
  }

  if (action === "repair-referral") {
    const targetEmail = String(email || "").trim().toLowerCase();
    const sponsorEmail = String(referrerEmail || "").trim().toLowerCase();
    if (!targetEmail || !sponsorEmail) return { error: "Email filleul et email parrain requis." };
    if (targetEmail === sponsorEmail) return { error: "Un compte ne peut pas etre son propre parrain." };

    const target = normalizeUserRecord(await UserModel.findOne({ email: targetEmail }).lean());
    const sponsor = normalizeUserRecord(await UserModel.findOne({ email: sponsorEmail }).lean());
    if (!target) return { error: "Filleul introuvable." };
    if (!sponsor) return { error: "Parrain introuvable." };
    if (target.id === sponsor.id) return { error: "Un compte ne peut pas etre son propre parrain." };

    const repairedAt = nowIso();
    await UserModel.updateOne(
      { id: target.id },
      {
        $set: {
          referrerId: sponsor.id,
          referrerEmail: normalizeEmail(sponsor.email),
          referrerCode: normalizeInvitationCode(sponsor.refCode),
          referralRepairedAt: repairedAt,
          referralRepairedBy: adminId
        }
      }
    );

    return {
      user: sanitizeUser({ ...target, referrerId: sponsor.id, referrerEmail: sponsor.email, referrerCode: sponsor.refCode }),
      paidAmount: 0,
      paidCount: 0
    };
  }

  if (action === "admin-plan-activate") {
    const targetEmail = String(email || "").trim().toLowerCase();
    const target = await UserModel.findOne({ email: targetEmail }).lean();
    if (!target) return { error: "Utilisateur introuvable." };
    const selectedPlan = parsePlan(plan);
    if (!selectedPlan) return { error: "Plan inconnu." };
    return activatePlanDirect({ userId: target.id, plan: selectedPlan, amount, bypassUnlock: true, initiatedBy: adminId });
  }

  if (action === "user-suspend" || action === "user-reactivate" || action === "user-role") {
    const target = await UserModel.findOne({ id }).lean();
    if (!target) return { error: "Utilisateur introuvable." };
    if (target.id === adminId && action === "user-suspend") {
      return { error: "Un admin ne peut pas suspendre son propre compte." };
    }

    const update = {};
    if (action === "user-suspend") Object.assign(update, { status: "blocked", suspendedAt: nowIso(), suspendedBy: adminId });
    if (action === "user-reactivate") Object.assign(update, { status: "active", reactivatedAt: nowIso(), reactivatedBy: adminId });
    if (action === "user-role") Object.assign(update, { role: role || "user", roleUpdatedAt: nowIso(), roleUpdatedBy: adminId });

    const user = await UserModel.findOneAndUpdate({ id }, { $set: update }, { new: true, lean: true });
    return { user: sanitizeUser(normalizeUserRecord(user)) };
  }

  if (action !== "approve" && action !== "reject") return null;

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const tx = await TransactionModel.findOne({ id }, null, { session }).lean();
      if (!tx) {
        result = { error: "Transaction introuvable." };
        return;
      }
      if (tx.status === "Completed" || tx.status === "Rejected") {
        result = { error: "Transaction deja traitee." };
        return;
      }
      if (tx.type !== "Depot" && tx.type !== "Retrait") {
        result = { error: "Cette transaction ne se valide pas ici." };
        return;
      }

      const reviewedAt = nowIso();
      const nextStatus = action === "approve" ? "Completed" : "Rejected";

      if (tx.type === "Depot" && action === "approve") {
        const isGrsPurchase = tx.metadata?.asset === "GRSC_PURCHASE";
        const isUsdtConvertedGrsPurchase = isGrsPurchase && tx.metadata?.method === "usdt_bep20";
        const grsAmount = money(tx.metadata?.grsAmount || tx.amount);
        const grsValueUsdt = money(tx.metadata?.usdtAmount || (grsAmount * GRSCOIN_PRICE_USDT));
        const updatedUser = await UserModel.findOneAndUpdate(
          { id: tx.userId },
          [{
            $set: isGrsPurchase
              ? { grsBalance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$grsBalance", 0] } }, grsAmount] }, 2] } }
              : { balance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$balance", 0] } }, money(tx.amount)] }, 2] } }
          }],
          { new: true, session, lean: true }
        );
        if (!updatedUser) {
          result = { error: "Utilisateur introuvable." };
          return;
        }
        const platform = isGrsPurchase ? await PlatformAccountModel.findOneAndUpdate(
          { id: "platform" },
          { $inc: { balance: grsValueUsdt }, $setOnInsert: { createdAt: nowIso(), fees: 0 } },
          { upsert: true, new: true, session, lean: true }
        ) : null;
        const depositLedgerRows = [{
          accountType: isGrsPurchase ? "user_grs" : "user",
          accountId: tx.userId,
          direction: "credit",
          amount: isGrsPurchase ? grsAmount : tx.amount,
          balanceAfter: isGrsPurchase ? updatedUser.grsBalance : updatedUser.balance,
          description: tx.description || "Depot approuve"
        }];
        if (isGrsPurchase) {
          depositLedgerRows.push({
            accountType: "platform",
            accountId: "platform",
            direction: "credit",
            amount: grsValueUsdt,
            balanceAfter: platform?.balance || grsValueUsdt,
            description: "Depot GRSCOIN - valeur recue"
          });
        }
        const commissionRows = [];
        const commissionTransactions = [];
        if (isUsdtConvertedGrsPurchase) {
          const adminCommission = money(grsValueUsdt * GRSCOIN_SWAP_ADMIN_RATE);
          const developerCommission = money(grsValueUsdt * GRSCOIN_SWAP_DEVELOPER_RATE);
          const platformCommission = money(grsValueUsdt * GRSCOIN_SWAP_PLATFORM_RATE);
          let platformBalanceAfterDebits = money(platform?.balance || 0);
          const payoutTargets = [
            {
              rate: GRSCOIN_SWAP_ADMIN_RATE,
              amount: adminCommission,
              email: ADMIN_EMAIL,
              accountType: "admin",
              description: "Commission admin AFRIX Swap"
            },
            {
              rate: GRSCOIN_SWAP_DEVELOPER_RATE,
              amount: developerCommission,
              email: COMMISSION_DEVELOPER_EMAIL,
              accountType: "developer",
              description: "Commission developpeur AFRIX Swap"
            },
            {
              rate: GRSCOIN_SWAP_PLATFORM_RATE,
              amount: platformCommission,
              email: PLATFORM_EMAIL,
              accountType: "platform_user",
              description: "Commission plateforme AFRIX Swap"
            }
          ];
          for (const target of payoutTargets) {
            if (!target.amount || !target.email) continue;
            platformBalanceAfterDebits = money(platformBalanceAfterDebits - target.amount);
            const creditedUser = await UserModel.findOneAndUpdate(
              { email: target.email },
              [{
                $set: {
                  balance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$balance", 0] } }, target.amount] }, 2] },
                  bonus: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$bonus", 0] } }, target.amount] }, 2] }
                }
              }],
              { new: true, session, lean: true }
            );
            if (!creditedUser) continue;
            commissionRows.push({
              accountType: "platform",
              accountId: "platform",
              direction: "debit",
              amount: target.amount,
              balanceAfter: platformBalanceAfterDebits,
              description: target.description
            }, {
              accountType: target.accountType,
              accountId: creditedUser.id,
              direction: "credit",
              amount: target.amount,
              balanceAfter: creditedUser.balance,
              description: target.description
            });
            commissionTransactions.push({
              id: nanoid(),
              userId: creditedUser.id,
              type: "Commission",
              description: "Commission AFRIX Swap",
              amount: target.amount,
              displayAmount: formatAmount(target.amount, "+"),
              status: "Completed",
              createdAt: nowIso(),
              metadata: { source: "afrix_swap_commission", swapId: tx.id, rate: target.rate, sourceDeposit: true }
            });
          }
          if (platformBalanceAfterDebits !== money(platform?.balance || 0)) {
            await PlatformAccountModel.updateOne({ id: "platform" }, { $set: { balance: platformBalanceAfterDebits } }, { session });
          }
        }
        const entries = buildLedgerEntries(depositLedgerRows, { source: "admin_deposit_approval", referenceId: tx.id, extra: { reviewedBy: adminId } });
        if (entries.length) await LedgerEntryModel.insertMany(entries, { session });
        if (commissionRows.length) {
          const commissionEntries = buildLedgerEntries(commissionRows, {
            source: "grscoin_purchase_commissions",
            referenceId: tx.id,
            extra: { reviewedBy: adminId, valueUsdt: grsValueUsdt }
          });
          if (commissionEntries.length) await LedgerEntryModel.insertMany(commissionEntries, { session });
        }
        if (commissionTransactions.length) await TransactionModel.insertMany(commissionTransactions, { session });

        if (isUsdtConvertedGrsPurchase) {
          const buyer = normalizeUserRecord(updatedUser);
          let currentReferrer = { id: buyer.referrerId, email: buyer.referrerEmail, code: buyer.referrerCode };
          for (let level = 0; level < GRSCOIN_REFERRAL_RATES.length && (currentReferrer.id || currentReferrer.email || currentReferrer.code); level += 1) {
            const referrerQuery = [];
            if (currentReferrer.id) referrerQuery.push({ id: currentReferrer.id });
            if (currentReferrer.email) referrerQuery.push({ email: normalizeEmail(currentReferrer.email) });
            if (currentReferrer.code) referrerQuery.push({ refCode: normalizeInvitationCode(currentReferrer.code) });
            const referrer = referrerQuery.length ? normalizeUserRecord(await UserModel.findOne({ $or: referrerQuery }, null, { session }).lean()) : null;
            if (!referrer) break;
            if (unlockedReferralLevels(referrer) <= level) {
              currentReferrer = { id: referrer.referrerId, email: referrer.referrerEmail, code: referrer.referrerCode };
              continue;
            }
            const bonus = money(grsValueUsdt * GRSCOIN_REFERRAL_RATES[level]);
            if (bonus > 0) {
              const updatedReferrer = await UserModel.findOneAndUpdate(
                { id: referrer.id },
                [{
                  $set: {
                    balance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$balance", 0] } }, bonus] }, 2] },
                    bonus: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$bonus", 0] } }, bonus] }, 2] }
                  }
                }],
                { new: true, session, lean: true }
              );
              const bonusPlatform = await PlatformAccountModel.findOneAndUpdate(
                { id: "platform" },
                { $inc: { balance: -bonus }, $setOnInsert: { createdAt: nowIso(), fees: 0 } },
                { upsert: true, new: true, session, lean: true }
              );
              const bonusEntries = buildLedgerEntries([{
                accountType: "platform",
                accountId: "platform",
                direction: "debit",
                amount: bonus,
                balanceAfter: bonusPlatform.balance,
                description: `Bonus achat GRSCOIN niveau ${level + 1}`
              }, {
                accountType: "user",
                accountId: referrer.id,
                direction: "credit",
                amount: bonus,
                balanceAfter: updatedReferrer?.balance || money(referrer.balance + bonus),
                description: `Bonus achat GRSCOIN niveau ${level + 1}`
              }], { source: "grscoin_purchase_referral", referenceId: tx.id, extra: { buyerId: buyer.id, level: level + 1, rate: GRSCOIN_REFERRAL_RATES[level] } });
              if (bonusEntries.length) await LedgerEntryModel.insertMany(bonusEntries, { session });
              await TransactionModel.create([{
                id: nanoid(),
                userId: referrer.id,
                type: "Bonus",
                description: `Bonus achat GRSCOIN niveau ${level + 1}`,
                amount: bonus,
                displayAmount: formatAmount(bonus, "+"),
                status: "Completed",
                createdAt: nowIso(),
                metadata: { sourceUserId: buyer.id, source: "grscoin_purchase_referral", level: level + 1, rate: GRSCOIN_REFERRAL_RATES[level], purchaseId: tx.id }
              }], { session });
            }
            currentReferrer = { id: referrer.referrerId, email: referrer.referrerEmail, code: referrer.referrerCode };
          }
        }
      }

      if (tx.type === "Retrait") {
        const isGrsWithdrawal = tx.metadata?.asset === "GRSC_WITHDRAWAL";
        if (isGrsWithdrawal) {
          const grsAmount = money(tx.metadata?.grsAmount || tx.amount);
          const feeGrsAmount = money(tx.metadata?.fee || 0);
          const netGrsAmount = money(tx.metadata?.netAmount || grsAmount);
          if (action === "approve") {
            const withdrawalRows = [{
              accountType: "external_grs",
              accountId: tx.metadata?.address || "external",
              direction: "credit",
              amount: netGrsAmount,
              balanceAfter: 0,
              description: "Retrait GRSCOIN approuve"
            }];
            if (PLATFORM_EMAIL && feeGrsAmount > 0) {
              const platformUser = await UserModel.findOneAndUpdate(
                { email: PLATFORM_EMAIL },
                [{
                  $set: {
                    grsBalance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$grsBalance", 0] } }, feeGrsAmount] }, 2] }
                  }
                }],
                { new: true, session, lean: true }
              );
              if (platformUser) {
                withdrawalRows.push({
                  accountType: "platform_user_grs",
                  accountId: platformUser.id,
                  direction: "credit",
                  amount: feeGrsAmount,
                  balanceAfter: platformUser.grsBalance,
                  description: "Frais retrait GRSCOIN"
                });
                await TransactionModel.create([{
                  id: nanoid(),
                  userId: platformUser.id,
                  type: "Frais",
                  description: "Frais retrait GRSCOIN",
                  amount: feeGrsAmount,
                  displayAmount: `+${feeGrsAmount.toFixed(2)} GRSC`,
                  status: "Completed",
                  createdAt: nowIso(),
                  metadata: { source: "grscoin_withdrawal_fee", withdrawalId: tx.id, sourceUserId: tx.userId }
                }], { session });
              }
            }
            const entries = buildLedgerEntries(withdrawalRows, { source: "admin_grs_withdrawal_approval", referenceId: tx.id, extra: { reviewedBy: adminId, userId: tx.userId } });
            if (entries.length) await LedgerEntryModel.insertMany(entries, { session });
          } else {
            const updatedUser = await UserModel.findOneAndUpdate(
              { id: tx.userId },
              [{
                $set: {
                  grsBalance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$grsBalance", 0] } }, grsAmount] }, 2] }
                }
              }],
              { new: true, session, lean: true }
            );
            if (!updatedUser) {
              result = { error: "Utilisateur introuvable." };
              return;
            }
            const entries = buildLedgerEntries([{
              accountType: "user_grs",
              accountId: tx.userId,
              direction: "credit",
              amount: grsAmount,
              balanceAfter: updatedUser.grsBalance,
              description: "Retrait GRSCOIN rejete"
            }], { source: "admin_grs_withdrawal_rejection", referenceId: tx.id, extra: { reviewedBy: adminId } });
            if (entries.length) await LedgerEntryModel.insertMany(entries, { session });
          }
        } else {
        const reservedAmount = money(tx.metadata?.reservedAmount || tx.amount);
        const feeAmount = money(tx.metadata?.fee || 0);
        if (action === "approve") {
          const updatedUser = await UserModel.findOneAndUpdate(
            {
              id: tx.userId,
              $expr: { $gte: [{ $toDouble: { $ifNull: ["$reservedBalance", 0] } }, reservedAmount] }
            },
            [{
              $set: {
                reservedBalance: { $round: [{ $subtract: [{ $toDouble: { $ifNull: ["$reservedBalance", 0] } }, reservedAmount] }, 2] }
              }
            }],
            { new: true, session, lean: true }
          );
          if (!updatedUser) {
            result = { error: "Reserve insuffisante pour valider ce retrait." };
            return;
          }
          const entries = buildLedgerEntries([{
            accountType: "user_reserved",
            accountId: tx.userId,
            direction: "debit",
            amount: reservedAmount,
            balanceAfter: updatedUser.reservedBalance,
            description: tx.description || "Retrait approuve"
          }], { source: "admin_withdrawal_approval", referenceId: tx.id, extra: { reviewedBy: adminId } });
          if (entries.length) await LedgerEntryModel.insertMany(entries, { session });

          if (feeAmount > 0) {
            const platform = await PlatformAccountModel.findOneAndUpdate(
              { id: "platform" },
              { $inc: { balance: feeAmount, fees: feeAmount }, $setOnInsert: { createdAt: nowIso() } },
              { upsert: true, new: true, session, lean: true }
            );
            const feeEntries = buildLedgerEntries([{
              accountType: "platform",
              accountId: "platform",
              direction: "credit",
              amount: feeAmount,
              balanceAfter: platform.balance,
              description: `Frais ${tx.description || "Retrait approuve"}`
            }], { source: "admin_withdrawal_fee", referenceId: tx.id, extra: { reviewedBy: adminId, userId: tx.userId } });
            if (feeEntries.length) await LedgerEntryModel.insertMany(feeEntries, { session });
            await creditPlatformUserFee({
              amount: feeAmount,
              description: `Frais ${tx.description || "Retrait approuve"}`,
              source: "admin_withdrawal_fee",
              referenceId: tx.id,
              extra: { reviewedBy: adminId, userId: tx.userId, method: tx.metadata?.method || "" },
              session
            });
          }
        } else {
          const updatedUser = await UserModel.findOneAndUpdate(
            {
              id: tx.userId,
              $expr: { $gte: [{ $toDouble: { $ifNull: ["$reservedBalance", 0] } }, reservedAmount] }
            },
            [{
              $set: {
                reservedBalance: { $round: [{ $subtract: [{ $toDouble: { $ifNull: ["$reservedBalance", 0] } }, reservedAmount] }, 2] },
                balance: { $round: [{ $add: [{ $toDouble: { $ifNull: ["$balance", 0] } }, reservedAmount] }, 2] }
              }
            }],
            { new: true, session, lean: true }
          );
          if (!updatedUser) {
            result = { error: "Reserve insuffisante pour rejeter ce retrait." };
            return;
          }
          const entries = buildLedgerEntries([{
            accountType: "user_reserved",
            accountId: tx.userId,
            direction: "debit",
            amount: reservedAmount,
            balanceAfter: updatedUser.reservedBalance,
            description: tx.description || "Retrait rejete"
          }, {
            accountType: "user",
            accountId: tx.userId,
            direction: "credit",
            amount: reservedAmount,
            balanceAfter: updatedUser.balance,
            description: `${tx.description || "Retrait"} - retour disponible`
          }], { source: "admin_withdrawal_rejection", referenceId: tx.id, extra: { reviewedBy: adminId } });
          if (entries.length) await LedgerEntryModel.insertMany(entries, { session });
        }
        }
      }

      const txUpdate = await TransactionModel.updateOne(
        { id, status: tx.status },
        {
          $set: {
            status: nextStatus,
            "metadata.reviewedAt": reviewedAt,
            "metadata.reviewedBy": adminId
          }
        },
        { session }
      );
      if (!txUpdate.matchedCount) {
        result = { error: "Transaction deja traitee." };
        return;
      }

      result = { transaction: { ...tx, status: nextStatus, metadata: { ...(tx.metadata || {}), reviewedAt, reviewedBy: adminId } } };
    });
    return result;
  } finally {
    await session.endSession();
  }
}

app.post("/api/admin/actions", authenticate, requireAdmin, validate(z.object({
  action: z.string().min(1),
  id: z.string().optional(),
  amount: z.coerce.number().positive().optional(),
  email: z.string().email().optional(),
  referrerEmail: z.string().email().optional(),
  password: z.string().min(10).optional(),
  fullName: z.string().min(2).optional(),
  note: z.string().max(300).optional(),
  levels: z.coerce.number().optional(),
  plan: z.string().optional(),
  role: z.enum(["user", "admin"]).optional(),
  status: z.enum(["active", "blocked"]).optional()
})), async (req, res) => {
  const fastResult = await performFastAdminAction({
    action: req.body.action,
    id: req.body.id,
    amount: req.body.amount,
    role: req.body.role,
    adminId: req.user.id,
    email: req.body.email,
    referrerEmail: req.body.referrerEmail,
    note: req.body.note,
    levels: req.body.levels,
    plan: req.body.plan
  });
  if (fastResult) {
    if (fastResult.error) return res.status(400).json({ message: fastResult.error });
    res.json(fastResult);
    if (fastResult.transaction) notifyTransactionDecision(fastResult.transaction);
    if (fastResult.activePlan) notifyPlanActivation(fastResult.user, fastResult.activePlan, fastResult.activePlan.amount);
    return;
  }

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
        grsBalance: 0,
        reservedBalance: 0,
        activity: 0,
        bonus: 0,
        wallet: "",
        refCode: stableRefCodeFromEmail(email),
        referrerId: null,
        merchantWallet: { available: 0, pending: 0, bonus: 0 },
        activePlans: [],
        activeStakes: [],
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

    if (action === "manual-deposit") {
      const email = String(req.body.email || "").trim().toLowerCase();
      if (!email || !amount) return { error: "Email et montant requis." };
      const target = db.users.find((candidate) => String(candidate.email || "").toLowerCase() === email);
      if (!target) return { error: "Utilisateur introuvable." };
      if (target.status && target.status !== "active") return { error: "Ce compte est suspendu." };
      const reference = `ADM-${nanoid(10).toUpperCase()}`;
      const description = "Depot manuel admin";
      creditUser(db, target, amount, description, {
        source: "admin_manual_deposit",
        referenceId: reference,
        extra: { reviewedBy: req.user.id, note: req.body.note || "" }
      });
      addTransaction(db, {
        userId: target.id,
        type: "Depot",
        description,
        amount,
        displayAmount: formatAmount(amount, "+"),
        status: "Completed",
        metadata: {
          source: "admin_manual_deposit",
          reviewedBy: req.user.id,
          reference,
          note: req.body.note || ""
        }
      });
      return { reference, user: sanitizeUser(target) };
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
        const feeAmount = money(tx.metadata.fee || 0);
        if (action === "approve") {
          if (money(user.reservedBalance) >= reservedAmount) {
            consumeReservedFunds(db, user, reservedAmount, tx.description || "Retrait approuve", {
              source: "admin_withdrawal_approval",
              referenceId: tx.id
            });
            if (feeAmount > 0) {
              creditPlatform(db, feeAmount, `Frais ${tx.description || "Retrait approuve"}`, {
                source: "admin_withdrawal_fee",
                referenceId: tx.id,
                extra: { userId: user.id, method: tx.metadata.method || "" }
              });
            }
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
  if (req.path === "/service-worker.js") {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  } else if (req.path.endsWith(".html") || req.path === "/") {
    res.set("Cache-Control", "no-cache, must-revalidate");
  }
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
      res.set("Cache-Control", "no-cache, must-revalidate");
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
  ensureDailyPlanEarnings()
    .then((result) => {
      if (result.creditedUsers) logger.info(result, "Daily plan earnings processed");
      if (result.skippedInvalidPlans) logger.error(result, "Invalid active plans skipped during daily earnings");
    })
    .catch((error) => logger.error({ err: error }, "Daily plan earnings failed"));
}

async function bootstrapServer() {
  const skipStorageBoot = !isProduction && process.env.AFRIX_TEST_SKIP_STORAGE_BOOT === "1";
  if (!skipStorageBoot) {
    await ensureStorage();
    await ensureAdminUser();
    await ensurePlatformUser();
    await ensureCommissionAccounts();
    await ensureReferralCodes();
    await reconcileReferralLinks();
  } else {
    logger.warn("Storage bootstrap skipped for local smoke test");
  }

  app.listen(PORT, () => {
    logger.info(`AFRIX server listening on http://localhost:${PORT}`);
  });

  runDailyPlanEarnings();
  const referralReconcileTimer = setInterval(() => {
    reconcileReferralLinks().catch((error) => logger.error({ err: error }, "Referral reconciliation failed"));
  }, 5 * 60 * 1000);
  referralReconcileTimer.unref?.();
  const planEarningsTimer = setInterval(runDailyPlanEarnings, PLAN_EARNINGS_INTERVAL_MS);
  planEarningsTimer.unref?.();
}

bootstrapServer().catch((error) => {
  logger.error({ err: error }, "Server bootstrap failed");
  process.exit(1);
});
