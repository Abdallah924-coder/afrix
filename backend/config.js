import path from "path";
import { fileURLToPath } from "url";
import pino from "pino";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const rootDir = path.resolve(__dirname, "..");
export const logger = pino({ level: process.env.LOG_LEVEL || "info" });

export const PORT = Number(process.env.PORT || 3000);
export const JWT_SECRET = process.env.JWT_SECRET || "";
export const TOKEN_TTL = process.env.TOKEN_TTL || "7d";
export const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN || "*";
export const MONGODB_URI = String(process.env.MONGODB_URI || "").trim();
export const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
export const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
export const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "").trim();
export const ADMIN_NAME = process.env.ADMIN_NAME || "Administrateur AFRIX";
export const PLATFORM_EMAIL = String(process.env.PLATFORM_EMAIL || "").trim().toLowerCase();
export const PLATFORM_PASSWORD = String(process.env.PLATFORM_PASSWORD || "").trim();
export const PLATFORM_NAME = process.env.PLATFORM_NAME || "Compte plateforme AFRIX";
export const COMMISSION_DEVELOPER_EMAIL = String(process.env.COMMISSION_DEVELOPER_EMAIL || "").trim().toLowerCase();
export const COMMISSION_DEVELOPER_PASSWORD = String(process.env.COMMISSION_DEVELOPER_PASSWORD || "").trim();
export const COMMISSION_DEVELOPER_NAME = process.env.COMMISSION_DEVELOPER_NAME || "Compte developpeur AFRIX";
export const GRSCOIN_PRICE_USDT = Math.max(0, Number(process.env.GRSCOIN_PRICE_USDT || 0.0725));
export const GRSCOIN_CONTRACT_ADDRESS = String(process.env.GRSCOIN_CONTRACT_ADDRESS || "").trim();
export const GRSCOIN_DEPOSIT_ADDRESS = String(process.env.GRSCOIN_DEPOSIT_ADDRESS || "").trim();
export const GRSCOIN_USDT_BEP20_DEPOSIT_ADDRESS = String(process.env.GRSCOIN_USDT_BEP20_DEPOSIT_ADDRESS || process.env.BEP20_DEPOSIT_ADDRESS || "").trim();
export const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
export const BREVO_API_KEY = String(process.env.BREVO_API_KEY || "");
export const BREVO_SENDER_EMAIL = String(process.env.BREVO_SENDER_EMAIL || "");
export const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "AFRIX";
export const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || BREVO_SENDER_EMAIL;
export const ADMIN_ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || ADMIN_EMAIL;
export const isProduction = process.env.NODE_ENV === "production";
export const jwtSecret = JWT_SECRET || "dev-only-change-this-secret-before-production";

export function isConfiguredAdminEmail(email) {
  return Boolean(ADMIN_EMAIL && String(email || "").trim().toLowerCase() === ADMIN_EMAIL);
}

export const pageRoutes = {
  "/": "index.html",
  "/login": "pages/login.html",
  "/register": "pages/register.html",
  "/reset-password": "pages/reset-password.html",
  "/dashboard": "pages/dashboard.html",
  "/wallet": "pages/wallet.html",
  "/transactions": "pages/transactions.html",
  "/plans": "pages/plans.html",
  "/network": "pages/network.html",
  "/profile": "pages/profile.html",
  "/contact": "pages/contact.html",
  "/support": "pages/contact.html",
  "/afrix-money": "pages/afrix-money.html",
  "/swap": "pages/swap.html",
  "/staking": "pages/staking.html",
  "/founders-club": "pages/founders-club.html",
  "/etf": "pages/etf.html",
  "/exchange": "pages/exchange.html",
  "/merchant": "pages/merchant.html",
  "/elite": "pages/elite.html",
  "/admin": "pages/admin.html",
  "/maintenance": "pages/maintenance.html"
};

export const legacyPageRoutes = new Map([
  ["/index.html", "/"],
  ...Object.entries(pageRoutes)
    .filter(([route]) => route !== "/")
    .map(([route, file]) => [`/${file}`, route]),
  ...Object.entries(pageRoutes)
    .filter(([route]) => route !== "/")
    .map(([route, file]) => [`/${path.basename(file)}`, route])
]);

export const publicFiles = new Set([
  "/app.js",
  "/styles.css",
  "/manifest.webmanifest",
  "/service-worker.js",
  "/offline.html",
  "/IMG-20260609-WA0003.jpg"
]);

export const plans = [
  { id: "starter", name: "Starter Trading", minAmount: 10, dailyRate: 0.00342, durationDays: 365, dividendRate: 0.0035, asset: "AUSD" },
  { id: "smart", name: "Smart Trading", minAmount: 250, dailyRate: 0.00356, durationDays: 365, dividendRate: 0.0037, asset: "AUSD" },
  { id: "premium", name: "Premium Trading", minAmount: 500, dailyRate: 0.00383, durationDays: 365, dividendRate: 0.004, asset: "AUSD" },
  { id: "elite", name: "Elite Trading", minAmount: 1000, dailyRate: 0.0041, durationDays: 365, dividendRate: 0.0045, asset: "AUSD" }
];

