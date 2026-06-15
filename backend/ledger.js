import { nanoid } from "nanoid";
import { defaultDb, logger } from "./config.js";

export function nowIso() {
  return new Date().toISOString();
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor((end - start) / 86_400_000);
}

export function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

export function formatAmount(value, sign = "") {
  return `${sign}${money(value).toFixed(2)} USDT`;
}

export function assertAmount(value, label = "Montant") {
  const amount = money(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${label} invalide.`);
  }
  return amount;
}

export function makeReference(prefix, amount) {
  const stamp = new Date().toISOString().slice(2, 10).replaceAll("-", "");
  const cleanAmount = Math.max(0, Math.round(Number(amount || 0))).toString().padStart(3, "0");
  return `AFX-${prefix}-${stamp}-${cleanAmount}-${nanoid(5).toUpperCase()}`;
}

export function ensurePlatform(db) {
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

export function appendLedger(db, entries, metadata = {}) {
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

export function debitUser(db, user, amount, description, metadata = {}) {
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

export function creditUser(db, user, amount, description, metadata = {}) {
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

export function reserveUserFunds(db, user, amount, description, metadata = {}) {
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

export function releaseReservedFunds(db, user, amount, description, metadata = {}) {
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

export function consumeReservedFunds(db, user, amount, description, metadata = {}) {
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

export function creditPlatform(db, amount, description, metadata = {}) {
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

export function debitPlatform(db, amount, description, metadata = {}) {
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

export function creditMerchantAvailable(db, merchant, amount, description, metadata = {}) {
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

export function debitMerchantAvailable(db, merchant, amount, description, metadata = {}) {
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

export function creditMerchantBonus(db, merchant, amount, description, metadata = {}) {
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

export function addTransaction(db, tx) {
  db.transactions.push({
    id: nanoid(),
    createdAt: nowIso(),
    metadata: {},
    ...tx
  });
  return db.transactions[db.transactions.length - 1];
}
