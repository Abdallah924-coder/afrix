import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { nanoid } from "nanoid";
import multer from "multer";
import pino from "pino";
import pinoHttp from "pino-http";
import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(__dirname, "data");
const uploadDir = path.join(__dirname, "uploads");
const dbFile = path.join(dataDir, "db.json");
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || "";
const TOKEN_TTL = process.env.TOKEN_TTL || "7d";
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "*";
const MONGODB_URI = String(process.env.MONGODB_URI || "").trim();
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "");
const ADMIN_NAME = process.env.ADMIN_NAME || "Administrateur AFRIX";
const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_API_KEY = String(process.env.BREVO_API_KEY || "");
const BREVO_SENDER_EMAIL = String(process.env.BREVO_SENDER_EMAIL || "");
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "AFRIX";
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || BREVO_SENDER_EMAIL;
const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || ADMIN_EMAIL;
const isProduction = process.env.NODE_ENV === "production";

function isConfiguredAdminEmail(email) {
  return Boolean(ADMIN_EMAIL && String(email || "").trim().toLowerCase() === ADMIN_EMAIL);
}

const pageRoutes = {
  "/": "index.html",
  "/login": "pages/login.html",
  "/register": "pages/register.html",
  "/dashboard": "pages/dashboard.html",
  "/wallet": "pages/wallet.html",
  "/transactions": "pages/transactions.html",
  "/plans": "pages/plans.html",
  "/network": "pages/network.html",
  "/afrix-money": "pages/afrix-money.html",
  "/merchant": "pages/merchant.html",
  "/elite": "pages/elite.html",
  "/admin": "pages/admin.html",
  "/maintenance": "pages/maintenance.html"
};

const legacyPageRoutes = new Map([
  ["/index.html", "/"],
  ...Object.entries(pageRoutes)
    .filter(([route]) => route !== "/")
    .map(([route, file]) => [`/${file}`, route]),
  ...Object.entries(pageRoutes)
    .filter(([route]) => route !== "/")
    .map(([route, file]) => [`/${path.basename(file)}`, route])
]);

const publicFiles = new Set([
  "/app.js",
  "/styles.css",
  "/IMG-20260609-WA0003.jpg"
]);

if (isProduction && JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set to at least 32 characters in production.");
}

if (isProduction) {
  const missing = ["MONGODB_URI", "APP_URL", "PUBLIC_ORIGIN", "ADMIN_EMAIL", "ADMIN_PASSWORD"]
    .filter((key) => !String(process.env[key] || "").trim());
  if (missing.length) {
    throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  }
  if (ADMIN_PASSWORD.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters in production.");
  }
}

const jwtSecret = JWT_SECRET || "dev-only-change-this-secret-before-production";
let useMongo = Boolean(MONGODB_URI);
let mongoReadyPromise = null;

const flexibleOptions = { timestamps: true, minimize: false, strict: false };
const UserModel = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, index: true }
}, flexibleOptions));
const TransactionModel = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  status: { type: String, index: true },
  createdAt: { type: String, index: true }
}, flexibleOptions));
const CicoRequestModel = mongoose.models.CicoRequest || mongoose.model("CicoRequest", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  reference: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  merchantId: { type: String, index: true },
  status: { type: String, index: true },
  createdAt: { type: String, index: true }
}, flexibleOptions));
const MerchantApplicationModel = mongoose.models.MerchantApplication || mongoose.model("MerchantApplication", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  status: { type: String, index: true },
  createdAt: { type: String, index: true }
}, flexibleOptions));
const DisputeModel = mongoose.models.Dispute || mongoose.model("Dispute", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true, index: true },
  reference: { type: String, index: true },
  status: { type: String, index: true },
  createdAt: { type: String, index: true }
}, flexibleOptions));
const LedgerEntryModel = mongoose.models.LedgerEntry || mongoose.model("LedgerEntry", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  groupId: { type: String, required: true, index: true },
  accountType: { type: String, required: true, index: true },
  accountId: { type: String, required: true, index: true },
  direction: { type: String, required: true },
  amount: { type: Number, required: true },
  createdAt: { type: String, index: true }
}, flexibleOptions));
const SettingModel = mongoose.models.Setting || mongoose.model("Setting", new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true, minimize: false }));
const PlatformAccountModel = mongoose.models.PlatformAccount || mongoose.model("PlatformAccount", new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  balance: { type: Number, default: 0 },
  fees: { type: Number, default: 0 }
}, flexibleOptions));

const plans = [
  { id: "starter", name: "Starter Plan", minAmount: 10, dailyRate: 0.005, durationDays: 90 },
  { id: "smart", name: "Smart Plan", minAmount: 50, dailyRate: 0.006, durationDays: 180 },
  { id: "premium", name: "Premium Plan", minAmount: 100, dailyRate: 0.007, durationDays: 270 },
  { id: "elite", name: "Elite Plan", minAmount: 500, dailyRate: 0.008, durationDays: 365 }
];

