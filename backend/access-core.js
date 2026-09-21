import { createHash } from "crypto";
import { APP_URL } from "./config.js";

export function normalizeInvitationCode(value = "") {
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

export function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function stableRefCodeFromEmail(email = "") {
  const normalizedEmail = normalizeEmail(email);
  const digest = createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 8).toUpperCase();
  return `AFX-${digest}`;
}

export function referralMatches(candidate, sponsor) {
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

export function canUseBackoffice(user) {
  return user?.role === "admin" || user?.role === "developer";
}

export function canViewCommissionSummary(user = {}) {
  const email = normalizeEmail(user?.email);
  return Boolean(canUseBackoffice(user) || (user?.platformEmail && email === normalizeEmail(user.platformEmail)));
}

export function isCommissionAccount(user = {}) {
  const email = normalizeEmail(user?.email);
  return Boolean(
    user?.adminEmail && email === normalizeEmail(user.adminEmail) ||
    user?.commissionDeveloperEmail && email === normalizeEmail(user.commissionDeveloperEmail) ||
    user?.platformEmail && email === normalizeEmail(user.platformEmail)
  );
}
