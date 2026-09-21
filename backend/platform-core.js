import { money } from "./ledger.js";

export function normalizeRate(value, fallback = 0) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0 ? rate : fallback;
}

export function normalizeFeeSettings(settings = {}, defaults = {}) {
  const normalized = { ...defaults };
  for (const [key, fallback] of Object.entries(defaults)) {
    normalized[key] = normalizeRate(settings?.[key], fallback);
  }
  return normalized;
}

export function splitActivationCommissions(amount, settings = {}, defaultRates = {}) {
  const baseAmount = money(amount);
  if (baseAmount <= 0) return { admin: 0, developer: 0 };
  const adminRate = normalizeRate(settings.activationAdminCommissionRate, defaultRates.activationAdminCommissionRate ?? 0.025);
  const developerRate = normalizeRate(settings.activationDeveloperCommissionRate, defaultRates.activationDeveloperCommissionRate ?? 0.025);
  return {
    admin: money(baseAmount * adminRate),
    developer: money(baseAmount * developerRate)
  };
}

export function platformRevenueShares(settings = {}) {
  const adminShare = normalizeRate(settings.platformRevenueAdminShare, 0.1);
  const developerShare = normalizeRate(settings.platformRevenueDeveloperShare, 0.1);
  const platformShare = Math.max(0, 1 - adminShare - developerShare);
  return { adminShare, developerShare, platformShare };
}

export function splitPlatformRevenue(amount, settings = {}) {
  const revenue = money(amount);
  if (revenue <= 0) return { admin: 0, developer: 0, platform: 0 };
  const shares = platformRevenueShares(settings);
  const admin = money(revenue * shares.adminShare);
  const developer = money(revenue * shares.developerShare);
  const platform = money(revenue - admin - developer);
  return { admin, developer, platform };
}

function proofFileSignature(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return "";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (
    buffer.length >= 12 &&
    buffer.slice(0, 4).toString("ascii") === "RIFF" &&
    buffer.slice(8, 12).toString("ascii") === "WEBP"
  ) return "image/webp";
  return "";
}

export function validateProofFile(file) {
  if (!file?.buffer?.length) {
    return { error: "Preuve de paiement requise." };
  }
  const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const declaredMime = String(file.mimetype || "").toLowerCase();
  const detectedMime = proofFileSignature(file.buffer);
  if (!allowedMimeTypes.has(declaredMime) || detectedMime !== declaredMime) {
    return { error: "Format de preuve invalide. Formats acceptes: JPG, PNG ou WEBP." };
  }
  return null;
}