const bonusRates = [10, 5, 5, 5, 5, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

const defaultDb = {
  users: [],
  transactions: [],
  cicoRequests: [],
  merchantApplications: [],
  disputes: [],
  ledgerEntries: [],
  platformAccount: {
    id: "platform",
    balance: 0,
    fees: 0,
    createdAt: null
  },
  platformControls: {
    cicoMerchants: true,
    merchantWhatsappRequired: true,
    maintenanceMode: false
  },
  paymentTargets: {
    trc20: {
      label: "Adresse de depot TRC20",
      value: process.env.TRC20_DEPOSIT_ADDRESS || "",
      note: "Envoyez uniquement des USDT TRC20 vers cette adresse."
    },
    bep20: {
      label: "Adresse de depot BEP20",
      value: process.env.BEP20_DEPOSIT_ADDRESS || "",
      note: "Envoyez uniquement des USDT BEP20 vers cette adresse."
    },
    mobile: {
      label: "Depot Mobile Money",
      value: "Merchant AFRIX Money",
      note: "Creez une reference puis contactez un merchant disponible."
    },
    airtel: {
      label: "Depot Airtel Money",
      value: "Merchant AFRIX Money",
      note: "Creez une reference puis contactez un merchant disponible."
    }
  }
};

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
    platformAccount: { ...defaultDb.platformAccount, ...(db.platformAccount || {}) },
    platformControls: { ...defaultDb.platformControls, ...(db.platformControls || {}) },
    paymentTargets: { ...defaultDb.paymentTargets, ...(db.paymentTargets || {}) }
  };
}

