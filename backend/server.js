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
import { promises as fs } from "fs";
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
  dataDir,
  dbFile,
  defaultDb,
  isConfiguredAdminEmail,
  isProduction,
  jwtSecret,
  legacyPageRoutes,
  logger,
  pageRoutes,
  plans,
  publicFiles,
  rootDir,
  uploadDir
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
  LedgerEntryModel,
  MerchantApplicationModel,
  PlatformAccountModel,
  SettingModel,
  TransactionModel,
  UserModel,
  mongoose
} from "./models.js";

let useMongo = Boolean(MONGODB_URI);
let mongoReadyPromise = null;

function normalizeDb(db = {}) {
  return {
    ...defaultDb,
    ...db,
    users: Array.isArray(db.users) ? db.users.map(normalizeUserRecord) : [],
    transactions: Array.isArray(db.transactions) ? db.transactions : [],
    cicoRequests: Array.isArray(db.cicoRequests) ? db.cicoRequests : [],
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
  await fs.mkdir(uploadDir, { recursive: true });

  if (useMongo) {
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
      return;
    } catch (error) {
      logger.error({ err: error }, "Mongo unavailable");
      if (isProduction) {
        throw new Error("MongoDB is required in production.");
      }
      useMongo = false;
      mongoReadyPromise = null;
    }
  }

  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dbFile);
  } catch {
    await writeDb(defaultDb);
  }
}