export const stakingPlans = [
  { id: "starter", name: "Starter Staking", minAmount: 100, rewardRate: 0.02, durationDays: 90 },
  { id: "smart", name: "Smart Staking", minAmount: 500, rewardRate: 0.05, durationDays: 180 },
  { id: "premium", name: "Premium Staking", minAmount: 2500, rewardRate: 0.09, durationDays: 270 },
  { id: "elite", name: "Elite Staking", minAmount: 5000, rewardRate: 0.15, durationDays: 365 }
];

export const foundersPlans = [
  { id: "bronze", name: "Founder Bronze", minAmount: 10000, rewardRate: 0.031, durationYears: 10, durationDays: 3650 },
  { id: "silver", name: "Founder Silver", minAmount: 50000, rewardRate: 0.0335, durationYears: 12, durationDays: 4380 },
  { id: "gold", name: "Founder Gold", minAmount: 100000, rewardRate: 0.035, durationYears: 15, durationDays: 5475 },
  { id: "platinum", name: "Founder Platinum", minAmount: 250000, rewardRate: 0.037, durationYears: 18, durationDays: 6570 },
  { id: "diamond", name: "Founder Diamond", minAmount: 500000, rewardRate: 0.038, durationYears: 20, durationDays: 7300 },
  { id: "legend", name: "Founder Legend", minAmount: 1000000, rewardRate: 0.04, durationYears: 25, durationDays: 9125 }
];

export const etfPlans = [
  { id: "stable", name: "AFRIX Stable Portfolio", minAmount: 100, monthlyRate: 0.00835, durationMonths: 36, durationDays: 1095, profile: "Prudent" },
  { id: "blue-chip", name: "AFRIX Blue Chip Portfolio", minAmount: 2500, monthlyRate: 0.01, durationMonths: 36, durationDays: 1095, profile: "Actifs etablis" },
  { id: "africa", name: "AFRIX Africa Portfolio", minAmount: 10000, monthlyRate: 0.0125, durationMonths: 36, durationDays: 1095, profile: "Croissance africaine" },
  { id: "ai-innovation", name: "AFRIX AI & Innovation Portfolio", minAmount: 25000, monthlyRate: 0.015, durationMonths: 36, durationDays: 1095, profile: "Innovation long terme" }
];

export const bonusRates = [10, 5, 5, 5, 5, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

export const defaultDb = {
  users: [],
  transactions: [],
  cicoRequests: [],
  exchangeAds: [],
  exchangeOrders: [],
  merchantApplications: [],
  disputes: [],
  ledgerEntries: [],
  passwordResetTokens: [],
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
  feeSettings: {
    tradingProgramFeeRate: 0.0075,
    stakingProgramFeeRate: 0.005,
    etfProgramFeeRate: 0.01,
    foundersProgramFeeRate: 0.01,
    annualManagementFeeRate: 0.01,
    activationAdminCommissionRate: 0.025,
    activationDeveloperCommissionRate: 0.025,
    userRevenueAdminCommissionRate: 0.05,
    userRevenueDeveloperCommissionRate: 0.05,
    platformRevenueAdminShare: 0.10,
    platformRevenueDeveloperShare: 0.10,
    swapFeeRate: 0.025,
    withdrawalFeeRate: 0.10,
    p2pFeeRate: 0.01
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
    mtn_cg: {
      label: "Depot MTN Mobile Money Congo Brazzaville",
      value: process.env.MTN_CG_DEPOSIT_PHONE || "",
      note: "Nom beneficiaire: Estelle Larissa HONGANGA ODJILIE. Taux: 10 USDT = 6500 FCFA. Ajoutez uniquement la capture du paiement."
    },
    airtel_cd: {
      label: "Depot Airtel Money RDC",
      value: process.env.AIRTEL_CD_DEPOSIT_PHONE || "0972416764",
      note: "Agent: BOLENKANDA NZENSEKA Jose. Effectuez un Cash Out aupres de l'agent. Taux depot: 1 USDT = 2800 CDF, 1 AUSD = 9100 CDF."
    },
    orange_cd: {
      label: "Depot Orange Money RDC",
      value: process.env.ORANGE_CD_DEPOSIT_PHONE || "0848210074",
      note: "Agent: ZALA ZOA. Effectuez un Cash Out aupres de l'agent. Taux depot: 1 USDT = 2800 CDF, 1 AUSD = 9100 CDF."
    }
  }
};

if (isProduction && JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be set to at least 32 characters in production.");
}

if (isProduction) {
  const missing = ["MONGODB_URI", "APP_URL", "PUBLIC_ORIGIN", "ADMIN_EMAIL", "ADMIN_PASSWORD", "PLATFORM_EMAIL", "PLATFORM_PASSWORD"]
    .filter((key) => !String(process.env[key] || "").trim());
  if (missing.length) {
    throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  }
  if (ADMIN_PASSWORD.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters in production.");
  }
  if (PLATFORM_PASSWORD.length < 12) {
    throw new Error("PLATFORM_PASSWORD must be at least 12 characters in production.");
  }
}