function normalizeUserRecord(user = {}) {
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
      await PlatformAccountModel.updateOne({ id: "platform" }, { $set: db.platformAccount }, { upsert: true, session });
    } else {
      await Promise.all([
        SettingModel.updateOne({ key: "platformControls" }, { $set: { value: db.platformControls } }, { upsert: true, session }),
        SettingModel.updateOne({ key: "paymentTargets" }, { $set: { value: db.paymentTargets } }, { upsert: true, session }),
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

function nowIso() {
  return new Date().toISOString();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor((end - start) / 86_400_000);
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function formatAmount(value, sign = "") {
  return `${sign}${money(value).toFixed(2)} USDT`;
}

function assertAmount(value, label = "Montant") {
  const amount = money(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} invalide.`);
  }
  return amount;
}

function makeReference(prefix, amount) {
  const stamp = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const cleanAmount = Math.max(0, Math.round(Number(amount || 0))).toString().padStart(3, "0");
  return `AFX-${prefix}-${stamp}-${cleanAmount}-${nanoid(5).toUpperCase()}`;
}

function sanitizeUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function ensurePlatform(db) {
  db.platformAccount = {
    ...defaultDb.platformAccount,
    ...(db.platformAccount || {}),
    id: "platform",
    balance: money(db.platformAccount?.balance),
    fees: money(db.platformAccount?.fees),
    createdAt: db.platformAccount?.createdAt || nowIso()
  };
  return db.platformAccount;
}

function appendLedger(db, entries, metadata = {}) {
  const groupId = metadata.groupId || nanoid();
  const createdAt = nowIso();
  db.ledgerEntries = db.ledgerEntries || [];
  entries
    .filter((entry) => money(entry.amount) > 0)
    .forEach((entry) => {
      db.ledgerEntries.push({
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
      });
    });
  return groupId;
}

function debitUser(db, user, amount, description, metadata = {}) {
  amount = assertAmount(amount);
  if (money(user.balance) < amount) throw new Error("Solde insuffisant.");
  user.balance = money(user.balance - amount);
  appendLedger(db, [{
    accountType: "user",
    accountId: user.id,
    direction: "debit",
    amount,
    balanceAfter: user.balance,
    description
  }], metadata);
}

function creditUser(db, user, amount, description, metadata = {}) {
  amount = assertAmount(amount);
  user.balance = money(user.balance + amount);
  appendLedger(db, [{
    accountType: "user",
    accountId: user.id,
    direction: "credit",
    amount,
    balanceAfter: user.balance,
    description
  }], metadata);
}

function reserveUserFunds(db, user, amount, description, metadata = {}) {
  amount = assertAmount(amount);
  if (money(user.balance) < amount) throw new Error("Solde insuffisant.");
  user.balance = money(user.balance - amount);
  user.reservedBalance = money(user.reservedBalance + amount);
  appendLedger(db, [{
    accountType: "user",
    accountId: user.id,
    direction: "debit",
    amount,
    balanceAfter: user.balance,
    description: `${description} - reserve`
  }, {
    accountType: "user_reserved",
    accountId: user.id,
    direction: "credit",
    amount,
    balanceAfter: user.reservedBalance,
    description
  }], metadata);
}

function releaseReservedFunds(db, user, amount, description, metadata = {}) {
  amount = assertAmount(amount);
  if (money(user.reservedBalance) < amount) throw new Error("Reserve insuffisante.");
  user.reservedBalance = money(user.reservedBalance - amount);
  user.balance = money(user.balance + amount);
  appendLedger(db, [{
    accountType: "user_reserved",
    accountId: user.id,
    direction: "debit",
    amount,
    balanceAfter: user.reservedBalance,
    description
  }, {
    accountType: "user",
    accountId: user.id,
    direction: "credit",
    amount,
    balanceAfter: user.balance,
    description: `${description} - retour disponible`
  }], metadata);
}

function consumeReservedFunds(db, user, amount, description, metadata = {}) {
  amount = assertAmount(amount);
  if (money(user.reservedBalance) < amount) throw new Error("Reserve insuffisante.");
  user.reservedBalance = money(user.reservedBalance - amount);
  appendLedger(db, [{
    accountType: "user_reserved",
    accountId: user.id,
    direction: "debit",
    amount,
    balanceAfter: user.reservedBalance,
    description
  }], metadata);
}

function creditPlatform(db, amount, description, metadata = {}) {
  amount = assertAmount(amount);
  const platform = ensurePlatform(db);
  platform.balance = money(platform.balance + amount);
  platform.fees = money(platform.fees + amount);
  appendLedger(db, [{
    accountType: "platform",
    accountId: "platform",
    direction: "credit",
    amount,
    balanceAfter: platform.balance,
    description
  }], metadata);
}

function debitPlatform(db, amount, description, metadata = {}) {
  amount = assertAmount(amount);
  const platform = ensurePlatform(db);
  if (money(platform.balance) < amount) {
    logger.warn({ amount, balance: platform.balance, description }, "Platform balance below debit amount");
  }
  platform.balance = money(platform.balance - amount);
  appendLedger(db, [{
    accountType: "platform",
    accountId: "platform",
    direction: "debit",
    amount,
    balanceAfter: platform.balance,
    description
  }], metadata);
}

function creditMerchantAvailable(db, merchant, amount, description, metadata = {}) {
  amount = assertAmount(amount);
  merchant.merchantWallet = merchant.merchantWallet || { available: 0, pending: 0, bonus: 0 };
  merchant.merchantWallet.available = money(merchant.merchantWallet.available + amount);
  appendLedger(db, [{
    accountType: "merchant_available",
    accountId: merchant.id,
    direction: "credit",
    amount,
    balanceAfter: merchant.merchantWallet.available,
    description
  }], metadata);
}

function debitMerchantAvailable(db, merchant, amount, description, metadata = {}) {
  amount = assertAmount(amount);
  merchant.merchantWallet = merchant.merchantWallet || { available: 0, pending: 0, bonus: 0 };
  if (money(merchant.merchantWallet.available) < amount) throw new Error("Wallet merchant insuffisant.");
  merchant.merchantWallet.available = money(merchant.merchantWallet.available - amount);
  appendLedger(db, [{
    accountType: "merchant_available",
    accountId: merchant.id,
    direction: "debit",
    amount,
    balanceAfter: merchant.merchantWallet.available,
    description
  }], metadata);
}

function creditMerchantBonus(db, merchant, amount, description, metadata = {}) {
  amount = money(amount);
  if (amount <= 0) return;
  merchant.merchantWallet = merchant.merchantWallet || { available: 0, pending: 0, bonus: 0 };
  merchant.merchantWallet.bonus = money(merchant.merchantWallet.bonus + amount);
  appendLedger(db, [{
    accountType: "merchant_bonus",
    accountId: merchant.id,
    direction: "credit",
    amount,
    balanceAfter: merchant.merchantWallet.bonus,
    description
  }], metadata);
}

function addTransaction(db, tx) {
  db.transactions.push({
    id: nanoid(),
    createdAt: nowIso(),
    metadata: {},
    ...tx
  });
  return db.transactions[db.transactions.length - 1];
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function maskEmail(email = "") {
  const normalized = String(email).trim().toLowerCase();
  const [local, domain] = normalized.split("@");
  if (!local || !domain) return normalized;
  return `${local.slice(0, 2)}***@${domain}`;
}

function buildMailHtml({ title, intro, rows = [], actionLabel, actionUrl }) {
  const rowsHtml = rows
    .filter((row) => row?.label && row.value !== undefined && row.value !== null && row.value !== "")
    .map((row) => `
      <tr>
        <td style="padding:10px 0;color:#60716b;border-bottom:1px solid #e8efec;">${escapeHtml(row.label)}</td>
        <td style="padding:10px 0;text-align:right;font-weight:700;color:#14231f;border-bottom:1px solid #e8efec;">${escapeHtml(row.value)}</td>
      </tr>
    `).join("");

  return `
    <div style="margin:0;padding:28px 14px;background:#eef4f1;font-family:Arial,sans-serif;color:#14231f;">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #dce8e3;">
        <div style="padding:28px;background:#0f5d43;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.8;">AFRIX</div>
          <h1 style="margin:12px 0 8px;font-size:26px;line-height:1.2;">${escapeHtml(title)}</h1>
          <p style="margin:0;font-size:15px;line-height:1.6;color:rgba(255,255,255,.88);">${escapeHtml(intro)}</p>
        </div>
        <div style="padding:26px;">
          ${rowsHtml ? `<table style="width:100%;border-collapse:collapse;margin-bottom:22px;">${rowsHtml}</table>` : ""}
          ${actionLabel && actionUrl ? `
            <a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#0f5d43;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700;">
              ${escapeHtml(actionLabel)}
            </a>
          ` : ""}
          <p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#74837e;">
            Support: ${escapeHtml(SUPPORT_EMAIL || "support AFRIX")}
          </p>
        </div>
      </div>
    </div>
  `;
}

async function sendBrevoMail({ to, subject, title, intro, rows, actionLabel, actionUrl }) {
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL || !to) {
    logger.warn({ to: maskEmail(to), subject }, "Brevo email skipped: provider not configured");
    return { delivered: false };
  }

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({
        sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
        to: [{ email: to }],
        ...(SUPPORT_EMAIL ? { replyTo: { name: "Support AFRIX", email: SUPPORT_EMAIL } } : {}),
        subject,
        htmlContent: buildMailHtml({ title, intro, rows, actionLabel, actionUrl })
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Brevo ${response.status}: ${body.slice(0, 300)}`);
    }

    logger.info({ to: maskEmail(to), subject }, "Brevo email accepted");
    return { delivered: true };
  } catch (error) {
    logger.error({ err: error, to: maskEmail(to), subject }, "Brevo email failed");
    return { delivered: false, error: error.message };
  }
}

async function notifyAdmin(subject, title, intro, rows = []) {
  if (!ADMIN_ALERT_EMAIL) return;
  await sendBrevoMail({ to: ADMIN_ALERT_EMAIL, subject, title, intro, rows, actionLabel: "Ouvrir AFRIX", actionUrl: `${APP_URL}/admin` });
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: TOKEN_TTL });
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
  const method = String(req.body.method || "trc20");
  if (amount < 10) return res.status(400).json({ message: "Montant minimum depot: 10 USDT." });
  if ((method === "mobile" || method === "airtel") && req.db.platformControls?.cicoMerchants === false && req.user.role !== "admin") {
    return res.status(403).json({ message: "Les operations CICO merchant sont temporairement indisponibles." });
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
        txRef: req.body.txRef || "",
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
  method: z.string().min(1),
  amount: z.coerce.number().positive(),
  address: z.string().optional(),
  phone: z.string().optional(),
  beneficiary: z.string().optional()
})), async (req, res) => {
  const { amount, method } = req.body;
  if (amount < 10) return res.status(400).json({ message: "Montant minimum retrait: 10 USDT." });
  if ((method === "mobile" || method === "airtel") && req.db.platformControls?.cicoMerchants === false && req.user.role !== "admin") {
    return res.status(403).json({ message: "Les operations CICO merchant sont temporairement indisponibles." });
  }

  const result = await updateDb(async (db) => {
    const user = db.users.find((candidate) => candidate.id === req.user.id);
    const fee = method === "mobile" || method === "airtel" ? money(amount * 0.1) : 0;
    if (user.balance < amount + fee) return { error: "Solde insuffisant." };

    if (method === "mobile" || method === "airtel") {
      reserveUserFunds(db, user, money(amount + fee), `Retrait CICO ${method}`, {
        source: "cico_withdrawal_request"
      });
      const request = {
        id: nanoid(),
        reference: makeReference("WD", amount),
        type: "Retrait",
        userId: user.id,
        customer: user.email,
        country: "Congo",
        amount: money(amount),
        fee,
        merchantBonus: money(amount * 0.03),
        method,
        phone: req.body.phone || "",
        beneficiary: req.body.beneficiary || "",
        status: "En attente merchant",
        reservedAmount: money(amount + fee),
        createdAt: nowIso()
      };
      db.cicoRequests.push(request);
      return { request };
    }

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
      metadata: { method, address: req.body.address || "", reservedAmount: money(amount) }
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