async function readDb(session = null) {
  await ensureStorage();
  if (useMongo) {
    const queryOptions = session ? { session } : {};
    let users;
    let transactions;
    let cicoRequests;
    let merchantApplications;
    let disputes;
    let ledgerEntries;
    let settings;
    let platformAccount;
    if (session) {
      users = await UserModel.find({}, null, queryOptions).lean();
      transactions = await TransactionModel.find({}, null, queryOptions).lean();
      cicoRequests = await CicoRequestModel.find({}, null, queryOptions).lean();
      merchantApplications = await MerchantApplicationModel.find({}, null, queryOptions).lean();
      disputes = await DisputeModel.find({}, null, queryOptions).lean();
      ledgerEntries = await LedgerEntryModel.find({}, null, queryOptions).lean();
      settings = await SettingModel.find({}, null, queryOptions).lean();
      platformAccount = await PlatformAccountModel.findOne({ id: "platform" }, null, queryOptions).lean();
    } else {
      [users, transactions, cicoRequests, merchantApplications, disputes, ledgerEntries, settings, platformAccount] = await Promise.all([
        UserModel.find({}, null, queryOptions).lean(),
        TransactionModel.find({}, null, queryOptions).lean(),
        CicoRequestModel.find({}, null, queryOptions).lean(),
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
      merchantApplications,
      disputes,
      ledgerEntries,
      passwordResetTokens: settingMap.passwordResetTokens,
      platformAccount,
      platformControls: settingMap.platformControls,
      paymentTargets: settingMap.paymentTargets
    });
  }

  const raw = await fs.readFile(dbFile, "utf8");
  const parsed = JSON.parse(raw);
  return normalizeDb(parsed);
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
  if (useMongo) {
    await ensureStorage();
    const keepExisting = { removeMissing: false };
    await syncCollection(UserModel, db.users, "id", session, keepExisting);
    await syncCollection(TransactionModel, db.transactions, "id", session, keepExisting);
    await syncCollection(CicoRequestModel, db.cicoRequests, "id", session, keepExisting);
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
    return;
  }

  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dbFile, JSON.stringify(db, null, 2));
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
  if (!useMongo) {
    const db = await readDb();
    const result = await mutator(db);
    await writeDb(db);
    return result;
  }

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
      .filter((tx) => user.role === "admin" || tx.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((tx) => ({
        id: tx.id,
        date: tx.createdAt.slice(0, 10),
        type: tx.type,
        description: tx.description,
        amount: tx.displayAmount,
        status: tx.status
      })),
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
    merchantApplications: user.role === "admin" ? db.merchantApplications : db.merchantApplications.filter((item) => item.userId === user.id),
    disputes: user.role === "admin" ? db.disputes : db.disputes.filter((item) => item.userId === user.id),
    platformControls: user.role === "admin" ? db.platformControls : {}
    ,
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
  if (useMongo) {
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

  return updateDb(async (db) => {
    let admin = db.users.find((user) => user.email === ADMIN_EMAIL);
    if (!admin) {
      admin = {
        id: nanoid(),
        email: ADMIN_EMAIL,
        fullName: ADMIN_NAME,
        passwordHash,
        role: "admin",
        status: "active",
        balance: 0,
        activity: 0,
        bonus: 0,
        wallet: "",
        refCode: `AFX-${nanoid(8).toUpperCase()}`,
        referrerId: null,
        merchantWallet: { available: 0, pending: 0, bonus: 0 },
        createdAt: nowIso()
      };
      db.users.push(admin);
    } else {
      admin.role = "admin";
      admin.status = "active";
      admin.fullName = admin.fullName || ADMIN_NAME;
      if (ADMIN_PASSWORD) {
        admin.passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
      }
    }

    logger.info({ email: maskEmail(admin.email), userId: admin.id }, "Admin account ready");
    return sanitizeUser(admin);
  });
}

const app = express();
const upload = multer({
  dest: uploadDir,
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
    res.json({ status: "ok", mode: useMongo ? "mongo" : "json", time: nowIso() });
  } catch (error) {
    logger.error({ err: error }, "Healthcheck storage check failed");
    res.status(503).json({
      status: "degraded",
      mode: useMongo ? "mongo" : "json",
      time: nowIso(),
      message: "Storage not fully reachable."
    });
  }
});

app.post("/api/auth/register", validate(z.object({
  email: z.string().email(),
  password: z.string().min(10),
  ref: z.string().optional()
})), async (req, res) => {
  const { email, password, ref } = req.body;
  const normalizedEmail = email.trim().toLowerCase();

  const createUserRecord = async (referrerId = null) => ({
    id: nanoid(),
    email: normalizedEmail,
    fullName: normalizedEmail.split("@")[0],
    passwordHash: await bcrypt.hash(password, 12),
    role: isConfiguredAdminEmail(normalizedEmail) ? "admin" : "user",
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

  const result = useMongo
    ? await (async () => {
      await ensureStorage();
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
    })()
    : await updateDb(async (db) => {
      if (db.users.some((user) => user.email === normalizedEmail)) {
        return { error: "Cet email est deja enregistre." };
      }

      const referrer = ref ? db.users.find((user) => user.refCode === ref) : null;
      const user = await createUserRecord(referrer?.id || null);

      db.users.push(user);
      return { user };
    });

  if (result.error) return res.status(409).json({ message: result.error });
  await sendBrevoMail({
    to: result.user.email,
    subject: "AFRIX - Bienvenue",
    title: "Votre compte AFRIX est pret",
    intro: "Votre espace AFRIX a ete cree avec succes.",
    rows: [
      { label: "Email", value: result.user.email },
      { label: "Role", value: result.user.role }
    ],
    actionLabel: "Acceder au tableau de bord",
    actionUrl: `${APP_URL}/dashboard`
  });
  await notifyAdmin("AFRIX - Nouvelle inscription", "Nouvelle inscription", "Un nouveau compte vient d'etre cree.", [
    { label: "Email", value: result.user.email },
    { label: "Role", value: result.user.role }
  ]);
  res.status(201).json({ token: signToken(result.user), user: sanitizeUser(result.user) });
});

app.post("/api/auth/login", validate(z.object({
  email: z.string().email(),
  password: z.string().min(1)
})), async (req, res) => {
  const normalizedEmail = req.body.email.trim().toLowerCase();
  if (useMongo) await ensureStorage();
  const user = useMongo
    ? normalizeUserRecord(await UserModel.findOne({ email: normalizedEmail }).sort({ updatedAt: -1, createdAt: -1 }).lean())
    : (await readDb()).users.find((candidate) => candidate.email === normalizedEmail);
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
    await sendBrevoMail({
      to: normalizedEmail,
      subject: "AFRIX - Reinitialisation du mot de passe",
      title: "Reinitialisation du mot de passe",
      intro: "Utilisez ce lien pour definir un nouveau mot de passe. Il expire dans 1 heure.",
      rows: [{ label: "Compte", value: normalizedEmail }],
      actionLabel: "Reinitialiser le mot de passe",
      actionUrl: resetUrl
    });
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
  if (amount < 10) return res.status(400).json({ message: "Montant minimum depot: 10 USDT." });
  if (!["bep20", "trc20"].includes(method)) {
    return res.status(400).json({ message: "Seuls les depots USDT BEP20 et TRC20 sont disponibles." });
  }
  if (!txRef) {
    return res.status(400).json({ message: "Reference transaction crypto requise." });
  }
  if (!req.file?.filename) {
    return res.status(400).json({ message: "Preuve de paiement requise." });
  }

  const result = await updateDb(async (db) => {
    const user = db.users.find((candidate) => candidate.id === req.user.id);
    if (method === "mobile" || method === "airtel") {
      const request = {
        id: nanoid(),
        reference: makeReference("DP", amount),
        type: "Depot",
        userId: user.id,
        customer: user.email,
        country: req.body.country || "Congo",
        amount: money(amount),
        fee: 0,
        merchantBonus: money(amount * 0.005),
        method,
        phone: req.body.phone || "",
        status: "En attente merchant",
        createdAt: nowIso()
      };
      db.cicoRequests.push(request);
      return { request };
    }

    const tx = {
      id: nanoid(),
      userId: user.id,
      type: "Depot",
      description: `Depot wallet ${method.toUpperCase()}`,
      amount: money(amount),
      displayAmount: formatAmount(amount, "+"),
      status: "Pending",
      createdAt: nowIso(),
      metadata: {
        method,
        txRef,
        proofFile: req.file?.filename || null
      }
    };
    db.transactions.push(tx);
    return { transaction: tx };
  });

  res.status(201).json({
    reference: result.request?.reference,
    amount,
    fee: result.request?.fee || 0,
    status: result.request?.status || result.transaction?.status
  });

  await sendBrevoMail({
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
  });
  await notifyAdmin("AFRIX - Depot a traiter", "Depot a traiter", "Une demande de depot est en attente.", [
    { label: "Client", value: req.user.email },
    { label: "Methode", value: method.toUpperCase() },
    { label: "Montant", value: formatAmount(amount) }
  ]);
});

app.post("/api/withdrawals", authenticate, requirePlatformAccess(), validate(z.object({
  method: z.literal("bep20"),
  amount: z.coerce.number().positive(),
  address: z.string().optional(),
  phone: z.string().optional(),
  beneficiary: z.string().optional()
})), async (req, res) => {
  const { amount, method } = req.body;
  const address = String(req.body.address || "").trim();
  if (amount < 10) return res.status(400).json({ message: "Montant minimum retrait: 10 USDT." });
  if (!address) {
    return res.status(400).json({ message: "Adresse wallet BEP20 requise." });
  }

  const result = await updateDb(async (db) => {
    const user = db.users.find((candidate) => candidate.id === req.user.id);
    const fee = 0;
    if (user.balance < amount + fee) return { error: "Solde insuffisant." };

    reserveUserFunds(db, user, amount, `Retrait wallet ${method.toUpperCase()}`, {
      source: "withdrawal_request"
    });
    const tx = {
      id: nanoid(),
      userId: user.id,
      type: "Retrait",
      description: `Retrait wallet ${method.toUpperCase()}`,
      amount: money(amount),
      displayAmount: formatAmount(amount, "-"),
      status: "Pending",
      createdAt: nowIso(),
      metadata: { method, address, reservedAmount: money(amount) }
    };
    db.transactions.push(tx);
    return { transaction: tx };
  });

  if (result.error) return res.status(400).json({ message: result.error });
  res.status(201).json({
    reference: result.request?.reference,
    amount,
    fee: result.request?.fee || 0,
    status: result.request?.status || result.transaction?.status
  });

  await sendBrevoMail({
    to: req.user.email,
    subject: "AFRIX - Retrait soumis",
    title: "Votre retrait est en traitement",
    intro: "Votre demande de retrait a ete soumise.",
    rows: [
      { label: "Methode", value: method.toUpperCase() },
      { label: "Montant", value: formatAmount(amount) },
      { label: "Frais", value: formatAmount(result.request?.fee || 0) },
      { label: "Reference", value: result.request?.reference || result.transaction?.id },
      { label: "Statut", value: result.request?.status || result.transaction?.status }
    ]
  });
  await notifyAdmin("AFRIX - Retrait a traiter", "Retrait a traiter", "Une demande de retrait est en attente.", [
    { label: "Client", value: req.user.email },
    { label: "Methode", value: method.toUpperCase() },
    { label: "Montant", value: formatAmount(amount) }
  ]);
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
  await sendBrevoMail({
    to: req.user.email,
    subject: "AFRIX - Demande merchant recue",
    title: "Votre demande merchant est en validation",
    intro: "L'equipe AFRIX va verifier votre profil merchant.",
    rows: [
      { label: "Nom commercial", value: application.businessName },
      { label: "Ville", value: `${application.city}, ${application.country}` },
      { label: "Garantie", value: formatAmount(application.guarantee) }
    ]
  });
  await notifyAdmin("AFRIX - Nouvelle demande merchant", "Demande merchant", "Un utilisateur demande le statut merchant.", [
    { label: "Utilisateur", value: req.user.email },
    { label: "Nom commercial", value: application.businessName },
    { label: "Garantie", value: formatAmount(application.guarantee) }
  ]);
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
  await notifyAdmin("AFRIX - Nouveau litige", "Nouveau litige", "Un utilisateur a ouvert un litige.", [
    { label: "Utilisateur", value: req.user.email },
    { label: "Reference", value: dispute.reference },
    { label: "Motif", value: dispute.reason }
  ]);
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

app.post("/api/admin/actions", authenticate, requireAdmin, validate(z.object({
  action: z.string().min(1),
  id: z.string().optional(),
  amount: z.coerce.number().positive().optional()
})), async (req, res) => {
  const result = await updateDb(async (db) => {
    const { action, id, amount } = req.body;

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
  await notifyAdmin("AFRIX - Action admin executee", "Action admin executee", "Une action admin vient d'etre appliquee.", [
    { label: "Action", value: req.body.action },
    { label: "Identifiant", value: req.body.id || "" }
  ]);
  res.json(result);
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
  await ensureStorage();
  const server = app.listen(PORT, () => {
    logger.info(`AFRIX server listening on http://localhost:${PORT}`);
  });

  ensureAdminUser().catch((error) => {
    logger.error({ err: error }, "Admin bootstrap failed");
    if (isProduction) server.close(() => process.exit(1));
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
