const API_BASE = window.AFRIX_API_BASE || "/api";
const APP_VERSION = "20260706-1";
const AUTH_TOKEN_KEY = "afrix_auth_token";
const API_TIMEOUT_MS = 120_000;
const MAX_PROOF_FILE_BYTES = 5 * 1024 * 1024;
let registerCountryOptionsHtml = null;

const pageTitles = {
  dashboard: "Tableau de bord",
  wallet: "Wallet AUSD",
  "afrix-money": "AFRIX Money",
  plans: "AFRIX Trading Program",
  staking: "AFRIX Staking Program",
  "founders-club": "GRS CORE FOUNDERS CLUB",
  swap: "AFRIX Swap GRSCOIN",
  exchange: "Exchange",
  merchant: "Merchant",
  network: "Reseau",
  profile: "Profil",
  contact: "Support",
  elite: "Programme Elite",
  transactions: "Historique",
  admin: "Admin",
  login: "Connexion",
  register: "Inscription"
};

const navItems = [
  ["dashboard", "Dashboard", "/dashboard"],
  ["wallet", "Wallet AUSD", "/wallet"],
  ["afrix-money", "AFRIX Money", "/afrix-money"],
  ["plans", "AFRIX Trading Program", "/plans"],
  ["staking", "AFRIX Staking Program", "/staking"],
  ["founders-club", "GRS CORE FOUNDERS CLUB", "/founders-club"],
  ["swap", "AFRIX Swap GRSCOIN", "/swap"],
  ["exchange", "Exchange", "/exchange"],
  ["merchant", "Merchant", "/merchant"],
  ["network", "Reseau", "/network"],
  ["profile", "Profil", "/profile"],
  ["contact", "Support", "/support"],
  ["elite", "Elite", "/elite"],
  ["transactions", "Transactions", "/transactions"],
  ["admin", "Admin", "/admin"]
];

const DEPOSIT_MOBILE_RATE = 650;
const WITHDRAW_MOBILE_RATE = 550;
const MTN_WITHDRAW_FEE_RATE = 0.10;
const P2P_FEE_RATE = 0.01;
const AUSD_PRICE_USDT = 3.25;
const CDF_DEPOSIT_RATE_USDT = 2800;
const CDF_WITHDRAWAL_RATE_USDT = 2365;
const FOUNDERS_ACTIVATION_FEE_RATE = 0.01;
const contactLinks = {
  telegramSupport: "https://t.me/Assistant_grs_core",
  telegramChannel: "https://t.me/ecosysteme_grs",
  whatsappChannel: "https://whatsapp.com/channel/0029Vb6hyxfF1YlXTyGa0n21"
};
const supportChannels = [
  {
    key: "telegram",
    label: "Telegram",
    title: "Canal Telegram",
    href: contactLinks.telegramChannel,
    icon: "✈"
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    title: "Chaîne WhatsApp",
    href: contactLinks.whatsappChannel,
    icon: "☎"
  }
];
let deferredInstallPrompt = null;
const bonusRates = [10, 5, 5, 5, 5, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const plans = [
  { id: "starter", tier: "Bronze", name: "Starter Trading", minAmount: 10, amount: "10 USDT et plus", daily: "0,50%", duration: "90 jours", cycle: "capital bloque 90 jours + gains journaliers retirable", note: "Premier niveau obligatoire pour ouvrir la progression AFRIX." },
  { id: "smart", tier: "Silver", name: "Smart Trading", minAmount: 50, amount: "50 USDT et plus", daily: "0,60%", duration: "180 jours", cycle: "capital bloque 180 jours + gains journaliers retirable", note: "Ouvert avec une participation Smart Staking de 5 000 GRSC.", requiredStakePlan: "smart", requiredStakeAmount: 5000, requiredStakeName: "Smart Staking", featured: true },
  { id: "premium", tier: "Gold", name: "Premium Trading", minAmount: 300, amount: "300 USDT et plus", daily: "0,70%", duration: "270 jours", cycle: "capital bloque 270 jours + gains journaliers retirable", note: "Ouvert avec une participation Premium Staking de 25 000 GRSC.", requiredStakePlan: "premium", requiredStakeAmount: 25000, requiredStakeName: "Premium Staking" },
  { id: "elite", tier: "Elite", name: "Elite Trading", minAmount: 500, amount: "500 USDT et plus", daily: "0,80%", duration: "365 jours", cycle: "capital bloque 365 jours + gains journaliers retirable", note: "Ouvert avec une participation Elite Staking de 50 000 GRSC.", requiredStakePlan: "elite", requiredStakeAmount: 50000, requiredStakeName: "Elite Staking" }
];

const stakingPlans = [
  { id: "starter", tier: "Starter", name: "Starter Staking", minAmount: 100, amount: "100 GRSC et plus", rewardRate: 0.035, objective: "3,5%", exitValue: "103,5%", durationDays: 90, duration: "90 jours" },
  { id: "smart", tier: "Smart", name: "Smart Staking", minAmount: 500, amount: "500 GRSC et plus", rewardRate: 0.10, objective: "10%", exitValue: "110%", durationDays: 180, duration: "180 jours", featured: true },
  { id: "premium", tier: "Premium", name: "Premium Staking", minAmount: 2500, amount: "2 500 GRSC et plus", rewardRate: 0.17, objective: "17%", exitValue: "117%", durationDays: 270, duration: "270 jours" },
  { id: "elite", tier: "Elite", name: "Elite Staking", minAmount: 5000, amount: "5 000 GRSC et plus", rewardRate: 0.25, objective: "25%", exitValue: "125%", durationDays: 365, duration: "365 jours" }
];

const foundersPlans = [
  { id: "bronze", tier: "Bronze", name: "Founder Bronze", minAmount: 10000, amount: "10 000 GRSC", rewardRate: 0.031, objective: "3,10% / an", durationYears: 10, durationDays: 3650, duration: "10 ans" },
  { id: "silver", tier: "Silver", name: "Founder Silver", minAmount: 50000, amount: "50 000 GRSC", rewardRate: 0.0335, objective: "3,35% / an", durationYears: 12, durationDays: 4380, duration: "12 ans", featured: true },
  { id: "gold", tier: "Gold", name: "Founder Gold", minAmount: 100000, amount: "100 000 GRSC", rewardRate: 0.035, objective: "3,50% / an", durationYears: 15, durationDays: 5475, duration: "15 ans" },
  { id: "platinum", tier: "Platinum", name: "Founder Platinum", minAmount: 250000, amount: "250 000 GRSC", rewardRate: 0.037, objective: "3,70% / an", durationYears: 18, durationDays: 6570, duration: "18 ans", featured: true },
  { id: "diamond", tier: "Diamond", name: "Founder Diamond", minAmount: 500000, amount: "500 000 GRSC", rewardRate: 0.038, objective: "3,80% / an", durationYears: 20, durationDays: 7300, duration: "20 ans", global: true },
  { id: "legend", tier: "Legend", name: "Founder Legend", minAmount: 1000000, amount: "1 000 000 GRSC+", rewardRate: 0.04, objective: "4,00% / an", durationYears: 25, durationDays: 9125, duration: "25 ans", global: true }
];

function tradingPlanName(nameOrId = "") {
  const normalized = String(nameOrId || "").toLowerCase();
  if (normalized.includes("starter")) return "Starter Trading";
  if (normalized.includes("smart")) return "Smart Trading";
  if (normalized.includes("premium")) return "Premium Trading";
  if (normalized.includes("elite")) return "Elite Trading";
  return String(nameOrId || "Plan");
}

const emptyUser = {
  fullName: "",
  email: "",
  balance: 0,
  grsBalance: 0,
  activity: 0,
  team: 0,
  bonus: 0,
  rank: "Niveau 0",
  progress: 0,
  wallet: "",
  country: "",
  paymentTargets: {},
  refLink: "",
  transactions: [],
  adminTransactions: [],
  directPartners: [],
  merchants: [],
  merchantWallet: {
    available: 0,
    pending: 0,
    bonus: 0,
    mainBalance: 0
  },
  cicoRequests: [],
  exchangeAds: [],
  exchangeOrders: [],
  adminExchangeOrders: [],
  merchantApplications: [],
  disputes: [],
  activePlans: [],
  activeStakes: [],
  activeFounders: [],
  bonusLevelsOverride: 0,
  ausdBalance: 0,
  platformControls: {},
    swap: {
      grsCoinPriceUsdt: 0.0725,
      grsCoinPerUsdt: 13.79310345,
      contractAddress: "",
      grsDepositAddress: "",
      usdtBep20DepositAddress: "",
      swapFeeRate: 0.025,
      bonusRate: 0.10,
      bonusLevelsCount: 5,
      direction: "USDT_GRSC",
      market: { totalSupply: 4200000, issuedSupply: 0, remainingSupply: 4200000, issuedPercent: 0 }
    },
  role: "user"
};

const formatUsdt = (value) => `${Number(value || 0).toFixed(2)} USDT`;
const formatGrsc = (value) => `${Number(value || 0).toFixed(2)} GRSC`;
const formatAusd = (value) => `${Number(value || 0).toFixed(2)} AUSD`;
const formatCdf = (value) => `${Math.round(Number(value || 0)).toLocaleString("fr-FR")} CDF`;
const formatAssetAmount = (value, asset = "USDT") => {
  if (asset === "AUSD") return formatAusd(value);
  if (asset === "GRSC") return formatGrsc(value);
  return formatUsdt(value);
};
const assetBalance = (user = {}, asset = "USDT") => {
  if (asset === "AUSD") return Number(user.ausdBalance || 0);
  if (asset === "GRSC") return Number(user.grsBalance || 0);
  return Number(user.balance || 0);
};
const usdtToAusd = (value) => Number(value || 0) / AUSD_PRICE_USDT;
const formatTokenPrice = (value) => `${Number(value || 0).toFixed(4)} USDT`;
const getGrsCoinPerUsdt = (user = {}) => {
  const price = Number(user.swap?.grsCoinPriceUsdt || 0.0725);
  return price > 0 ? 1 / price : 0;
};
const formatTransactionFee = (metadata = {}) => {
  if (metadata.feeAsset === "GRSC") return formatGrsc(metadata.feeGrsAmount || 0);
  if (metadata.asset === "GRSC_WITHDRAWAL") return formatGrsc(metadata.fee || 0);
  return formatUsdt(metadata.fee || 0);
};
const formatTransactionNet = (metadata = {}) => (
  metadata.asset === "GRSC_WITHDRAWAL" ? formatGrsc(metadata.netAmount || 0) : formatUsdt(metadata.netAmount || 0)
);
const formatXaf = (value) => `${Math.round(Number(value || 0)).toLocaleString("fr-FR")} XAF`;

function canUseBackoffice(user = {}) {
  return user.role === "admin" || user.role === "developer";
}

function normalizeCountry(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

function isCongoKinshasa(value) {
  const country = normalizeCountry(value);
  return country === "rdc" ||
    country === "cd" ||
    country === "congo kinshasa" ||
    country === "republique democratique du congo" ||
    country.includes("democratic republic of congo") ||
    country.includes("republique democratique du congo");
}

function normalizePaymentMethods(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function hydrateProfileCountrySelect(select, selectedCountry = "") {
  if (!select || select.dataset.countriesLoaded === "true") {
    if (select) select.value = selectedCountry || "";
    return;
  }

  try {
    if (!registerCountryOptionsHtml) {
      const response = await fetch("/register", { cache: "force-cache" });
      const html = await response.text();
      const documentFragment = new DOMParser().parseFromString(html, "text/html");
      const registerCountrySelect = documentFragment.querySelector('select[name="country"]');
      registerCountryOptionsHtml = registerCountrySelect?.innerHTML || "";
    }

    if (registerCountryOptionsHtml) {
      select.innerHTML = registerCountryOptionsHtml;
    }
  } catch (error) {
    console.warn("Chargement de la liste des pays impossible:", error);
  }

  const hasSelectedCountry = selectedCountry && Array.from(select.options).some((option) => option.value === selectedCountry);
  if (selectedCountry && !hasSelectedCountry) {
    select.appendChild(new Option(selectedCountry, selectedCountry));
  }
  select.value = selectedCountry || "";
  select.dataset.countriesLoaded = "true";
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function setAuthToken(token) {
  if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
}

function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function authHeaders(extraHeaders = {}) {
  const token = getAuthToken();
  return {
    ...extraHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function apiRequest(path, options = {}) {
  const { timeoutMs = API_TIMEOUT_MS, ...fetchOptions } = options;
  const headers = authHeaders(fetchOptions.headers || {});
  const controller = fetchOptions.signal ? null : new AbortController();
  const timeoutId = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null;
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers,
      ...(controller ? { signal: controller.signal } : {})
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Le serveur met trop de temps à répondre. Réessayez dans quelques secondes.");
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new Error("Connexion internet indisponible. Vérifiez votre réseau puis réessayez.");
    }
    throw new Error("Connexion momentanée à l'API AFRIX impossible. Réessayez dans quelques secondes; si le message persiste, contactez le support.");
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (response.status === 401) {
    clearAuthToken();
    if (document.body.matches("[data-protected]")) window.location.href = "/login";
  }

  if (!response.ok) {
    const message = typeof payload === "object" && payload?.message ? payload.message : "Operation impossible pour le moment.";
    throw new Error(message);
  }

  return payload;
}

async function apiJson(path, data, options = {}) {
  return apiRequest(path, {
    ...options,
    method: options.method || "POST",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: JSON.stringify(data)
  });
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function normalizeInvitationCode(value = "") {
  let code = String(value || "").trim();
  if (!code) return "";
  try {
    const parsedUrl = new URL(code, window.location.origin);
    code = parsedUrl.searchParams.get("ref") || parsedUrl.searchParams.get("code") || code;
  } catch {
    // Plain invitation codes are not valid URLs.
  }
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

function getInvitationCodeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return normalizeInvitationCode(params.get("ref") || params.get("code") || "");
}

function withInvitationCode(url, code = getInvitationCodeFromUrl()) {
  if (!code || !url || !String(url).startsWith("/register")) return url;
  const target = new URL(url, window.location.origin);
  target.searchParams.set("ref", code);
  return `${target.pathname}${target.search}`;
}

function hydrateInvitationLinks() {
  const code = getInvitationCodeFromUrl();
  if (!code) return;
  document.querySelectorAll('a[href="/register"], a[href^="/register?"]').forEach((link) => {
    link.href = withInvitationCode(link.getAttribute("href") || "/register", code);
  });
}

async function loadCurrentUser() {
  const data = await apiRequest("/me");
  return normalizeUser(data.user || data);
}

function normalizeUser(user) {
  return {
    ...emptyUser,
    ...(user || {}),
    paymentTargets: user?.paymentTargets || {},
    transactions: Array.isArray(user?.transactions) ? user.transactions : [],
    adminTransactions: Array.isArray(user?.adminTransactions) ? user.adminTransactions : [],
    adminUsers: Array.isArray(user?.adminUsers) ? user.adminUsers : [],
    directPartners: Array.isArray(user?.directPartners) ? user.directPartners : [],
    merchants: Array.isArray(user?.merchants) ? user.merchants : [],
    merchantWallet: { ...emptyUser.merchantWallet, ...(user?.merchantWallet || {}) },
    swap: { ...emptyUser.swap, ...(user?.swap || {}) },
    cicoRequests: Array.isArray(user?.cicoRequests) ? user.cicoRequests : [],
    exchangeAds: Array.isArray(user?.exchangeAds) ? user.exchangeAds : [],
    exchangeOrders: Array.isArray(user?.exchangeOrders) ? user.exchangeOrders : [],
    adminExchangeOrders: Array.isArray(user?.adminExchangeOrders) ? user.adminExchangeOrders : [],
    merchantApplications: Array.isArray(user?.merchantApplications) ? user.merchantApplications : [],
    disputes: Array.isArray(user?.disputes) ? user.disputes : [],
    activePlans: Array.isArray(user?.activePlans) ? user.activePlans : [],
    activeStakes: Array.isArray(user?.activeStakes) ? user.activeStakes : [],
    activeFounders: Array.isArray(user?.activeFounders) ? user.activeFounders : [],
    ledgerEntries: Array.isArray(user?.ledgerEntries) ? user.ledgerEntries : [],
    platformControls: user?.platformControls || {},
    platformAccount: user?.platformAccount || {},
    country: user?.country || ""
  };
}

function showToast(message, type = "info") {
  const oldToast = document.querySelector(".toast");
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === "error" ? "!" : "✓"}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" type="button" aria-label="Fermer">×</button>
  `;
  document.body.appendChild(toast);

  toast.querySelector("button").addEventListener("click", () => toast.remove());
  window.setTimeout(() => toast.remove(), 3200);
}

function collectFormFields(form) {
  return Array.from(form?.elements || []).filter((field) => {
    if (!field.name) return false;
    return ["input", "select", "textarea"].includes(field.tagName.toLowerCase());
  });
}

function firstInvalidFieldMessage(form) {
  const invalidField = collectFormFields(form).find((field) => field.required && !String(field.value || "").trim() && field.type !== "file");
  if (invalidField) {
    return invalidField.labels?.[0]?.textContent?.trim() || "Un champ requis est manquant.";
  }
  const fileField = collectFormFields(form).find((field) => field.required && field.type === "file" && (!field.files || field.files.length === 0));
  if (fileField) {
    return fileField.labels?.[0]?.textContent?.trim() || "Un fichier requis est manquant.";
  }
  return "";
}

function firstFormError(form) {
  const requiredMessage = firstInvalidFieldMessage(form);
  if (requiredMessage) return `${requiredMessage} requis.`;

  const proof = form?.querySelector("[name='proof']");
  const file = proof?.files?.[0];
  if (file && file.size > MAX_PROOF_FILE_BYTES) {
    return "Preuve de paiement trop lourde. Taille maximale: 5 Mo.";
  }
  return "";
}

function setButtonLoading(button, label) {
  if (!button) return () => {};
  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = button.textContent || "";
  }
  button.disabled = true;
  if (label) button.textContent = label;
  return () => {
    button.disabled = false;
    button.textContent = button.dataset.originalLabel || "";
    delete button.dataset.originalLabel;
  };
}

function showLoadError(message) {
  const app = document.querySelector(".app");
  if (!app) return;
  app.insertAdjacentHTML("afterbegin", `
    <section class="panel app-error">
      <h1>Connexion aux donnees impossible</h1>
      <p class="muted">${escapeHtml(message)}</p>
    </section>
  `);
}

function renderSidebar(page, user = emptyUser) {
  const sidebar = document.querySelector("[data-sidebar]");
  if (!sidebar) return;
  const visibleNavItems = navItems.filter(([key]) => key !== "admin" || canUseBackoffice(user));

  sidebar.innerHTML = `
    <a class="brand" href="/">
      <span class="brand-mark">A</span>
      <span><strong>AFRIX</strong><small>Capital Investment</small></span>
    </a>
    <nav class="nav">
      ${visibleNavItems.map(([key, label, href]) => `<a class="${page === key ? "active" : ""}" href="${href}">${label}</a>`).join("")}
    </nav>
    <div class="side-card">
      <span>Rang partenaire</span>
      <strong>${escapeHtml(user.rank || "Niveau 0")}</strong>
      <small>Progression Web3 active</small>
      <button class="btn secondary side-logout" type="button" data-logout>Se deconnecter</button>
    </div>
  `;
}

function renderTopbar(page, user = emptyUser) {
  const topbar = document.querySelector("[data-topbar]");
  if (!topbar) return;

  topbar.innerHTML = `
    <button class="btn secondary menu-btn" type="button" data-menu-toggle aria-label="Ouvrir le menu" aria-expanded="false">☰</button>
    <div class="topbar-title">
      <p>Wallet • Trading • Staking • Blockchain</p>
      <h1>${pageTitles[page] || "AFRIX"}</h1>
    </div>
    <div class="user-box">
      <span>${escapeHtml(user.email || "Compte AFRIX")}</span>
      <strong>AUSD</strong>
    </div>
  `;

  const menuButton = topbar.querySelector("[data-menu-toggle]");
  const sidebar = document.querySelector("[data-sidebar]");
  if (menuButton && sidebar) {
    const syncMenuButton = () => {
      const isOpen = sidebar.classList.contains("open");
      document.body.classList.toggle("menu-open", isOpen);
      menuButton.textContent = isOpen ? "×" : "☰";
      menuButton.classList.toggle("is-open", isOpen);
      menuButton.setAttribute("aria-label", isOpen ? "Fermer le menu" : "Ouvrir le menu");
      menuButton.setAttribute("aria-expanded", String(isOpen));
    };
    menuButton.addEventListener("click", () => {
      sidebar.classList.toggle("open");
      syncMenuButton();
    });
    syncMenuButton();
  }
}

function isPwaDisplayMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

async function promptPwaInstall() {
  if (!deferredInstallPrompt) {
    showPwaInstallCard({ force: true, instructionsOnly: true });
    showToast("Installation: ouvrez le menu du navigateur puis choisissez Installer l'application.", "error");
    return;
  }
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.querySelector(".pwa-install-card")?.remove();
  if (choice?.outcome === "accepted") {
    localStorage.setItem("afrixInstallBannerDismissed", "1");
    hidePwaInstallUi();
  }
}

function hidePwaInstallUi() {
  document.querySelector(".pwa-install-card")?.remove();
  document.querySelectorAll("[data-pwa-install]").forEach((button) => {
    button.hidden = true;
  });
}

function showPwaInstallCard({ force = false, instructionsOnly = false } = {}) {
  if (isPwaDisplayMode() || (!force && localStorage.getItem("afrixInstallBannerDismissed") === "1") || document.querySelector(".pwa-install-card")) return;
  const card = document.createElement("div");
  card.className = "pwa-install-card";
  card.innerHTML = `
    <div class="brand-mark">A</div>
    <div>
      <strong>Installer AFRIX</strong>
      <p>${instructionsOnly ? "Sur Android/Chrome: menu ⋮ puis Installer l'application. Sur iPhone: Partager puis Sur l'écran d'accueil." : "Accès rapide au wallet, aux plans et à AFRIX Money."}</p>
    </div>
    <button type="button" class="btn primary" data-pwa-card-install>Installer</button>
    <button type="button" class="pwa-install-close" aria-label="Fermer">&times;</button>
  `;
  document.body.appendChild(card);
  card.querySelector("[data-pwa-card-install]")?.addEventListener("click", promptPwaInstall);
  card.querySelector(".pwa-install-close")?.addEventListener("click", () => {
    localStorage.setItem("afrixInstallBannerDismissed", "1");
    card.remove();
  });
}

function setupPwa() {
  let manifest = document.querySelector("link[rel='manifest']");
  if (!manifest) {
    manifest = document.createElement("link");
    manifest.rel = "manifest";
    document.head.appendChild(manifest);
  }
  manifest.href = `/manifest.webmanifest?v=${APP_VERSION}`;
  if (!document.querySelector("meta[name='theme-color']")) {
    const theme = document.createElement("meta");
    theme.name = "theme-color";
    theme.content = "#0f5d43";
    document.head.appendChild(theme);
  }
  if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(`/service-worker.js?v=${APP_VERSION}`)
        .then((registration) => registration.update())
        .catch(() => {});
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (sessionStorage.getItem("afrix_sw_reloaded") === APP_VERSION) return;
      sessionStorage.setItem("afrix_sw_reloaded", APP_VERSION);
      window.location.reload();
    });
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showPwaInstallCard();
    document.querySelectorAll("[data-pwa-install]").forEach((button) => {
      button.hidden = false;
    });
  });
  window.addEventListener("appinstalled", () => {
    localStorage.setItem("afrixInstallBannerDismissed", "1");
    deferredInstallPrompt = null;
    hidePwaInstallUi();
  });
}

function renderContact() {
  document.querySelectorAll("[data-contact-telegram-support]").forEach((link) => { link.href = contactLinks.telegramSupport; });
  document.querySelectorAll("[data-contact-telegram-channel]").forEach((link) => { link.href = contactLinks.telegramChannel; });
  document.querySelectorAll("[data-contact-whatsapp-channel]").forEach((link) => { link.href = contactLinks.whatsappChannel; });
}

function renderSupportWidget() {
  if (document.querySelector("[data-support-widget]")) return;

  const widget = document.createElement("div");
  widget.className = "support-widget";
  widget.dataset.supportWidget = "true";
  widget.innerHTML = `
    <div class="support-panel" hidden>
      <strong>Support AFRIX</strong>
      <p>Utilisez uniquement la chaîne WhatsApp et le canal Telegram officiels.</p>
      <div>
        ${supportChannels.map((channel) => `
          <a class="btn ${channel.key === "whatsapp" ? "primary" : "secondary"}" href="${channel.href}" target="_blank" rel="noopener" aria-label="${channel.title}">
            <span aria-hidden="true">${channel.icon}</span>${channel.label}
          </a>
        `).join("")}
        <button class="btn secondary" type="button" data-support-close>Fermer</button>
      </div>
    </div>
    <a class="support-float support-telegram" href="${contactLinks.telegramChannel}" target="_blank" rel="noopener" aria-label="Rejoindre le canal Telegram AFRIX">
      <span aria-hidden="true">✈</span><strong>Telegram</strong>
    </a>
    <button class="support-float support-whatsapp" type="button" aria-expanded="false" aria-label="Afficher les canaux de support AFRIX">
      <span aria-hidden="true">☎</span><strong>WhatsApp</strong>
    </button>
  `;
  document.body.appendChild(widget);

  const toggle = widget.querySelector(".support-whatsapp");
  const panel = widget.querySelector(".support-panel");
  const close = widget.querySelector("[data-support-close]");
  const setOpen = (isOpen) => {
    widget.classList.toggle("open", isOpen);
    toggle.setAttribute("aria-expanded", String(isOpen));
    panel.hidden = !isOpen;
  };

  toggle.addEventListener("click", () => setOpen(!widget.classList.contains("open")));
  close.addEventListener("click", () => setOpen(false));
}

function renderDashboard(user) {
  const balance = document.querySelector("[data-balance]");
  const ausdBalance = document.querySelector("[data-ausd-balance]");
  const grsBalance = document.querySelector("[data-grs-balance]");
  const activity = document.querySelector("[data-activity]");
  const levelNote = document.querySelector("[data-level-note]");
  const team = document.querySelector("[data-team]");
  const bonus = document.querySelector("[data-bonus]");
  const rank = document.querySelector("[data-rank]");
  const progress = document.querySelector("[data-progress]");
  const progressText = document.querySelector("[data-progress-text]");
  const refLink = document.querySelector("[data-ref-link]");
  const recentList = document.querySelector("[data-recent-list]");
  const activeLevels = Math.max(
    0,
    Math.min(20, Math.max(Math.floor(Number(user.activity || 0) / 100), Number(user.bonusLevelsOverride || 0)))
  );

  if (balance) balance.textContent = formatUsdt(user.balance);
  if (ausdBalance) ausdBalance.textContent = formatAusd(user.ausdBalance);
  if (grsBalance) grsBalance.textContent = formatGrsc(user.grsBalance);
  if (activity) activity.textContent = formatAusd(usdtToAusd(user.activity));
  if (levelNote) levelNote.textContent = `${activeLevels} niveau${activeLevels > 1 ? "x" : ""} actif${activeLevels > 1 ? "s" : ""}`;
  if (team) team.textContent = Number(user.team || 0);
  if (bonus) bonus.textContent = formatAusd(usdtToAusd(user.bonus));
  if (rank) rank.textContent = user.rank || "Niveau 0";
  if (progress) progress.style.width = `${Math.max(0, Math.min(100, Number(user.progress || 0)))}%`;
  if (progressText) progressText.textContent = user.progressText || "Progression calculee selon votre activite validee.";
  if (refLink) refLink.value = user.refLink || "";

  if (recentList) {
    recentList.innerHTML = user.transactions.length ? user.transactions.slice(0, 3).map((item) => `
      <div>
        <span>${escapeHtml(item.type)}</span>
        <strong class="${String(item.amount || "").startsWith("+") ? "positive" : ""}">${escapeHtml(item.amount)}</strong>
        <small>${escapeHtml(item.description)}</small>
      </div>
    `).join("") : `<p class="muted">Aucune activite recente.</p>`;
  }
}

function renderTransactions(user) {
  const table = document.querySelector("[data-transaction-table]");
  if (!table) return;

  table.innerHTML = user.transactions.length ? user.transactions.map((item) => `
    <tr>
      <td>${escapeHtml(item.date)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.description)}</td>
      <td>${escapeHtml(item.amount)}</td>
      <td>${escapeHtml(item.status)}</td>
    </tr>
  `).join("") : `<tr><td colspan="5">Aucune transaction.</td></tr>`;
}

function renderWallet(user) {
  const depositMethod = document.querySelector("[data-deposit-method]");
  const withdrawMethod = document.querySelector("[data-withdraw-method]");
  const receiveCrypto = document.querySelector("[data-receive-crypto]");
  const receiveMobile = document.querySelector("[data-receive-mobile]");
  const targetLabel = document.querySelector("[data-deposit-target-label]");
  const targetValue = document.querySelector("[data-deposit-target]");
  const targetNote = document.querySelector("[data-deposit-target-note]");
  const depositAmount = document.querySelector("[data-deposit-amount]");
  const depositAmountLabel = document.querySelector("[data-deposit-amount-label]");
  const mtnDepositOption = document.querySelector("[data-mtn-cg-option]");
  const rdcDepositOptions = document.querySelectorAll("[data-rdc-option]");
  const depositMtnInstruction = document.querySelector("[data-deposit-mtn-instruction]");
  const depositRdcInstruction = document.querySelector("[data-deposit-rdc-instruction]");
  const txRefLabel = document.querySelector("[data-deposit-txref-label]");
  const txRefInput = document.querySelector("[data-deposit-txref]");
  const withdrawAmount = document.querySelector("[data-withdraw-amount]");
  const mtnWithdrawOption = document.querySelector("[data-withdraw-mtn-cg-option]");
  const rdcWithdrawOptions = document.querySelectorAll("[data-withdraw-rdc-option]");
  const withdrawAssetInput = document.querySelector("[data-withdraw-asset]");
  const withdrawMtnInstruction = document.querySelector("[data-withdraw-mtn-instruction]");
  const withdrawRdcInstruction = document.querySelector("[data-withdraw-rdc-instruction]");
  const withdrawAddress = document.querySelector("[data-withdraw-address]");
  const withdrawPhone = document.querySelector("[data-withdraw-phone]");
  const withdrawPhoneLabel = document.querySelector("[data-withdraw-phone-label]");
  const withdrawBeneficiary = document.querySelector("[data-withdraw-beneficiary]");
  const depositConversion = document.querySelector("[data-deposit-conversion]");
  const withdrawConversion = document.querySelector("[data-withdraw-conversion]");
  const depositLocalAmount = document.querySelector("[data-deposit-local-amount]");
  const withdrawLocalAmount = document.querySelector("[data-withdraw-local-amount]");
  const withdrawLocalSummary = document.querySelector("[data-withdraw-local-summary]");
  const withdrawFee = document.querySelector("[data-withdraw-fee]");
  const withdrawNet = document.querySelector("[data-withdraw-net]");
  const withdrawTotal = document.querySelector("[data-withdraw-total]");
  const grsCoinPerUsdt = getGrsCoinPerUsdt(user);

  function updateDepositConversion() {
    const method = depositMethod?.value || "bep20";
    const isRdcMethod = method === "airtel_cd" || method === "orange_cd";
    const isMtn = method === "mtn_cg";
    const amount = Number(depositAmount?.value || 0);
    if (depositConversion) depositConversion.hidden = !(isRdcMethod || isMtn);
    if (depositLocalAmount) {
      depositLocalAmount.textContent = isRdcMethod
        ? formatCdf(amount * CDF_DEPOSIT_RATE_USDT)
        : formatXaf(amount * DEPOSIT_MOBILE_RATE);
    }
  }

  function updateWithdrawConversion() {
    const amount = Number(withdrawAmount?.value || 0);
    const method = withdrawMethod?.value || "bep20";
    const asset = "USDT";
    const isMtn = method === "mtn_cg";
    const isRdcMethod = method === "airtel_cd" || method === "orange_cd";
    const fee = Number((amount * MTN_WITHDRAW_FEE_RATE).toFixed(2));
    const feeGrs = grsCoinPerUsdt ? Number((fee * grsCoinPerUsdt).toFixed(2)) : 0;
    if (withdrawConversion) withdrawConversion.hidden = false;
    if (withdrawFee) withdrawFee.textContent = grsCoinPerUsdt ? `${formatGrsc(feeGrs)} (${formatUsdt(fee)} equivalent)` : "Prix GRSC indisponible";
    if (withdrawNet) withdrawNet.textContent = formatAssetAmount(amount, asset);
    if (withdrawTotal) withdrawTotal.textContent = formatAssetAmount(amount, asset);
    if (withdrawLocalAmount) {
      withdrawLocalAmount.textContent = isRdcMethod
        ? formatCdf(amount * CDF_WITHDRAWAL_RATE_USDT)
        : formatXaf(amount * WITHDRAW_MOBILE_RATE);
    }
    if (withdrawLocalSummary) withdrawLocalSummary.hidden = !(isMtn || isRdcMethod);
  }

  function updateDepositTarget() {
    const canUseMtnCongo = isCongoBrazzaville(user.country);
    const canUseRdc = isCongoKinshasa(user.country);
    if (mtnDepositOption) mtnDepositOption.hidden = !canUseMtnCongo;
    rdcDepositOptions.forEach((option) => { option.hidden = !canUseRdc; });
    if (!canUseMtnCongo && depositMethod?.value === "mtn_cg") depositMethod.value = "bep20";
    if (!canUseRdc && ["airtel_cd", "orange_cd"].includes(depositMethod?.value)) depositMethod.value = "bep20";
    const method = depositMethod?.value || "bep20";
    const target = user.paymentTargets?.[method];
    const isMobileMethod = method === "mtn_cg" || method === "airtel_cd" || method === "orange_cd";
    const isRdcMethod = method === "airtel_cd" || method === "orange_cd";

    if (depositAmountLabel?.firstChild) depositAmountLabel.firstChild.textContent = "Montant minimum 10 USDT";
    if (depositMtnInstruction) depositMtnInstruction.hidden = method !== "mtn_cg";
    if (depositRdcInstruction) depositRdcInstruction.hidden = !isRdcMethod;

    if (targetLabel) targetLabel.textContent = target?.label || "Coordonnees de depot indisponibles";
    if (targetValue) targetValue.textContent = target?.value || "Indisponible";
    if (targetNote) targetNote.textContent = target?.note || "Connectez le backend pour charger les coordonnees officielles.";
    if (txRefLabel) {
      txRefLabel.hidden = isMobileMethod;
      txRefLabel.firstChild.textContent = "Référence transaction crypto";
    }
    if (txRefInput) {
      txRefInput.required = !isMobileMethod;
      txRefInput.disabled = isMobileMethod;
      txRefInput.placeholder = "Hash de transaction";
      if (isMobileMethod) txRefInput.value = "";
    }
    updateDepositConversion();
  }

  function updateWithdrawFields() {
    const canUseMtn = isCongoBrazzaville(user.country);
    const canUseRdc = isCongoKinshasa(user.country);
    if (mtnWithdrawOption) mtnWithdrawOption.hidden = !canUseMtn;
    rdcWithdrawOptions.forEach((option) => { option.hidden = !canUseRdc; });
    if (!canUseMtn && withdrawMethod?.value === "mtn_cg") withdrawMethod.value = "bep20";
    if (!canUseRdc && ["airtel_cd", "orange_cd"].includes(withdrawMethod?.value)) withdrawMethod.value = "bep20";
    const method = withdrawMethod?.value || "bep20";
    const isMobileMethod = method === "mtn_cg" || method === "airtel_cd" || method === "orange_cd";
    const isRdcMethod = method === "airtel_cd" || method === "orange_cd";
    if (withdrawAssetInput) {
      withdrawAssetInput.value = "USDT";
    }
    if (withdrawMtnInstruction) withdrawMtnInstruction.hidden = method !== "mtn_cg";
    if (withdrawRdcInstruction) withdrawRdcInstruction.hidden = !isRdcMethod;
    if (receiveCrypto) receiveCrypto.hidden = isMobileMethod;
    if (receiveMobile) receiveMobile.hidden = !isMobileMethod;
    if (withdrawAddress) {
      withdrawAddress.required = !isMobileMethod;
      withdrawAddress.disabled = isMobileMethod;
      if (isMobileMethod) withdrawAddress.value = "";
    }
    if (withdrawPhone) {
      withdrawPhone.required = isMobileMethod;
      withdrawPhone.disabled = !isMobileMethod;
      withdrawPhone.placeholder = isRdcMethod ? "+243..." : "+242...";
      if (!isMobileMethod) withdrawPhone.value = "";
    }
    if (withdrawPhoneLabel?.firstChild) withdrawPhoneLabel.firstChild.textContent = isRdcMethod ? "Numéro Airtel/Orange Money" : "Numéro Mobile Money";
    if (withdrawBeneficiary) {
      withdrawBeneficiary.required = isMobileMethod;
      withdrawBeneficiary.disabled = !isMobileMethod;
      if (!isMobileMethod) withdrawBeneficiary.value = "";
    }
    updateWithdrawConversion();
  }

  depositMethod?.addEventListener("change", updateDepositTarget);
  withdrawMethod?.addEventListener("change", updateWithdrawFields);
  withdrawAssetInput?.addEventListener("change", updateWithdrawConversion);
  depositAmount?.addEventListener("input", updateDepositConversion);
  withdrawAmount?.addEventListener("input", updateWithdrawConversion);
  updateDepositTarget();
  updateWithdrawFields();
}

function renderSwap(user) {
  const usdtBalances = document.querySelectorAll("[data-swap-usdt-balance]");
  const ausdBalances = document.querySelectorAll("[data-swap-ausd-balance]");
  const grsBalances = document.querySelectorAll("[data-swap-grs-balance]");
  const rates = document.querySelectorAll("[data-swap-rate]");
  const ausdRates = document.querySelectorAll("[data-ausd-rate]");
  const estimatedValues = document.querySelectorAll("[data-grs-estimated-value]");
  const ausdEstimatedValues = document.querySelectorAll("[data-ausd-estimated-value]");
  const marketTotalSupply = document.querySelector("[data-market-total-supply]");
  const marketIssuedSupply = document.querySelector("[data-market-issued-supply]");
  const marketRemainingSupply = document.querySelectorAll("[data-market-remaining-supply]");
  const marketSupplyProgress = document.querySelector("[data-market-supply-progress]");
  const marketTrades = document.querySelector("[data-market-trades]");
  const marketToday = document.querySelector("[data-market-today]");
  const contractAddress = document.querySelector("[data-grs-contract-address]");
  const grsDepositAddress = document.querySelector("[data-grs-deposit-address]");
  const usdtBep20Address = document.querySelector("[data-grs-usdt-bep20-address]");
  const directionInput = document.querySelector("[data-swap-direction]");
  const amountInput = document.querySelector("[data-swap-amount]");
  const amountLabel = document.querySelector("[data-swap-amount-label]");
  const swapSubmit = document.querySelector("[data-swap-submit]");
  const preview = document.querySelector("[data-swap-preview]");
  const depositAmountInput = document.querySelector("[data-grs-deposit-amount]");
  const depositPreview = document.querySelector("[data-grs-deposit-preview]");
  const usdtDepositAmountInput = document.querySelector("[data-grs-usdt-deposit-amount]");
  const usdtDepositAssetInput = document.querySelector("[data-grs-usdt-deposit-asset]");
  const usdtDepositPreview = document.querySelector("[data-grs-usdt-deposit-preview]");
  if (!usdtBalances.length && !grsBalances.length && !rates.length && !amountInput && !depositAmountInput) return;

  const grsCoinPriceUsdt = Number(user.swap?.grsCoinPriceUsdt || 0.0725);
  const bonusRate = Number.isFinite(Number(user.swap?.bonusRate))
    ? Number(user.swap.bonusRate)
    : Array.isArray(user.swap?.bonusRates)
    ? user.swap.bonusRates.reduce((total, rate) => total + Number(rate || 0), 0)
    : 0.10;
  const totalFeeRate = Number(user.swap?.swapFeeRate || 0);
  const market = { ...emptyUser.swap.market, ...(user.swap?.market || {}) };
  const issuedPercent = Math.max(0, Math.min(100, Number(market.issuedPercent || 0)));
  usdtBalances.forEach((element) => { element.textContent = formatUsdt(user.balance); });
  ausdBalances.forEach((element) => { element.textContent = formatAusd(user.ausdBalance); });
  grsBalances.forEach((element) => { element.textContent = formatGrsc(user.grsBalance); });
  rates.forEach((element) => { element.textContent = grsCoinPriceUsdt ? `1 GRSC = ${formatTokenPrice(grsCoinPriceUsdt)}` : "Prix indisponible"; });
  ausdRates.forEach((element) => { element.textContent = `1 AUSD = ${formatTokenPrice(AUSD_PRICE_USDT)}`; });
  estimatedValues.forEach((element) => { element.textContent = formatUsdt(Number(user.grsBalance || 0) * grsCoinPriceUsdt); });
  ausdEstimatedValues.forEach((element) => {
    element.textContent = formatAusd((Number(user.grsBalance || 0) * grsCoinPriceUsdt) / AUSD_PRICE_USDT);
  });
  if (marketTotalSupply) marketTotalSupply.textContent = formatGrsc(market.totalSupply);
  if (marketIssuedSupply) marketIssuedSupply.textContent = formatGrsc(market.issuedSupply);
  marketRemainingSupply.forEach((element) => { element.textContent = formatGrsc(market.remainingSupply); });
  if (marketTrades) marketTrades.textContent = Number(market.totalTrades || 0).toLocaleString("fr-FR");
  if (marketToday) marketToday.textContent = Number(market.todayTrades || 0).toLocaleString("fr-FR");
  if (marketSupplyProgress) {
    marketSupplyProgress.style.width = `${issuedPercent}%`;
    marketSupplyProgress.textContent = issuedPercent >= 8 ? `${issuedPercent.toFixed(2)}%` : "";
    marketSupplyProgress.setAttribute("aria-label", `${issuedPercent.toFixed(2)}% de l'offre GRSCOIN emise`);
  }
  if (contractAddress) contractAddress.textContent = user.swap?.contractAddress || "Adresse non configuree";
  if (grsDepositAddress) grsDepositAddress.textContent = user.swap?.grsDepositAddress || "Adresse non configuree";
  if (usdtBep20Address) usdtBep20Address.textContent = user.swap?.usdtBep20DepositAddress || "Adresse non configuree";

  const updatePreview = () => {
    const amount = Number(amountInput?.value || 0);
    const direction = directionInput?.value || "USDT_GRSC";
    const sourceAsset = direction.split("_")[0] || "USDT";
    if (amountLabel?.firstChild) amountLabel.firstChild.textContent = `Montant ${sourceAsset} a convertir`;
    const unavailable = direction === "GRSC_USDT" || direction === "GRSC_AUSD";
    if (swapSubmit) {
      swapSubmit.disabled = unavailable;
      swapSubmit.textContent = unavailable ? "Indisponible" : "Échanger";
    }
    if (unavailable) {
      if (preview) preview.textContent = "Indisponible pour le moment.";
      return;
    }
    if (!amount || amount <= 0) {
      if (preview) preview.textContent = `Saisissez un montant ${sourceAsset}.`;
      return;
    }
    if (direction === "USDT_AUSD") {
      const fee = amount * totalFeeRate;
      const ausdAmount = (amount - fee) / AUSD_PRICE_USDT;
      if (preview) preview.textContent = `${formatUsdt(amount)} -> ${formatAusd(ausdAmount)} apres 2.5% de frais.`;
      return;
    }
    if (direction === "AUSD_USDT") {
      const grossUsdtAmount = amount * AUSD_PRICE_USDT;
      const fee = grossUsdtAmount * totalFeeRate;
      if (preview) preview.textContent = `${formatAusd(amount)} -> ${formatUsdt(grossUsdtAmount - fee)} apres 2.5% de frais.`;
      return;
    }
    if (direction === "AUSD_GRSC") {
      const grossUsdt = amount * AUSD_PRICE_USDT;
      const feeGrs = grsCoinPriceUsdt ? (grossUsdt * totalFeeRate) / grsCoinPriceUsdt : 0;
      const grsAmount = grsCoinPriceUsdt ? (grossUsdt / grsCoinPriceUsdt) - feeGrs : 0;
      if (preview) preview.textContent = `${formatAusd(amount)} -> ${formatGrsc(grsAmount)} apres 2.5% de frais payes en GRSC.`;
      return;
    }
    const grossGrsAmount = amount > 0 && grsCoinPriceUsdt ? amount / grsCoinPriceUsdt : 0;
    const feeGrs = grossGrsAmount * totalFeeRate;
    const grsAmount = Math.max(0, grossGrsAmount - feeGrs);
    if (preview) preview.textContent = grsAmount ? `${formatUsdt(amount)} -> ${formatGrsc(grsAmount)} apres 2.5% de frais payes en GRSC` : "Saisissez un montant USDT.";
  };
  const updateDepositPreview = () => {
    const amount = Number(depositAmountInput?.value || 0);
    if (depositPreview) depositPreview.textContent = amount > 0 ? `${formatGrsc(amount)} a crediter.` : "Saisissez le montant GRSCOIN a crediter.";
  };
  const updateUsdtDepositPreview = () => {
    const amount = Number(usdtDepositAmountInput?.value || 0);
    const creditAsset = usdtDepositAssetInput?.value || "GRSC";
    const netAmount = amount > 0 ? amount * (1 - totalFeeRate) : 0;
    const grsAmount = netAmount > 0 && grsCoinPriceUsdt ? netAmount / grsCoinPriceUsdt : 0;
    const ausdAmount = netAmount > 0 ? netAmount / AUSD_PRICE_USDT : 0;
    if (usdtDepositPreview) {
      usdtDepositPreview.textContent = amount > 0
        ? creditAsset === "AUSD"
          ? `${formatUsdt(amount)} -> ${formatAusd(ausdAmount)} apres 2.5% de frais et validation admin.`
          : `${formatUsdt(amount)} -> ${formatGrsc(grsAmount)} apres 2.5% de frais et validation admin.`
        : "Saisissez le montant USDT a convertir.";
    }
  };

  if (directionInput && !directionInput.dataset.boundSwapDirection) {
    directionInput.dataset.boundSwapDirection = "true";
    directionInput.addEventListener("change", updatePreview);
  }
  if (amountInput && !amountInput.dataset.boundSwapPreview) {
    amountInput.dataset.boundSwapPreview = "true";
    amountInput.addEventListener("input", updatePreview);
  }
  if (depositAmountInput && !depositAmountInput.dataset.boundGrsDepositPreview) {
    depositAmountInput.dataset.boundGrsDepositPreview = "true";
    depositAmountInput.addEventListener("input", updateDepositPreview);
  }
  if (usdtDepositAmountInput && !usdtDepositAmountInput.dataset.boundGrsUsdtDepositPreview) {
    usdtDepositAmountInput.dataset.boundGrsUsdtDepositPreview = "true";
    usdtDepositAmountInput.addEventListener("input", updateUsdtDepositPreview);
  }
  if (usdtDepositAssetInput && !usdtDepositAssetInput.dataset.boundGrsUsdtDepositAsset) {
    usdtDepositAssetInput.dataset.boundGrsUsdtDepositAsset = "true";
    usdtDepositAssetInput.addEventListener("change", updateUsdtDepositPreview);
  }
  updatePreview();
  updateDepositPreview();
  updateUsdtDepositPreview();
}

function renderPlans(user) {
  const list = document.querySelector("[data-plans-list]");
  if (!list) return;
  renderActivePlans(user);

  const stakingActivityByPlan = (planId) => (user.activeStakes || [])
    .filter((stake) => stake.planId === planId)
    .reduce((total, stake) => total + Number(stake.amount || 0), 0);
  const totalStakingActivity = (user.activeStakes || [])
    .reduce((total, stake) => total + Number(stake.amount || 0), 0);

  list.innerHTML = plans.map((plan) => {
    const currentActivity = plan.requiredStakePlan ? stakingActivityByPlan(plan.requiredStakePlan) : 0;
    const isUnlocked = !plan.requiredStakePlan || currentActivity >= Number(plan.requiredStakeAmount || 0);
    const requirement = plan.requiredStakePlan
      ? `Condition: ${Number(plan.requiredStakeAmount || 0).toLocaleString("fr-FR")} GRSC dans ${plan.requiredStakeName} - Actuel: ${formatGrsc(currentActivity)}`
      : "Condition: ouverture initiale sans staking requis.";

    return `
    <article class="${plan.featured ? "featured" : ""} ${isUnlocked ? "" : "locked"}">
      <span class="plan-tier">${plan.tier}</span>
      <h2>${plan.name}</h2>
      <strong>${plan.amount}</strong>
      <div class="plan-metrics">
        <small><span>Objectif quotidien</span>${plan.daily}</small>
        <small><span>Duree du cycle</span>${plan.duration}</small>
        <small><span>Objectif cycle</span>${plan.cycle}</small>
      </div>
      <p>${plan.note}</p>
      <small>${requirement}</small>
      <small>Solde disponible: ${formatUsdt(user.balance)} - Staking cumule: ${formatGrsc(totalStakingActivity)} / 80 000.00 GRSC</small>
      <label class="plan-investment-input">
        Montant a investir
        <input type="number" min="10" step="0.01" value="${plan.minAmount}" data-plan-amount>
      </label>
      <button class="btn primary" type="button" data-plan="${escapeHtml(plan.name)}" data-plan-min="${plan.minAmount}" ${isUnlocked ? "" : "disabled"}>${isUnlocked ? "Activer" : "Verrouille"}</button>
    </article>
  `;
  }).join("");
}

function renderActivePlans(user) {
  const list = document.querySelector("[data-active-plans-list]");
  const count = document.querySelector("[data-active-plans-count]");
  if (!list) return;

  const activePlans = (user.activePlans || [])
    .slice()
    .sort((a, b) => String(b.activatedAt || "").localeCompare(String(a.activatedAt || "")));
  if (count) count.textContent = activePlans.length;

  list.innerHTML = activePlans.length ? activePlans.map((plan) => {
    const durationDays = Math.max(1, Number(plan.durationDays || 0));
    const daysPaid = Math.min(durationDays, Math.max(0, Number(plan.daysPaid || 0)));
    const percent = Math.min(100, Math.round((daysPaid / durationDays) * 100));
    const remainingDays = Math.max(0, durationDays - daysPaid);
    const daysProgressLabel = `${daysPaid}/${durationDays} jours`;
    const dailyGain = Number(plan.amount || 0) * Number(plan.dailyRate || 0);
    const status = plan.status === "completed" ? "Termine" : "Actif";
    return `
      <article class="active-plan-card">
        <div class="active-plan-head">
          <span>
            <strong>${escapeHtml(tradingPlanName(plan.name || plan.planId))}</strong>
            <small>${escapeHtml(status)} depuis ${escapeHtml(String(plan.activatedAt || "").slice(0, 10) || "-")}</small>
          </span>
          <b>${daysProgressLabel}</b>
        </div>
        <div class="progress active-plan-progress" aria-label="Progression ${escapeHtml(tradingPlanName(plan.name || plan.planId))}: ${daysProgressLabel}">
          <span style="width:${percent}%"></span>
        </div>
        <div class="active-plan-stats">
          <small><span>Capital bloqué</span>${formatUsdt(plan.amount || 0)}</small>
          <small><span>Gain par jour</span>${formatUsdt(dailyGain)}</small>
          <small><span>Gains cumulés</span>${formatUsdt(plan.earnedAmount || 0)}</small>
          <small><span>Jours payés</span>${daysPaid}/${durationDays}</small>
          <small><span>Jours restants</span>${remainingDays}</small>
        </div>
      </article>
    `;
  }).join("") : `<p class="muted">Aucun investissement actif pour le moment.</p>`;
}

function renderStaking(user) {
  const plansList = document.querySelector("[data-staking-plans-list]");
  const activeList = document.querySelector("[data-active-stakes-list]");
  const activeCount = document.querySelector("[data-active-stakes-count]");
  const grsBalance = document.querySelector("[data-staking-grs-balance]");
  const lockedBalance = document.querySelector("[data-staking-locked-balance]");
  const projectedRewards = document.querySelector("[data-staking-projected-rewards]");
  if (!plansList && !activeList && !grsBalance) return;

  const activeStakes = (user.activeStakes || [])
    .slice()
    .sort((a, b) => String(b.activatedAt || "").localeCompare(String(a.activatedAt || "")));
  const lockedTotal = activeStakes
    .filter((stake) => stake.status === "active")
    .reduce((total, stake) => total + Number(stake.amount || 0), 0);
  const rewardsTotal = activeStakes
    .filter((stake) => stake.status === "active")
    .reduce((total, stake) => total + Number(stake.rewardAmount || 0), 0);

  if (grsBalance) grsBalance.textContent = formatGrsc(user.grsBalance);
  if (lockedBalance) lockedBalance.textContent = formatGrsc(lockedTotal);
  if (projectedRewards) projectedRewards.textContent = formatGrsc(rewardsTotal);
  if (activeCount) activeCount.textContent = activeStakes.filter((stake) => stake.status === "active").length;

  if (plansList) {
    plansList.innerHTML = stakingPlans.map((plan) => {
      const canActivate = Number(user.grsBalance || 0) >= plan.minAmount;
      return `
        <article class="${plan.featured ? "featured" : ""}">
          <span class="plan-tier">${escapeHtml(plan.tier)}</span>
          <h2>${escapeHtml(plan.name)}</h2>
          <strong>${escapeHtml(plan.amount)}</strong>
          <div class="plan-metrics">
            <small><span>Cycle</span>${escapeHtml(plan.duration)}</small>
            <small><span>Objectif</span>${escapeHtml(plan.objective)}</small>
            <small><span>Sortie visee</span>${escapeHtml(plan.exitValue)}</small>
          </div>
          <p>Verrouillage temporaire de GRSCOIN avec restitution du capital et du resultat vise a l'issue du cycle.</p>
          <small>Solde disponible: ${formatGrsc(user.grsBalance)}</small>
          <label class="plan-investment-input">
            Montant a staker
            <input type="number" min="${plan.minAmount}" step="0.01" value="${plan.minAmount}" data-staking-amount>
          </label>
          <button class="btn primary" type="button" data-staking-plan="${escapeHtml(plan.id)}">${canActivate ? "Staker" : "Solde insuffisant"}</button>
        </article>
      `;
    }).join("");
  }

  if (activeList) {
    activeList.innerHTML = activeStakes.length ? activeStakes.map((stake) => {
      const start = Date.parse(stake.activatedAt || "");
      const end = Date.parse(stake.endsAt || "");
      const now = Date.now();
      const totalMs = Number.isFinite(start) && Number.isFinite(end) ? Math.max(1, end - start) : 1;
      const elapsedMs = Number.isFinite(start) ? Math.max(0, now - start) : 0;
      const percent = stake.status === "completed" ? 100 : Math.max(0, Math.min(100, Math.round((elapsedMs / totalMs) * 100)));
      const remainingDays = Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 86_400_000)) : Number(stake.durationDays || 0);
      const canClaim = stake.status === "active" && Number.isFinite(end) && now >= end;
      const status = stake.status === "completed" ? "Reclame" : canClaim ? "Disponible" : "Actif";
      return `
        <article class="active-plan-card">
          <div class="active-plan-head">
            <span>
              <strong>${escapeHtml(stake.name || "Staking GRSC")}</strong>
              <small>${escapeHtml(status)} depuis ${escapeHtml(String(stake.activatedAt || "").slice(0, 10) || "-")}</small>
            </span>
            <b>${percent}%</b>
          </div>
          <div class="progress active-plan-progress" aria-label="Progression staking ${percent}%">
            <span style="width:${percent}%"></span>
          </div>
          <div class="active-plan-stats">
            <small><span>Capital bloque</span>${formatGrsc(stake.amount || 0)}</small>
            <small><span>Objectif</span>${Number((Number(stake.rewardRate || 0) * 100).toFixed(2)).toLocaleString("fr-FR")}%</small>
            <small><span>Resultat vise</span>${formatGrsc(stake.rewardAmount || 0)}</small>
            <small><span>Sortie visee</span>${formatGrsc(stake.maturityAmount || 0)}</small>
            <small><span>Jours restants</span>${remainingDays}</small>
          </div>
          ${stake.status === "active" ? `<button class="btn secondary" type="button" data-staking-claim="${escapeHtml(stake.id)}" ${canClaim ? "" : "disabled"}>Reclamer</button>` : ""}
        </article>
      `;
    }).join("") : `<p class="muted">Aucun staking actif pour le moment.</p>`;
  }
}

function renderFounders(user) {
  const plansList = document.querySelector("[data-founders-plans-list]");
  const activeList = document.querySelector("[data-active-founders-list]");
  const activeCount = document.querySelector("[data-active-founders-count]");
  const grsBalance = document.querySelector("[data-founders-grs-balance]");
  const lockedBalance = document.querySelector("[data-founders-locked-balance]");
  const projectedRewards = document.querySelector("[data-founders-projected-rewards]");
  if (!plansList && !activeList && !grsBalance) return;

  const activeFounders = (user.activeFounders || [])
    .slice()
    .sort((a, b) => String(b.activatedAt || "").localeCompare(String(a.activatedAt || "")));
  const activeOnly = activeFounders.filter((item) => item.status === "active");
  const lockedTotal = activeOnly.reduce((total, item) => total + Number(item.amount || 0), 0);
  const rewardTotal = activeOnly.reduce((total, item) => total + Number(item.rewardAmount || 0), 0);

  if (grsBalance) grsBalance.textContent = formatGrsc(user.grsBalance);
  if (lockedBalance) lockedBalance.textContent = formatGrsc(lockedTotal);
  if (projectedRewards) projectedRewards.textContent = formatGrsc(rewardTotal);
  if (activeCount) activeCount.textContent = activeOnly.length;

  if (plansList) {
    plansList.innerHTML = foundersPlans.map((plan) => {
      const activationFee = plan.minAmount * FOUNDERS_ACTIVATION_FEE_RATE;
      const totalRequired = plan.minAmount + activationFee;
      const canActivate = Number(user.grsBalance || 0) >= totalRequired;
      const className = [plan.featured ? "featured" : "", plan.global ? "global" : "", plan.id === "legend" ? "founder-legend-card" : ""].filter(Boolean).join(" ");
      const maturityRate = plan.rewardRate * plan.durationYears;
      return `
        <article class="partner-level-card ${className}">
          <span class="plan-tier">${escapeHtml(plan.name)}</span>
          <h2>${escapeHtml(plan.tier)}</h2>
          <div class="partner-requirements">
            <span><small>Participation</small><strong>${escapeHtml(plan.amount)}</strong></span>
            <span><small>Duree</small><strong>${escapeHtml(plan.duration)}</strong></span>
            <span><small>Objectif indicatif</small><strong>${escapeHtml(plan.objective)}</strong></span>
          </div>
          <p>GRSCOIN verrouilles jusqu'a maturite avec restitution du capital et recompense ciblee selon les performances de l'ecosysteme.</p>
          <small>Recompense ciblee sur le cycle: ${Number((maturityRate * 100).toFixed(2)).toLocaleString("fr-FR")}%</small>
          <small>Frais activation: ${formatGrsc(activationFee)} - Total requis: ${formatGrsc(totalRequired)}</small>
          <small>Solde disponible: ${formatGrsc(user.grsBalance)}</small>
          <label class="plan-investment-input">
            Montant a immobiliser
            <input type="number" min="${plan.minAmount}" step="0.01" value="${plan.minAmount}" data-founder-amount>
          </label>
          <button class="btn primary" type="button" data-founder-plan="${escapeHtml(plan.id)}">${canActivate ? "Activer" : "Solde insuffisant"}</button>
        </article>
      `;
    }).join("");
  }

  if (activeList) {
    activeList.innerHTML = activeFounders.length ? activeFounders.map((item) => {
      const start = Date.parse(item.activatedAt || "");
      const end = Date.parse(item.endsAt || "");
      const now = Date.now();
      const totalMs = Number.isFinite(start) && Number.isFinite(end) ? Math.max(1, end - start) : 1;
      const elapsedMs = Number.isFinite(start) ? Math.max(0, now - start) : 0;
      const percent = item.status === "completed" ? 100 : Math.max(0, Math.min(100, Math.round((elapsedMs / totalMs) * 100)));
      const remainingDays = Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 86_400_000)) : Number(item.durationDays || 0);
      const canClaim = item.status === "active" && Number.isFinite(end) && now >= end;
      const status = item.status === "completed" ? "Reclame" : canClaim ? "Disponible" : "Actif";
      return `
        <article class="active-plan-card">
          <div class="active-plan-head">
            <span>
              <strong>${escapeHtml(item.name || "GRS Core Founders Club")}</strong>
              <small>${escapeHtml(status)} depuis ${escapeHtml(String(item.activatedAt || "").slice(0, 10) || "-")}</small>
            </span>
            <b>${percent}%</b>
          </div>
          <div class="progress active-plan-progress" aria-label="Progression Founders Club ${percent}%">
            <span style="width:${percent}%"></span>
          </div>
          <div class="active-plan-stats">
            <small><span>Capital bloque</span>${formatGrsc(item.amount || 0)}</small>
            <small><span>Objectif annuel</span>${Number((Number(item.rewardRate || 0) * 100).toFixed(2)).toLocaleString("fr-FR")}%</small>
            <small><span>Gains bloques</span>${formatGrsc(item.earnedAmount || 0)}</small>
            <small><span>Sortie ciblee</span>${formatGrsc(item.maturityAmount || 0)}</small>
            <small><span>Jours restants</span>${remainingDays.toLocaleString("fr-FR")}</small>
          </div>
          ${item.status === "active" ? `<button class="btn secondary" type="button" data-founder-claim="${escapeHtml(item.id)}" ${canClaim ? "" : "disabled"}>Reclamer</button>` : ""}
        </article>
      `;
    }).join("") : `<p class="muted">Aucune participation Founders Club active pour le moment.</p>`;
  }
}

function renderNetwork(user) {
  const levelsList = document.querySelector("[data-levels-list]");
  const partnersList = document.querySelector("[data-direct-partners-list]");
  const partnersCount = document.querySelector("[data-direct-partners-count]");
  const refLink = document.querySelector("[data-ref-link]");
  const activeLevels = Math.max(0, Math.min(20, Math.max(Math.floor(Number(user.activity || 0) / 100), Number(user.bonusLevelsOverride || 0))));

  if (levelsList) {
    levelsList.innerHTML = bonusRates.map((rate, index) => {
      const level = index + 1;
      return `<div class="level ${level > activeLevels ? "locked" : ""}"><strong>Niveau ${level}</strong><span>${rate}% bonus ${level > activeLevels ? "verrouille" : "actif"}</span></div>`;
    }).join("");
  }

  if (refLink) refLink.value = user.refLink || "";
  if (partnersCount) partnersCount.textContent = user.directPartners.length;
  if (partnersList) {
    partnersList.innerHTML = user.directPartners.length ? user.directPartners.map((partner) => `
      <div>
        <span>${escapeHtml(partner.fullName)}<small>${escapeHtml(partner.email)}</small></span>
        <strong>${Number(partner.activity || 0).toFixed(0)} USDT</strong>
      </div>
    `).join("") : `<p class="muted">Aucun partenaire direct pour le moment.</p>`;
  }
}

function renderProfile(user) {
  const email = document.querySelector("[data-profile-email]");
  const country = document.querySelector("[data-profile-country]");
  const countryInput = document.querySelector("[data-profile-country-input]");
  const avatar = document.querySelector("[data-profile-avatar]");
  const avatarFallback = document.querySelector("[data-profile-avatar-fallback]");
  const balance = document.querySelector("[data-profile-balance]");
  const activity = document.querySelector("[data-profile-activity]");
  const role = document.querySelector("[data-profile-role]");
  if (email) email.textContent = user.email || "-";
  if (country) country.textContent = user.country || "-";
  hydrateProfileCountrySelect(countryInput, user.country || "");
  const avatarData = user.avatar?.dataBase64 ? `data:${user.avatar.mimeType || "image/jpeg"};base64,${user.avatar.dataBase64}` : "";
  if (avatar) {
    avatar.src = avatarData;
    avatar.hidden = !avatarData;
  }
  if (avatarFallback) {
    const initials = String(user.fullName || user.email || "AF").slice(0, 2).toUpperCase();
    avatarFallback.textContent = initials;
    avatarFallback.hidden = Boolean(avatarData);
  }
  if (balance) balance.textContent = formatUsdt(user.balance);
  if (activity) activity.textContent = formatUsdt(user.activity);
  if (role) role.textContent = user.role || "user";
}

function merchantCard(merchant, reference = "AFX-...") {
  const whatsAppMessage = encodeURIComponent(`Bonjour ${merchant.businessName}, je souhaite effectuer une operation AFRIX Money. Ma reference est ${reference}`);
  const whatsAppLink = `https://wa.me/${String(merchant.phone || "").replace(/[^\d]/g, "")}?text=${whatsAppMessage}`;

  return `
    <div class="merchant-card">
      <span>${escapeHtml(merchant.businessName)}<small>${escapeHtml(merchant.city)}, ${escapeHtml(merchant.country)} - ${escapeHtml(merchant.methods)} - WhatsApp merchant: ${escapeHtml(merchant.phone)} - ${escapeHtml(merchant.limits)}</small></span>
      <strong>${escapeHtml(merchant.rating || "Actif")}</strong>
      <span class="badge">${escapeHtml(merchant.status || "Disponible")}</span>
      <a class="btn secondary" href="${whatsAppLink}" target="_blank" rel="noopener">WhatsApp</a>
    </div>
  `;
}

function renderMerchantCards(container, rows) {
  if (!container) return;
  container.innerHTML = rows.length ? rows.map((merchant) => merchantCard(merchant)).join("") : `<p class="muted">Aucun merchant disponible pour cette recherche.</p>`;
}

function exchangeTypeLabel(type) {
  return type === "sell" ? "Acheter USDT" : "Vendre USDT";
}

function exchangeActionLabel(type) {
  return type === "sell" ? "Demander l'achat" : "Demander la vente";
}

function renderExchangeAd(ad, user = emptyUser) {
  const methods = Array.isArray(ad.methods) ? ad.methods : [];
  return `
    <article class="exchange-ad">
      <div>
        <span class="pill">${exchangeTypeLabel(ad.type)}</span>
        <h2>${escapeHtml(ad.merchantName || "Merchant AFRIX")}</h2>
        <p class="muted">${escapeHtml(ad.city || "")}${ad.city && ad.country ? ", " : ""}${escapeHtml(ad.country || "")}</p>
      </div>
      <div class="exchange-rate"><span>Taux</span><strong>${Math.round(Number(ad.rate || 0)).toLocaleString("fr-FR")} FCFA</strong></div>
      <div class="principle-list">
        ${methods.map((method) => `<span>${escapeHtml(method)}</span>`).join("")}
      </div>
      <small>Limites: ${formatUsdt(ad.minAmount)} à ${formatUsdt(ad.maxAmount)}</small>
      <form data-exchange-order-form data-ad-id="${escapeHtml(ad.id)}" data-ad-type="${escapeHtml(ad.type)}" data-rate="${Number(ad.rate || 0)}">
        <label>Montant USDT<input name="amount" type="number" min="${Number(ad.minAmount || 1)}" max="${Number(ad.maxAmount || 0)}" step="0.01" value="${Number(ad.minAmount || 1)}" required data-exchange-amount></label>
        <label>Moyen de paiement
          <select name="paymentMethod" required>
            ${methods.map((method) => `<option>${escapeHtml(method)}</option>`).join("")}
          </select>
        </label>
        <label>Email du compte AFRIX à créditer ou débiter<input name="customerEmail" type="email" value="${escapeHtml(user.email || "")}" required></label>
        <label>Référence du paiement local, si déjà payée<input name="txReference" placeholder="Mobile Money, banque, carte..."></label>
        <p class="muted" data-exchange-local>Total local: ${formatXaf(Number(ad.minAmount || 0) * Number(ad.rate || 0))}</p>
        <button class="btn primary full" type="submit">${exchangeActionLabel(ad.type)}</button>
      </form>
    </article>
  `;
}

function renderExchangeAds(container, ads, user = emptyUser) {
  if (!container) return;
  container.innerHTML = ads.length ? ads.map((ad) => renderExchangeAd(ad, user)).join("") : `<p class="muted">Aucune annonce disponible pour ce marché.</p>`;
}

function renderExchange(user) {
  const buyList = document.querySelector("[data-exchange-buy-list]");
  const sellList = document.querySelector("[data-exchange-sell-list]");
  const orderOutput = document.querySelector("[data-exchange-order-output]");
  if (!buyList && !sellList) return;

  Promise.all([
    apiRequest("/exchange/ads?type=sell"),
    apiRequest("/exchange/ads?type=buy")
  ]).then(([buyData, sellData]) => {
    renderExchangeAds(buyList, Array.isArray(buyData.ads) ? buyData.ads : [], user);
    renderExchangeAds(sellList, Array.isArray(sellData.ads) ? sellData.ads : [], user);
  }).catch((error) => {
    renderExchangeAds(buyList, []);
    renderExchangeAds(sellList, []);
    showToast(error.message, "error");
  });

  document.querySelector("[data-exchange-orders-list]")?.replaceChildren();
  const ordersList = document.querySelector("[data-exchange-orders-list]");
  if (ordersList) {
    ordersList.innerHTML = user.exchangeOrders.length ? user.exchangeOrders.map((order) => `
      <div>
        <span>${escapeHtml(order.reference)}<small>${exchangeTypeLabel(order.type)} - ${escapeHtml(order.paymentMethod)} - ${escapeHtml(order.status)}</small></span>
        <strong>${formatUsdt(order.amount)}</strong>
      </div>
    `).join("") : `<p class="muted">Aucune demande Exchange pour le moment.</p>`;
  }

  if (!document.body.dataset.exchangeBound) {
    document.body.dataset.exchangeBound = "true";
    document.addEventListener("input", (event) => {
      const amountInput = event.target.closest("[data-exchange-amount]");
      if (!amountInput) return;
      const form = amountInput.closest("[data-exchange-order-form]");
      const local = form?.querySelector("[data-exchange-local]");
      if (local) local.textContent = `Total local: ${formatXaf(Number(amountInput.value || 0) * Number(form.dataset.rate || 0))}`;
    });

    document.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-exchange-order-form]");
      if (!form) return;
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      const restoreButton = setButtonLoading(submitButton, "Création...");
      try {
        const response = await apiJson("/exchange/orders", {
          ...formToObject(form),
          adId: form.dataset.adId
        });
        const order = response.order;
        const currentOutput = document.querySelector("[data-exchange-order-output]");
        if (currentOutput && order) {
          const whatsappText = encodeURIComponent(`Bonjour ${order.merchantName}, voici ma référence AFRIX Exchange: ${order.reference}. Montant: ${formatUsdt(order.amount)}. Paiement: ${order.paymentMethod}.`);
          const whatsappLink = `https://wa.me/${String(order.merchantWhatsapp || "").replace(/[^\d]/g, "")}?text=${whatsappText}`;
          currentOutput.hidden = false;
          currentOutput.innerHTML = `
            <span class="pill">Référence générée</span>
            <h1>${escapeHtml(order.reference)}</h1>
            <p class="muted">${exchangeTypeLabel(order.type)}: ${formatUsdt(order.amount)} pour ${formatXaf(order.localAmount)} au taux de ${Math.round(order.rate).toLocaleString("fr-FR")} FCFA.</p>
            <div class="wallet-address">
              <div>
                <span>Références merchant</span>
                <strong>${escapeHtml(order.paymentInstructions)}</strong>
                <small>Après paiement, contactez l'annonceur sur WhatsApp avec votre référence.</small>
              </div>
              <a class="btn secondary" href="${whatsappLink}" target="_blank" rel="noopener">WhatsApp</a>
            </div>
          `;
        }
        form.reset();
        showToast("Demande Exchange créée.");
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        restoreButton();
      }
    });
  }
}

function renderMerchants(user) {
  const merchantList = document.querySelector("[data-merchants-list]");
  const merchantResults = document.querySelector("[data-merchant-results]");
  const merchantSearch = document.querySelector("[data-merchant-search]");
  const applicationStatus = document.querySelector("[data-merchant-application-status]");
  const merchantWalletAvailable = document.querySelector("[data-merchant-wallet-available]");
  const merchantWalletPending = document.querySelector("[data-merchant-wallet-pending]");
  const merchantWalletBonus = document.querySelector("[data-merchant-wallet-bonus]");
  const merchantMainBalance = document.querySelector("[data-merchant-main-balance]");
  const requestList = document.querySelector("[data-merchant-request-list]");
  const exchangeAdsList = document.querySelector("[data-merchant-exchange-ads]");
  const exchangeOrdersList = document.querySelector("[data-merchant-exchange-orders]");

  if (applicationStatus) applicationStatus.textContent = user.merchantApplicationStatus || "Aucun profil";

  const wallet = user.merchantWallet;
  if (merchantWalletAvailable) merchantWalletAvailable.textContent = formatUsdt(wallet.available);
  if (merchantWalletPending) merchantWalletPending.textContent = formatUsdt(wallet.pending);
  if (merchantWalletBonus) merchantWalletBonus.textContent = formatUsdt(wallet.bonus);
  if (merchantMainBalance) merchantMainBalance.textContent = formatUsdt(wallet.mainBalance);

  renderMerchantCards(merchantList, user.merchants);
  renderMerchantCards(merchantResults, user.merchants);

  if (merchantSearch && merchantResults) {
    merchantSearch.addEventListener("input", async () => {
      const query = merchantSearch.value.trim();
      try {
        const data = await apiRequest(`/merchants?query=${encodeURIComponent(query)}`);
        renderMerchantCards(merchantResults, Array.isArray(data.merchants) ? data.merchants : []);
      } catch (error) {
        renderMerchantCards(merchantResults, []);
        showToast(error.message, "error");
      }
    });
  }

  if (requestList) {
    requestList.innerHTML = user.cicoRequests.length ? user.cicoRequests.map((item) => `
      <div>
        <span>${escapeHtml(item.reference)}<small>${escapeHtml(item.type)} ${escapeHtml(item.method)} - ${escapeHtml(item.customer)}</small></span>
        <strong>${formatUsdt(item.amount)}</strong>
      </div>
    `).join("") : `<p class="muted">Aucune reference CICO recue.</p>`;
  }

  if (exchangeAdsList) {
    exchangeAdsList.innerHTML = user.exchangeAds.length ? user.exchangeAds.map((ad) => `
      <div>
        <span>${exchangeTypeLabel(ad.type)}<small>${escapeHtml(ad.city)}, ${escapeHtml(ad.country)} - ${normalizePaymentMethods(ad.methods).join(", ")} - ${escapeHtml(ad.status)}</small></span>
        <strong>${Math.round(Number(ad.rate || 0)).toLocaleString("fr-FR")} FCFA</strong>
      </div>
    `).join("") : `<p class="muted">Aucune annonce Exchange publiée.</p>`;
  }

  if (exchangeOrdersList) {
    exchangeOrdersList.innerHTML = user.exchangeOrders.length ? user.exchangeOrders.map((order) => `
      <div>
        <span>${escapeHtml(order.reference)}<small>${exchangeTypeLabel(order.type)} - ${escapeHtml(order.customerEmail)} - ${escapeHtml(order.status)}</small></span>
        <strong>${formatUsdt(order.amount)}</strong>
      </div>
    `).join("") : `<p class="muted">Aucune demande Exchange reçue.</p>`;
  }
}

function renderP2pRecipientPreview(recipient) {
  const preview = document.querySelector("[data-p2p-recipient-preview]");
  if (!preview) return;
  if (!recipient) {
    preview.hidden = true;
    preview.innerHTML = "";
    return;
  }
  preview.hidden = false;
  preview.innerHTML = `
    <div>
      <span>Destinataire verifie</span>
      <strong>${escapeHtml(recipient.displayName || "Utilisateur AFRIX")}</strong>
      <small>${escapeHtml(recipient.email || "")}</small>
    </div>
  `;
}

function updateP2pFeePreview() {
  const amount = Number(document.querySelector("[data-p2p-amount]")?.value || 0);
  const asset = document.querySelector("[data-p2p-asset]")?.value || "USDT";
  const label = document.querySelector("[data-p2p-amount-label]");
  const preview = document.querySelector("[data-p2p-fee-preview]");
  if (label?.firstChild) label.firstChild.textContent = `Montant minimum 1 ${asset}`;
  if (!preview) return;
  const fee = Number((Math.max(0, amount) * P2P_FEE_RATE).toFixed(2));
  preview.textContent = `Frais 1%: ${formatAssetAmount(fee, asset)}. Total debite: ${formatAssetAmount(amount + fee, asset)}.`;
}

function renderAdmin(user) {
  if (!canUseBackoffice(user)) return;
  const adminTransactions = Array.isArray(user.adminTransactions) ? user.adminTransactions : [];
  const userQuery = String(document.querySelector("[data-admin-user-search]")?.value || "").trim().toLowerCase();
  const txQuery = String(document.querySelector("[data-admin-tx-search]")?.value || "").trim().toLowerCase();
  const filteredAdminTransactions = adminTransactions.filter((item) => {
    const emailMatch = !userQuery || String(item.userEmail || "").toLowerCase().includes(userQuery);
    const txText = `${item.reference || ""} ${item.id || ""} ${item.metadata?.txRef || ""} ${item.description || ""}`.toLowerCase();
    const txMatch = !txQuery || txText.includes(txQuery);
    return emailMatch && txMatch;
  });
  const pendingDeposits = filteredAdminTransactions.filter((item) => item.type === "Depot" && item.status === "Pending");
  const pendingWithdrawals = filteredAdminTransactions.filter((item) => item.type === "Retrait" && item.status === "Pending");
  const platformControls = user.platformControls || {};

  const adminTeam = document.querySelector("[data-admin-team]");
  const pendingDepositsCounts = document.querySelectorAll("[data-pending-deposits-count]");
  const pendingWithdrawalsCounts = document.querySelectorAll("[data-pending-withdrawals-count]");
  const cicoRequestsCount = document.querySelector("[data-cico-requests-count]");
  const merchantApplicationsCount = document.querySelector("[data-merchant-applications-count]");
  const disputesCount = document.querySelector("[data-disputes-count]");
  const adminUsersCounts = document.querySelectorAll("[data-admin-users-count]");

  if (adminTeam) adminTeam.textContent = Number(user.team || 0);
  pendingDepositsCounts.forEach((item) => { item.textContent = pendingDeposits.length; });
  pendingWithdrawalsCounts.forEach((item) => { item.textContent = pendingWithdrawals.length; });
  if (cicoRequestsCount) cicoRequestsCount.textContent = user.cicoRequests.length;
  if (merchantApplicationsCount) merchantApplicationsCount.textContent = user.merchantApplications.length;
  if (disputesCount) disputesCount.textContent = user.disputes.length;
  adminUsersCounts.forEach((item) => { item.textContent = Array.isArray(user.adminUsers) ? user.adminUsers.length : 0; });
  const adminStats = user.adminStats || {};
  document.querySelectorAll("[data-admin-stat]").forEach((item) => {
    item.textContent = Number(adminStats[item.dataset.adminStat] || 0).toLocaleString("fr-FR");
  });
  document.querySelectorAll("[data-admin-stat-usdt]").forEach((item) => {
    item.textContent = formatUsdt(adminStats[item.dataset.adminStatUsdt] || 0);
  });

  renderQueue("[data-admin-pending-deposits]", pendingDeposits, { proof: true });
  renderQueue("[data-admin-pending-withdrawals]", pendingWithdrawals);
  renderCicoAdminRequests(user.cicoRequests);
  renderExchangeAdminOrders((user.adminExchangeOrders || []).filter((item) => {
    const emailMatch = !userQuery || String(item.customerEmail || "").toLowerCase().includes(userQuery);
    const txText = `${item.reference || ""} ${item.paymentMethod || ""} ${item.status || ""}`.toLowerCase();
    return emailMatch && (!txQuery || txText.includes(txQuery));
  }));
  renderMerchantApplications(user.merchantApplications);
  renderDisputes(user.disputes);
  const filteredAdminUsers = (user.adminUsers || []).filter((item) => {
    if (!userQuery) return true;
    return String(item.email || "").toLowerCase().includes(userQuery) || String(item.fullName || "").toLowerCase().includes(userQuery);
  }).sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  renderAdminUsers(filteredAdminUsers);
  renderAdminUserActivity(user.adminUsers || [], userQuery);
  bindAdminSections();
  bindAdminUsersPanel();
  initDetailedAdmin();

  document.querySelectorAll("[data-admin-control]").forEach((control) => {
    control.checked = Boolean(platformControls[control.dataset.adminControl]);
  });

  document.querySelectorAll("[data-admin-filter]").forEach((field) => {
    if (field.dataset.boundAdminFilter) return;
    field.dataset.boundAdminFilter = "true";
    field.addEventListener("input", () => renderAdmin(user));
  });
}

function bindAdminSections() {
  const triggers = document.querySelectorAll("[data-admin-section-trigger]");
  const panels = document.querySelectorAll("[data-admin-section]");
  if (!triggers.length || !panels.length) return;

  const showSection = (section) => {
    triggers.forEach((trigger) => trigger.classList.toggle("is-active", trigger.dataset.adminSectionTrigger === section));
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.adminSection !== section;
    });
    if (section === "accounts") {
      const usersSection = document.querySelector("[data-admin-users-section]");
      if (usersSection) usersSection.hidden = false;
    }
  };

  if (!document.body.dataset.adminSectionReady) {
    document.body.dataset.adminSectionReady = "true";
    triggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const section = trigger.dataset.adminSectionTrigger || "overview";
        showSection(section);
      });
    });
  }

  const active = document.querySelector("[data-admin-section-trigger].is-active")?.dataset.adminSectionTrigger || "overview";
  showSection(active);
}

function bindAdminUsersPanel() {
  const section = document.querySelector("[data-admin-users-section]");
  const toggle = document.querySelector("[data-admin-users-toggle]");
  const close = document.querySelector("[data-admin-users-close]");
  if (!section || !toggle) return;

  const setOpen = (open) => {
    section.hidden = !open;
    toggle.textContent = open ? "Fermer comptes" : "Comptes";
    if (open) {
      document.querySelector("[data-admin-section-trigger='accounts']")?.click();
    }
    if (open) section.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (!toggle.dataset.boundAdminUsersToggle) {
    toggle.dataset.boundAdminUsersToggle = "true";
    toggle.addEventListener("click", () => {
      const activeSection = document.querySelector("[data-admin-section-trigger].is-active")?.dataset.adminSectionTrigger || "";
      setOpen(section.hidden || activeSection !== "accounts");
    });
  }

  if (close && !close.dataset.boundAdminUsersClose) {
    close.dataset.boundAdminUsersClose = "true";
    close.addEventListener("click", () => setOpen(false));
  }
}

function renderAdminUserActivity(users, query) {
  const target = document.querySelector("[data-admin-user-activity]");
  if (!target) return;
  const search = String(query || "").trim().toLowerCase();
  if (!search) {
    target.innerHTML = `<p class="muted">Saisissez un email ou un nom pour afficher l'activite du compte.</p>`;
    return;
  }

  const item = users.find((candidate) => String(candidate.email || "").toLowerCase() === search) ||
    users.find((candidate) => String(candidate.email || "").toLowerCase().includes(search) || String(candidate.fullName || "").toLowerCase().includes(search));

  if (!item) {
    target.innerHTML = `<p class="muted">Aucun compte trouve pour cette recherche.</p>`;
    return;
  }

  target.innerHTML = `
    <div class="admin-activity-card">
      <span><strong>${escapeHtml(item.fullName || item.email)}</strong><small>${escapeHtml(item.email)}</small></span>
      <div><span>Solde</span><strong>${formatUsdt(item.balance)}</strong></div>
      <div><span>Activite</span><strong>${formatUsdt(item.activity)}</strong></div>
      <div><span>Plans actifs</span><strong>${Number(item.activePlansCount || 0)}</strong></div>
      <div><span>Niveaux bonus</span><strong>${Number(item.bonusLevelsOverride || 0)}</strong></div>
      <div><span>Parrain</span><strong>${escapeHtml(item.referrerEmail || "-")}</strong></div>
      <div><span>Statut</span><strong>${escapeHtml(item.status || "active")}</strong></div>
    </div>
  `;
}

function renderAdminUsers(users) {
  const list = document.querySelector("[data-admin-users]");
  if (!list) return;

  list.innerHTML = users.length ? users.map((item) => {
    const isBlocked = item.status === "blocked";
    const nextRole = item.role === "admin" ? "user" : "admin";
    return `
      <div class="queue-row user-row">
        <span>${escapeHtml(item.fullName || item.email)}<small>${escapeHtml(item.email)} - ${escapeHtml(item.role)} - ${escapeHtml(item.status)} - ${formatUsdt(item.balance)} - Plans actifs: ${Number(item.activePlansCount || 0)} - Bonus: ${Number(item.bonusLevelsOverride || 0)} niveaux${item.referrerEmail ? ` - Parrain: ${escapeHtml(item.referrerEmail)}` : ""}</small></span>
        <strong>${escapeHtml(item.merchantStatus || "Aucun profil")}</strong>
        <button class="btn secondary" type="button" data-admin-user-role="${escapeHtml(item.id)}" data-role="${nextRole}">${nextRole === "admin" ? "Admin" : "User"}</button>
        ${isBlocked
          ? `<button class="btn primary" type="button" data-admin-user-reactivate="${escapeHtml(item.id)}">Reactiver</button>`
          : `<button class="btn secondary" type="button" data-admin-user-suspend="${escapeHtml(item.id)}">Suspendre</button>`}
      </div>
    `;
  }).join("") : `<p class="muted">Aucun utilisateur.</p>`;
}

function renderQueue(selector, rows, options = {}) {
  const list = document.querySelector(selector);
  if (!list) return;

  list.innerHTML = rows.length ? rows.map((item) => {
    const details = [
      item.userEmail || "",
      item.date || "",
      `Ref. ${item.reference || item.id || ""}`,
      item.metadata?.method ? `Methode ${item.metadata.method.toUpperCase()}` : "",
      item.metadata?.asset === "GRSC_PURCHASE" ? "Achat GRSCOIN" : "",
      item.metadata?.grsAmount ? `GRS ${formatGrsc(item.metadata.grsAmount)}` : "",
      item.metadata?.priceUsdt ? `Prix ${formatUsdt(item.metadata.priceUsdt)}` : "",
      item.metadata?.txRef ? `TX ${item.metadata.txRef}` : "",
      item.metadata?.address ? `Adresse ${item.metadata.address}` : "",
      item.metadata?.phone ? `Tel ${item.metadata.phone}` : "",
      item.metadata?.beneficiary ? `Nom ${item.metadata.beneficiary}` : "",
      item.metadata?.fee || item.metadata?.feeGrsAmount ? `Frais ${formatTransactionFee(item.metadata)}` : "",
      item.metadata?.netAmount ? `Net ${formatTransactionNet(item.metadata)}` : ""
    ].filter(Boolean).join(" - ");

    return `
    <div class="queue-row">
      <span>${escapeHtml(item.description)}<small>${escapeHtml(details)}</small></span>
      <strong>${escapeHtml(item.amount)}</strong>
      ${options.proof && item.hasProof ? `<button class="btn secondary" type="button" data-admin-proof="${escapeHtml(item.id || item.reference || "")}">Capture</button>` : ""}
      ${item.metadata?.address ? `<button class="btn secondary" type="button" data-copy-admin-address="${escapeHtml(item.metadata.address)}">Copier adresse</button>` : ""}
      <button class="btn primary" type="button" data-admin-action="approve" data-admin-id="${escapeHtml(item.id || item.reference || "")}" data-admin-approve="${escapeHtml(item.id || item.reference || "")}">Valider</button>
      <button class="btn secondary" type="button" data-admin-action="reject" data-admin-id="${escapeHtml(item.id || item.reference || "")}" data-admin-reject="${escapeHtml(item.id || item.reference || "")}">Rejeter</button>
    </div>
  `;
  }).join("") : `<p class="muted">Aucune demande en attente.</p>`;
}

function renderCicoAdminRequests(rows) {
  const list = document.querySelector("[data-admin-cico-requests]");
  if (!list) return;

  list.innerHTML = rows.length ? rows.map((item) => `
    <div>
      <span>${escapeHtml(item.reference)}<small>${escapeHtml(item.type)} ${escapeHtml(item.method)} - ${escapeHtml(item.country)} - ${escapeHtml(item.status)}</small></span>
      <strong>${formatUsdt(item.amount)}</strong>
    </div>
  `).join("") : `<p class="muted">Aucune operation CICO merchant.</p>`;
}

function renderExchangeAdminOrders(rows) {
  const list = document.querySelector("[data-admin-exchange-orders]");
  if (!list) return;

  list.innerHTML = rows.length ? rows.map((item) => `
    <div class="queue-row">
      <span>${escapeHtml(item.reference)}<small>${exchangeTypeLabel(item.type)} - ${escapeHtml(item.customerEmail)} - ${escapeHtml(item.paymentMethod)} - ${escapeHtml(item.status)} - ${formatXaf(item.localAmount)} au taux ${Math.round(Number(item.rate || 0)).toLocaleString("fr-FR")}</small></span>
      <strong>${formatUsdt(item.amount)}</strong>
      ${item.status === "pending" ? `<button class="btn primary" type="button" data-admin-exchange-confirm="${escapeHtml(item.reference)}">Valider</button>` : ""}
    </div>
  `).join("") : `<p class="muted">Aucune demande Exchange.</p>`;
}

function renderMerchantApplications(applications) {
  const list = document.querySelector("[data-admin-merchant-applications]");
  if (!list) return;

  list.innerHTML = applications.length ? applications.map((item) => {
    const isApproved = item.status === "approved";
    return `
    <div class="queue-row">
      <span>${escapeHtml(item.businessName)}<small>${escapeHtml(item.userEmail)} - ${escapeHtml(item.city)}, ${escapeHtml(item.country)} - ${escapeHtml(item.status)}</small></span>
      <strong>${formatUsdt(item.guarantee)}</strong>
      ${isApproved ? `
        <input class="admin-inline-input" type="number" min="1" step="0.01" value="${Number(item.guarantee || 1000)}" data-merchant-fund-amount>
        <button class="btn primary" type="button" data-merchant-fund="${escapeHtml(item.id || item.userId || "")}">Approvisionner</button>
      ` : `
        <button class="btn primary" type="button" data-merchant-approve="${escapeHtml(item.id || item.reference || "")}">Approuver</button>
        <button class="btn secondary" type="button" data-merchant-reject="${escapeHtml(item.id || item.reference || "")}">Rejeter</button>
      `}
    </div>
  `;
  }).join("") : `<p class="muted">Aucune demande merchant en attente.</p>`;
}

function renderDisputes(disputes) {
  const list = document.querySelector("[data-admin-disputes]");
  if (!list) return;

  list.innerHTML = disputes.length ? disputes.map((item) => `
    <div class="queue-row">
      <span>${escapeHtml(item.reason)}<small>${escapeHtml(item.userEmail)} - ${escapeHtml(item.reference)}</small></span>
      <strong>${escapeHtml(item.type)}</strong>
      <button class="btn primary" type="button" data-dispute-close="${escapeHtml(item.id || item.reference || "")}">Cloturer</button>
    </div>
  `).join("") : `<p class="muted">Aucun litige ouvert.</p>`;
}

const adminDetailedState = {
  initialized: false,
  section: "overview",
  pages: {
    users: 1,
    transactions: 1,
    deposits: 1,
    withdrawals: 1,
    trading: 1,
    staking: 1,
    founders: 1,
    swap: 1,
    money: 1
  }
};

function nestedValue(source, path) {
  return String(path || "").split(".").reduce((value, key) => value?.[key], source);
}

function adminStatusLabel(status = "") {
  const labels = {
    Pending: "En attente",
    Completed: "Validé",
    Rejected: "Rejeté",
    Active: "Actif",
    active: "Actif",
    blocked: "Suspendu",
    pending: "En attente",
    completed: "Validé",
    rejected: "Rejeté"
  };
  return labels[status] || status || "-";
}

function renderAdminPagination(kind, pagination = {}) {
  if (!pagination.total || pagination.totalPages <= 1) return "";
  return `
    <div class="admin-pagination">
      <button class="btn secondary" type="button" data-admin-page="${escapeHtml(kind)}" data-page="${Math.max(1, Number(pagination.page || 1) - 1)}" ${pagination.hasPrev ? "" : "disabled"}>Précédent</button>
      <span>Page ${Number(pagination.page || 1).toLocaleString("fr-FR")} / ${Number(pagination.totalPages || 1).toLocaleString("fr-FR")} - ${Number(pagination.total || 0).toLocaleString("fr-FR")} éléments</span>
      <button class="btn secondary" type="button" data-admin-page="${escapeHtml(kind)}" data-page="${Number(pagination.page || 1) + 1}" ${pagination.hasNext ? "" : "disabled"}>Suivant</button>
    </div>
  `;
}

function renderAdminDetailedTransactions(rows = [], kind = "") {
  if (!rows.length) return `<p class="muted">Aucune donnée à afficher.</p>`;
  return rows.map((item) => {
    const meta = item.metadata || {};
    const details = [
      item.userEmail || "",
      item.date || "",
      `Ref. ${item.reference || item.id || ""}`,
      item.program ? `Programme ${item.program}` : "",
      meta.method ? `Methode ${String(meta.method).toUpperCase()}` : "",
      meta.asset ? `Actif ${meta.asset}` : "",
      meta.grsAmount ? `GRSC ${formatGrsc(meta.grsAmount)}` : "",
      meta.priceUsdt ? `Prix ${formatTokenPrice(meta.priceUsdt)}` : "",
      meta.txRef ? `TX ${meta.txRef}` : "",
      meta.address ? `Adresse ${meta.address}` : "",
      meta.phone ? `Tel ${meta.phone}` : "",
      meta.beneficiary ? `Nom ${meta.beneficiary}` : "",
      meta.fee || meta.feeGrsAmount ? `Frais ${formatTransactionFee(meta)}` : "",
      meta.netAmount ? `Net ${formatTransactionNet(meta)}` : ""
    ].filter(Boolean).join(" - ");
    const canReview = item.status === "Pending" && (item.type === "Depot" || item.type === "Retrait");
    return `
      <div class="queue-row admin-detail-row">
        <span>
          ${escapeHtml(item.description || item.type || "Transaction")}
          <small>${escapeHtml(details)}</small>
        </span>
        <strong>${escapeHtml(item.amount || formatUsdt(item.rawAmount))}<small>${escapeHtml(adminStatusLabel(item.status))}</small></strong>
        ${item.hasProof ? `<button class="btn secondary" type="button" data-admin-proof="${escapeHtml(item.id || item.reference || "")}">Capture</button>` : ""}
        ${meta.address ? `<button class="btn secondary" type="button" data-copy-admin-address="${escapeHtml(meta.address)}">Copier adresse</button>` : ""}
        ${canReview ? `
          <button class="btn primary" type="button" data-admin-action="approve" data-admin-id="${escapeHtml(item.id || item.reference || "")}">Valider</button>
          <button class="btn secondary" type="button" data-admin-action="reject" data-admin-id="${escapeHtml(item.id || item.reference || "")}">Rejeter</button>
        ` : ""}
      </div>
    `;
  }).join("") + renderAdminPagination(kind, rows.pagination);
}

function renderAdminTransactionSummary(summary = {}, selector = "[data-admin-transactions-summary]") {
  const target = document.querySelector(selector);
  if (!target) return;
  target.innerHTML = `
    <div class="admin-stat-grid compact">
      <div><span>Total</span><strong>${Number(summary.total || 0).toLocaleString("fr-FR")}</strong></div>
      <div><span>En attente</span><strong>${Number(summary.pending || 0).toLocaleString("fr-FR")}</strong></div>
      <div><span>Validés</span><strong>${Number(summary.completed || 0).toLocaleString("fr-FR")}</strong></div>
      <div><span>Rejetés</span><strong>${Number(summary.rejected || 0).toLocaleString("fr-FR")}</strong></div>
      <div><span>Actifs</span><strong>${Number(summary.active || 0).toLocaleString("fr-FR")}</strong></div>
    </div>
  `;
}

function appendAdminListFilters(params, kind) {
  const values = {
    search: document.querySelector(`[data-admin-list-search='${kind}']`)?.value.trim(),
    status: document.querySelector(`[data-admin-list-status='${kind}']`)?.value || "",
    dateFrom: document.querySelector(`[data-admin-list-date-from='${kind}']`)?.value || "",
    dateTo: document.querySelector(`[data-admin-list-date-to='${kind}']`)?.value || "",
    method: document.querySelector(`[data-admin-list-method='${kind}']`)?.value.trim(),
    network: document.querySelector(`[data-admin-list-network='${kind}']`)?.value.trim(),
    reference: document.querySelector(`[data-admin-list-reference='${kind}']`)?.value.trim(),
    minAmount: document.querySelector(`[data-admin-list-min='${kind}']`)?.value || "",
    maxAmount: document.querySelector(`[data-admin-list-max='${kind}']`)?.value || ""
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
}

function appendAdminTransactionFilters(params) {
  const values = {
    search: document.querySelector("[data-admin-transactions-search]")?.value.trim(),
    type: document.querySelector("[data-admin-transactions-type]")?.value || "",
    status: document.querySelector("[data-admin-transactions-status]")?.value || "",
    dateFrom: document.querySelector("[data-admin-transactions-date-from]")?.value || "",
    dateTo: document.querySelector("[data-admin-transactions-date-to]")?.value || "",
    method: document.querySelector("[data-admin-transactions-method]")?.value.trim(),
    network: document.querySelector("[data-admin-transactions-network]")?.value.trim(),
    reference: document.querySelector("[data-admin-transactions-reference]")?.value.trim(),
    minAmount: document.querySelector("[data-admin-transactions-min]")?.value || "",
    maxAmount: document.querySelector("[data-admin-transactions-max]")?.value || ""
  };
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
}

async function loadAdminDetailedSummary() {
  const summary = await apiRequest("/admin/summary", { timeoutMs: 20_000 });
  document.querySelectorAll("[data-admin-summary]").forEach((item) => {
    item.textContent = Number(nestedValue(summary, item.dataset.adminSummary) || 0).toLocaleString("fr-FR");
  });
  document.querySelectorAll("[data-admin-summary-usdt]").forEach((item) => {
    item.textContent = formatUsdt(nestedValue(summary, item.dataset.adminSummaryUsdt) || 0);
  });
  document.querySelectorAll("[data-admin-summary-grsc]").forEach((item) => {
    item.textContent = formatGrsc(nestedValue(summary, item.dataset.adminSummaryGrsc) || 0);
  });
  document.querySelectorAll("[data-pending-deposits-count]").forEach((item) => { item.textContent = summary.deposits?.pending || 0; });
  document.querySelectorAll("[data-pending-withdrawals-count]").forEach((item) => { item.textContent = summary.withdrawals?.pending || 0; });
}

async function loadAdminDetailedUsers(page = adminDetailedState.pages.users) {
  adminDetailedState.pages.users = page;
  const target = document.querySelector("[data-admin-list='users']");
  if (!target) return;
  target.innerHTML = `<p class="muted">Chargement des comptes...</p>`;
  const params = new URLSearchParams({
    page: String(page),
    limit: "20"
  });
  const search = document.querySelector("[data-admin-users-search-detailed]")?.value.trim();
  const role = document.querySelector("[data-admin-users-role]")?.value;
  const status = document.querySelector("[data-admin-users-status]")?.value;
  if (search) params.set("search", search);
  if (role) params.set("role", role);
  if (status) params.set("status", status);
  const data = await apiRequest(`/admin/users?${params.toString()}`, { timeoutMs: 20_000 });
  target.innerHTML = data.items.length ? data.items.map((user) => `
    <div class="queue-row admin-detail-row">
      <span>
        ${escapeHtml(user.fullName || user.email)}
        <small>${escapeHtml(user.email)} - ${escapeHtml(user.country || "-")} - ${escapeHtml(user.role)} - ${escapeHtml(adminStatusLabel(user.status))}</small>
        <small>Parrain: ${escapeHtml(user.referrerEmail || user.referrerCode || "-")} - Code: ${escapeHtml(user.refCode || "-")} - Transactions: ${Number(user.transactionsCount || 0).toLocaleString("fr-FR")}</small>
      </span>
      <strong>${formatUsdt(user.balance)}<small>${formatGrsc(user.grsBalance)} - Trading ${formatUsdt(user.activeInvestmentAmount)} - Staking ${formatGrsc(user.activeStakeAmount)}</small></strong>
      <button class="btn primary" type="button" data-admin-open-activity="${escapeHtml(user.email)}">Tracer</button>
      <button class="btn secondary" type="button" data-admin-user-role="${escapeHtml(user.id)}" data-role="${user.role === "admin" ? "user" : "admin"}">${user.role === "admin" ? "User" : "Admin"}</button>
      ${user.status === "blocked"
        ? `<button class="btn primary" type="button" data-admin-user-reactivate="${escapeHtml(user.id)}">Reactiver</button>`
        : `<button class="btn secondary" type="button" data-admin-user-suspend="${escapeHtml(user.id)}">Suspendre</button>`}
    </div>
  `).join("") + renderAdminPagination("users", data.pagination) : `<p class="muted">Aucun utilisateur trouvé.</p>`;
}

async function loadAdminDetailedTransactions(kind, page = adminDetailedState.pages[kind] || 1) {
  adminDetailedState.pages[kind] = page;
  const target = document.querySelector(`[data-admin-list='${kind}']`);
  if (!target) return;
  target.innerHTML = `<p class="muted">Chargement...</p>`;
  const params = new URLSearchParams({ page: String(page), limit: "20" });
  appendAdminListFilters(params, kind);
  const data = await apiRequest(`/admin/${kind}?${params.toString()}`, { timeoutMs: 20_000 });
  const rows = data.items || [];
  rows.pagination = data.pagination;
  renderAdminTransactionSummary(data.summary || {}, `[data-admin-list-summary='${kind}']`);
  target.innerHTML = renderAdminDetailedTransactions(rows, kind);
}

async function loadAdminRecentTransactions(page = adminDetailedState.pages.transactions || 1) {
  adminDetailedState.pages.transactions = page;
  const target = document.querySelector("[data-admin-list='transactions']");
  if (!target) return;
  target.innerHTML = `<p class="muted">Chargement des transactions récentes...</p>`;
  const params = new URLSearchParams({ page: String(page), limit: "25" });
  appendAdminTransactionFilters(params);
  const data = await apiRequest(`/admin/transactions?${params.toString()}`, { timeoutMs: 20_000 });
  const rows = data.items || [];
  rows.pagination = data.pagination;
  renderAdminTransactionSummary(data.summary || {});
  target.innerHTML = renderAdminDetailedTransactions(rows, "transactions");
}

async function exportAdminSection(section) {
  const params = new URLSearchParams();
  if (section === "transactions") appendAdminTransactionFilters(params);
  if (section === "deposits" || section === "withdrawals") appendAdminListFilters(params, section);
  const csv = await apiRequest(`/admin/export/${section}?${params.toString()}`, { timeoutMs: 30_000 });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `afrix-admin-${section}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Export CSV telecharge.");
}

function renderProgramSummary(program, payload = {}) {
  const target = document.querySelector(`[data-admin-program-summary='${program}']`);
  if (!target) return;
  const stats = payload.stats || {};
  if (program === "trading") {
    target.innerHTML = `
      <div class="admin-stat-grid compact">
        <div><span>Plans actifs</span><strong>${Number(stats.activeCount || 0).toLocaleString("fr-FR")}</strong></div>
        <div><span>Total activations</span><strong>${Number(stats.totalCount || 0).toLocaleString("fr-FR")}</strong></div>
        <div><span>Capital actif</span><strong>${formatUsdt(stats.activeCapital)}</strong></div>
        <div><span>Gains distribués</span><strong>${formatUsdt(stats.totalEarned)}</strong></div>
      </div>
    `;
  } else if (program === "staking") {
    target.innerHTML = `
      <div class="admin-stat-grid compact">
        <div><span>Stakings actifs</span><strong>${Number(stats.activeCount || 0).toLocaleString("fr-FR")}</strong></div>
        <div><span>Total participations</span><strong>${Number(stats.totalCount || 0).toLocaleString("fr-FR")}</strong></div>
        <div><span>GRSC verrouillés</span><strong>${formatGrsc(stats.activeLocked)}</strong></div>
        <div><span>Gains staking</span><strong>${formatGrsc(stats.totalEarned)}</strong></div>
      </div>
    `;
  } else if (program === "founders") {
    target.innerHTML = `
      <div class="admin-stat-grid compact">
        <div><span>Founders actifs</span><strong>${Number(stats.activeCount || 0).toLocaleString("fr-FR")}</strong></div>
        <div><span>Total participations</span><strong>${Number(stats.totalCount || 0).toLocaleString("fr-FR")}</strong></div>
        <div><span>GRSC immobilises</span><strong>${formatGrsc(stats.activeLocked)}</strong></div>
        <div><span>Recompenses ciblees</span><strong>${formatGrsc(stats.totalReward)}</strong></div>
      </div>
    `;
  } else if (program === "swap") {
    target.innerHTML = `
      <div class="admin-stat-grid compact">
        <div><span>Prix GRSC</span><strong>${formatTokenPrice(stats.priceUsdt)}</strong></div>
        <div><span>Supply totale</span><strong>${formatGrsc(stats.totalSupply)}</strong></div>
        <div><span>GRSC émis</span><strong>${formatGrsc(stats.issuedSupply)}</strong></div>
        <div><span>GRSC restant</span><strong>${formatGrsc(stats.remainingSupply)}</strong></div>
      </div>
    `;
  } else {
    target.innerHTML = `
      <div class="admin-stat-grid compact">
        <div><span>CICO</span><strong>${Number(payload.cicoRequests?.length || 0).toLocaleString("fr-FR")}</strong></div>
        <div><span>Exchange</span><strong>${Number(payload.exchangeOrders?.length || 0).toLocaleString("fr-FR")}</strong></div>
        <div><span>Transactions listées</span><strong>${Number(payload.items?.length || 0).toLocaleString("fr-FR")}</strong></div>
        <div><span>Total historique</span><strong>${Number(payload.pagination?.total || 0).toLocaleString("fr-FR")}</strong></div>
      </div>
    `;
  }
}

async function loadAdminProgram(program, page = adminDetailedState.pages[program] || 1) {
  adminDetailedState.pages[program] = page;
  const target = document.querySelector(`[data-admin-program-list='${program}']`);
  if (!target) return;
  target.innerHTML = `<p class="muted">Chargement du programme...</p>`;
  const payload = await apiRequest(`/admin/programs/${program}?page=${page}&limit=20`, { timeoutMs: 25_000 });
  renderProgramSummary(program, payload);
  if (program === "trading" || program === "staking" || program === "founders") {
    target.innerHTML = payload.items.length ? payload.items.map((item) => `
      <div class="queue-row admin-detail-row">
        <span>
          ${escapeHtml(item.name || item.planId || "Participation")}
          <small>${escapeHtml(item.userName || item.userEmail || "")} - ${escapeHtml(item.userEmail || "")} - ${escapeHtml(adminStatusLabel(item.status))}</small>
          <small>Début: ${escapeHtml(item.activatedAt || item.startedAt || item.createdAt || "-")} - Fin: ${escapeHtml(item.endsAt || "-")} - Durée: ${Number(item.durationDays || 0).toLocaleString("fr-FR")} jours</small>
        </span>
        <strong>${program === "trading" ? formatUsdt(item.amount) : formatGrsc(item.amount)}<small>${program === "founders" ? `Cible: ${formatGrsc(item.rewardAmount)}` : `Gagné: ${program === "trading" ? formatUsdt(item.earnedAmount) : formatGrsc(item.earnedAmount)}`}</small></strong>
        <button class="btn primary" type="button" data-admin-open-activity="${escapeHtml(item.userEmail || "")}">Tracer</button>
      </div>
    `).join("") + renderAdminPagination(program, payload.pagination) : `<p class="muted">Aucune participation.</p>`;
    return;
  }
  const rows = payload.items || [];
  rows.pagination = payload.pagination;
  const moneyExtra = program === "money" ? `
    <article class="admin-sublist">
      <h2>Demandes CICO récentes</h2>
      ${(payload.cicoRequests || []).slice(0, 20).map((item) => `<div><span>${escapeHtml(item.reference || item.id || "")}<small>${escapeHtml(item.userEmail || item.userId || "")} - ${escapeHtml(item.type || "")} - ${escapeHtml(item.status || "")}</small></span><strong>${formatUsdt(item.amount)}</strong></div>`).join("") || `<p class="muted">Aucune demande CICO.</p>`}
    </article>
    <article class="admin-sublist">
      <h2>Exchange récent</h2>
      ${(payload.exchangeOrders || []).slice(0, 20).map((item) => `<div><span>${escapeHtml(item.reference || item.id || "")}<small>${escapeHtml(item.customerEmail || item.userId || "")} - ${escapeHtml(item.type || "")} - ${escapeHtml(item.status || "")}</small></span><strong>${formatUsdt(item.amount)}</strong></div>`).join("") || `<p class="muted">Aucune demande Exchange.</p>`}
    </article>
  ` : "";
  target.innerHTML = renderAdminDetailedTransactions(rows, program) + moneyExtra;
}

async function lookupAdminActivity(emailOverride = "") {
  const email = String(emailOverride || document.querySelector("[data-admin-activity-email]")?.value || "").trim().toLowerCase();
  const target = document.querySelector("[data-admin-activity-result]");
  if (!target) return;
  if (!email) {
    showToast("Email utilisateur requis.", "error");
    return;
  }
  target.innerHTML = `<p class="muted">Chargement de l'activité...</p>`;
  const data = await apiRequest(`/admin/users/activity?email=${encodeURIComponent(email)}`, { timeoutMs: 25_000 });
  const user = data.user || {};
  const txRows = data.transactions || [];
  target.innerHTML = `
    <div class="admin-activity-card admin-activity-card-wide">
      <span><strong>${escapeHtml(user.fullName || user.email)}</strong><small>${escapeHtml(user.email || "")}</small></span>
      <div><span>Solde AUSD</span><strong>${formatAusd(user.ausdBalance)}</strong></div>
      <div><span>Solde USDT</span><strong>${formatUsdt(user.balance)}</strong></div>
      <div><span>Solde GRSC</span><strong>${formatGrsc(user.grsBalance)}</strong></div>
      <div><span>Réservé</span><strong>${formatUsdt(user.reservedBalance)}</strong></div>
      <div><span>Trading actif</span><strong>${formatUsdt(user.activeInvestmentAmount)}</strong></div>
      <div><span>Staking actif</span><strong>${formatGrsc(user.activeStakeAmount)}</strong></div>
      <div><span>Founders actif</span><strong>${formatGrsc(user.activeFounderAmount)}</strong></div>
      <div><span>Parrain</span><strong>${escapeHtml(user.referrerEmail || user.referrerCode || "-")}</strong></div>
      <div><span>Statut</span><strong>${escapeHtml(adminStatusLabel(user.status))}</strong></div>
    </div>
    <article class="admin-sublist admin-timeline"><h2>Timeline unifiée</h2>${(data.timeline || []).map((item) => `<div><span>${escapeHtml(item.title || item.kind || "Activité")}<small>${escapeHtml(item.date || "-")} - ${escapeHtml(item.program || item.kind || "-")} - ${escapeHtml(item.reference || "-")}</small></span><strong>${escapeHtml(item.amount || "-")}<small>${escapeHtml(adminStatusLabel(item.status))}</small></strong></div>`).join("") || `<p class="muted">Aucune activité.</p>`}</article>
    <article class="admin-sublist"><h2>AFRIX Trading Program</h2>${(data.activePlans || []).map((plan) => `<div><span>${escapeHtml(plan.name || plan.planId || "Plan")}<small>${escapeHtml(plan.status || "")} - ${escapeHtml(plan.startedAt || "-")} - Jours ${Number(plan.daysPaid || 0)}/${Number(plan.durationDays || 0)}</small></span><strong>${formatUsdt(plan.amount)}<small>${formatUsdt(plan.earnedAmount)} gagnés</small></strong></div>`).join("") || `<p class="muted">Aucun plan.</p>`}</article>
    <article class="admin-sublist"><h2>AFRIX Staking Program</h2>${(data.activeStakes || []).map((stake) => `<div><span>${escapeHtml(stake.name || stake.planId || "Stake")}<small>${escapeHtml(stake.status || "")} - ${escapeHtml(stake.startedAt || "-")} - Jours ${Number(stake.daysPaid || 0)}/${Number(stake.durationDays || 0)}</small></span><strong>${formatGrsc(stake.amount)}<small>${formatGrsc(stake.earnedAmount)} gagnés</small></strong></div>`).join("") || `<p class="muted">Aucun staking.</p>`}</article>
    <article class="admin-sublist"><h2>GRS Core Founders Club</h2>${(data.activeFounders || []).map((item) => `<div><span>${escapeHtml(item.name || item.planId || "Founders")}<small>${escapeHtml(item.status || "")} - ${escapeHtml(item.activatedAt || "-")} - Fin ${escapeHtml(item.endsAt || "-")}</small></span><strong>${formatGrsc(item.amount)}<small>${formatGrsc(item.rewardAmount)} cible</small></strong></div>`).join("") || `<p class="muted">Aucune participation Founders.</p>`}</article>
    <article class="admin-sublist"><h2>Transactions traçables</h2>${renderAdminDetailedTransactions(txRows)}</article>
    <article class="admin-sublist"><h2>AFRIX Money / CICO</h2>${(data.cicoRequests || []).map((item) => `<div><span>${escapeHtml(item.reference || item.id || "")}<small>${escapeHtml(item.type || "")} - ${escapeHtml(item.method || "")} - ${escapeHtml(item.status || "")}</small></span><strong>${formatUsdt(item.amount)}</strong></div>`).join("") || `<p class="muted">Aucune opération CICO.</p>`}</article>
    <article class="admin-sublist"><h2>Exchange</h2>${(data.exchangeOrders || []).map((item) => `<div><span>${escapeHtml(item.reference || item.id || "")}<small>${escapeHtml(item.type || "")} - ${escapeHtml(item.paymentMethod || "")} - ${escapeHtml(item.status || "")}</small></span><strong>${formatUsdt(item.amount)}</strong></div>`).join("") || `<p class="muted">Aucune opération Exchange.</p>`}</article>
    <article class="admin-sublist"><h2>Partenaires directs</h2>${(data.directPartners || []).map((item) => `<div><span>${escapeHtml(item.fullName || item.email)}<small>${escapeHtml(item.email || "")} - ${escapeHtml(adminStatusLabel(item.status))}</small></span><strong>${formatUsdt(item.activity)}</strong></div>`).join("") || `<p class="muted">Aucun partenaire direct.</p>`}</article>
  `;
}

async function loadActiveDetailedAdminSection(section = adminDetailedState.section) {
  try {
    await loadAdminDetailedSummary();
    if (section === "accounts") await loadAdminDetailedUsers();
    if (section === "transactions") await loadAdminRecentTransactions();
    if (section === "deposits") await loadAdminDetailedTransactions("deposits");
    if (section === "withdrawals") await loadAdminDetailedTransactions("withdrawals");
    if (["trading", "staking", "founders", "swap", "money"].includes(section)) await loadAdminProgram(section);
  } catch (error) {
    showToast(error.message, "error");
  }
}

function initDetailedAdmin() {
  if (adminDetailedState.initialized || document.body.dataset.page !== "admin") return;
  adminDetailedState.initialized = true;

  document.querySelectorAll("[data-admin-section-trigger]").forEach((button) => {
    button.addEventListener("click", () => {
      adminDetailedState.section = button.dataset.adminSectionTrigger || "overview";
      loadActiveDetailedAdminSection(adminDetailedState.section);
    });
  });
  document.querySelectorAll("[data-admin-refresh-list]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.adminRefreshList;
      adminDetailedState.pages[kind] = 1;
      if (kind === "users") loadAdminDetailedUsers(1).catch((error) => showToast(error.message, "error"));
      if (kind === "transactions") loadAdminRecentTransactions(1).catch((error) => showToast(error.message, "error"));
      if (kind === "deposits" || kind === "withdrawals") loadAdminDetailedTransactions(kind, 1).catch((error) => showToast(error.message, "error"));
    });
  });
  document.querySelectorAll("[data-admin-list-status]").forEach((field) => {
    field.addEventListener("change", () => loadAdminDetailedTransactions(field.dataset.adminListStatus, 1).catch((error) => showToast(error.message, "error")));
  });
  document.querySelectorAll("[data-admin-list-search], [data-admin-list-date-from], [data-admin-list-date-to], [data-admin-list-method], [data-admin-list-network], [data-admin-list-reference], [data-admin-list-min], [data-admin-list-max]").forEach((field) => {
    const kind = field.dataset.adminListSearch || field.dataset.adminListDateFrom || field.dataset.adminListDateTo || field.dataset.adminListMethod || field.dataset.adminListNetwork || field.dataset.adminListReference || field.dataset.adminListMin || field.dataset.adminListMax;
    field.addEventListener(field.type === "date" ? "change" : "input", () => {
      window.clearTimeout(adminDetailedState[`${kind}FilterTimer`]);
      adminDetailedState[`${kind}FilterTimer`] = window.setTimeout(() => {
        loadAdminDetailedTransactions(kind, 1).catch((error) => showToast(error.message, "error"));
      }, 250);
    });
  });
  ["[data-admin-transactions-search]", "[data-admin-transactions-type]", "[data-admin-transactions-status]", "[data-admin-transactions-date-from]", "[data-admin-transactions-date-to]", "[data-admin-transactions-method]", "[data-admin-transactions-network]", "[data-admin-transactions-reference]", "[data-admin-transactions-min]", "[data-admin-transactions-max]"].forEach((selector) => {
    const field = document.querySelector(selector);
    if (!field) return;
    field.addEventListener(field.tagName === "INPUT" && field.type !== "date" ? "input" : "change", () => {
      window.clearTimeout(adminDetailedState.transactionsFilterTimer);
      adminDetailedState.transactionsFilterTimer = window.setTimeout(() => {
        loadAdminRecentTransactions(1).catch((error) => showToast(error.message, "error"));
      }, 250);
    });
  });
  document.querySelectorAll("[data-admin-export]").forEach((button) => {
    button.addEventListener("click", () => exportAdminSection(button.dataset.adminExport).catch((error) => showToast(error.message, "error")));
  });
  document.querySelector("[data-admin-activity-search]")?.addEventListener("click", () => lookupAdminActivity().catch((error) => showToast(error.message, "error")));
  document.querySelector("[data-admin-activity-email]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") lookupAdminActivity().catch((error) => showToast(error.message, "error"));
  });
  document.addEventListener("click", (event) => {
    const pager = event.target.closest("[data-admin-page]");
    if (pager) {
      const kind = pager.dataset.adminPage;
      const page = Number(pager.dataset.page || 1);
      if (kind === "users") loadAdminDetailedUsers(page).catch((error) => showToast(error.message, "error"));
      if (kind === "transactions") loadAdminRecentTransactions(page).catch((error) => showToast(error.message, "error"));
      if (kind === "deposits" || kind === "withdrawals") loadAdminDetailedTransactions(kind, page).catch((error) => showToast(error.message, "error"));
      if (["trading", "staking", "swap", "money"].includes(kind)) loadAdminProgram(kind, page).catch((error) => showToast(error.message, "error"));
    }
    const openActivity = event.target.closest("[data-admin-open-activity]");
    if (openActivity) {
      const email = openActivity.dataset.adminOpenActivity || "";
      const input = document.querySelector("[data-admin-activity-email]");
      if (input) input.value = email;
      document.querySelector("[data-admin-section-trigger='activity']")?.click();
      lookupAdminActivity(email).catch((error) => showToast(error.message, "error"));
    }
  });

  loadActiveDetailedAdminSection("overview").catch((error) => showToast(error.message, "error"));
}

function setupAuthForms() {
  const loginForm = document.querySelector("[data-login-form]");
  const registerForm = document.querySelector("[data-register-form]");
  const forgotPasswordForm = document.querySelector("[data-forgot-password-form]");
  const resetPasswordForm = document.querySelector("[data-reset-password-form]");

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = loginForm.querySelector('button[type="submit"]');
      const restoreButton = setButtonLoading(submitButton, "Connexion...");
      const data = formToObject(loginForm);
      const email = String(data.email || "").trim().toLowerCase();
      const password = String(data.password || "");

      if (!email || !password) {
        showToast("Email et mot de passe requis.", "error");
        restoreButton();
        return;
      }

      try {
        const response = await apiJson("/auth/login", { email, password });
        setAuthToken(response.token);
        window.location.href = "/dashboard";
      } catch (error) {
        restoreButton();
        showToast(error.message, "error");
      }
    });
  }

  if (registerForm) {
    const passwordInput = registerForm.querySelector("[data-password-input]");
    const passwordMeter = registerForm.querySelector("[data-password-meter]");
    const passwordHelp = registerForm.querySelector("[data-password-help]");
    const refInput = registerForm.querySelector("[data-ref-code]");
    const refFromUrl = getInvitationCodeFromUrl();
    if (refInput && refFromUrl) {
      refInput.value = refFromUrl;
      refInput.readOnly = true;
      refInput.classList.add("readonly");
    }
    const updatePasswordMeter = () => {
      if (!passwordInput || !passwordMeter || !passwordHelp) return;
      const length = String(passwordInput.value || "").length;
      const remaining = Math.max(0, 10 - length);
      const progress = Math.min(100, (length / 10) * 100);
      passwordMeter.style.setProperty("--password-progress", `${progress}%`);
      passwordMeter.classList.toggle("valid", remaining === 0);
      passwordHelp.textContent = remaining === 0
        ? "Mot de passe valide: 10 caractères minimum atteints."
        : `Minimum 10 caractères. Il manque ${remaining} caractère${remaining > 1 ? "s" : ""}.`;
    };
    passwordInput?.addEventListener("input", updatePasswordMeter);
    updatePasswordMeter();

    registerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = registerForm.querySelector('button[type="submit"]');
      const restoreButton = setButtonLoading(submitButton, "Création...");
      const data = formToObject(registerForm);
      const email = String(data.email || "").trim().toLowerCase();
      const password = String(data.password || "");
      const ref = normalizeInvitationCode(data.ref);

      const country = String(data.country || "").trim();

      if (!email || !country || !ref || password.length < 10) {
        showToast("Renseignez un email, un pays, un code d'invitation et un mot de passe d'au moins 10 caractères.", "error");
        restoreButton();
        return;
      }

      try {
        const response = await apiJson("/auth/register", { email, password, country, ref });
        setAuthToken(response.token);
        window.location.href = "/dashboard";
      } catch (error) {
        restoreButton();
        showToast(error.message, "error");
      }
    });
  }

  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = forgotPasswordForm.querySelector('button[type="submit"]');
      const restoreButton = setButtonLoading(submitButton, "Envoi...");
      const email = String(formToObject(forgotPasswordForm).email || "").trim().toLowerCase();

      if (!email) {
        showToast("Email requis.", "error");
        restoreButton();
        return;
      }

      try {
        const response = await apiJson("/auth/forgot-password", { email });
        resetPasswordForm?.querySelector('[name="email"]') && (resetPasswordForm.querySelector('[name="email"]').value = email);
        showToast(response.message || "Code OTP envoye si le compte existe.");
      } catch (error) {
        showToast(error.message, "error");
      }
      restoreButton();
    });
  }

  if (resetPasswordForm) {
    resetPasswordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = resetPasswordForm.querySelector('button[type="submit"]');
      const restoreButton = setButtonLoading(submitButton, "Changement...");
      const data = formToObject(resetPasswordForm);
      const email = String(data.email || "").trim().toLowerCase();
      const otp = String(data.otp || "").trim();
      const password = String(data.password || "");

      if (!email || !/^\d{6}$/.test(otp) || password.length < 10) {
        showToast("Email, code OTP et mot de passe valide requis.", "error");
        restoreButton();
        return;
      }

      try {
        const response = await apiJson("/auth/reset-password", { email, otp, password });
        setAuthToken(response.token);
        window.location.href = "/dashboard";
      } catch (error) {
        showToast(error.message, "error");
        restoreButton();
      }
    });
  }
}

function setupActions(user) {
  const bindClickOnce = (selector, handler) => {
    const element = document.querySelector(selector);
    if (!element || element.dataset.boundClick) return;
    element.dataset.boundClick = "true";
    element.addEventListener("click", handler);
  };

  bindClickOnce("[data-logout]", () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.location.href = "/login";
  });

  document.querySelector("[data-copy-ref]")?.addEventListener("click", () => {
    if (!user.refLink) {
      showToast("Lien de parrainage indisponible.", "error");
      return;
    }
    navigator.clipboard?.writeText(user.refLink);
    showToast("Lien de parrainage copie.");
  });

  document.querySelector("[data-copy-wallet]")?.addEventListener("click", () => {
    const activeTarget = document.querySelector("[data-deposit-target]")?.textContent || user.wallet;
    if (!activeTarget || activeTarget === "Indisponible") {
      showToast("Coordonnees de depot indisponibles.", "error");
      return;
    }
    navigator.clipboard?.writeText(activeTarget);
    showToast("Coordonnees de depot copiees.");
  });

  [
    ["[data-copy-grs-contract]", user.swap?.contractAddress],
    ["[data-copy-grs-deposit]", user.swap?.grsDepositAddress],
    ["[data-copy-grs-usdt-bep20]", user.swap?.usdtBep20DepositAddress]
  ].forEach(([selector, value]) => {
    const button = document.querySelector(selector);
    if (!button || button.dataset.boundCopySwapAddress) return;
    button.dataset.boundCopySwapAddress = "true";
    button.addEventListener("click", async () => {
      if (!value) {
        showToast("Adresse non configuree.", "error");
        return;
      }
      try {
        await navigator.clipboard?.writeText(value);
        showToast("Adresse copiee.");
      } catch {
        showToast("Copie impossible sur ce navigateur.", "error");
      }
    });
  });

  const downloadExport = async ({ path, filename, type, successMessage }) => {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: authHeaders()
    });
    if (!response.ok) {
      const message = response.headers.get("content-type")?.includes("application/json")
        ? (await response.json()).message
        : await response.text();
      throw new Error(message || "Export impossible pour le moment.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(successMessage);
  };

  document.querySelector("[data-export]")?.addEventListener("click", async () => {
    try {
      await downloadExport({
        path: "/transactions/export",
        filename: `afrix-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
        type: "text/csv;charset=utf-8",
        successMessage: "Export CSV telecharge."
      });
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  document.querySelector("[data-export-pdf]")?.addEventListener("click", async () => {
    try {
      await downloadExport({
        path: "/transactions/export-pdf",
        filename: `afrix-transactions-${new Date().toISOString().slice(0, 10)}.pdf`,
        type: "application/pdf",
        successMessage: "Releve PDF telecharge."
      });
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  document.querySelector("[data-export-email]")?.addEventListener("click", async (event) => {
    const restoreButton = setButtonLoading(event.currentTarget, "Envoi...");
    try {
      const response = await apiJson("/transactions/export-email", {}, { timeoutMs: 30_000 });
      showToast(response.message || "Releve envoye par email.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });

  const depositForm = document.querySelector("[data-deposit-form]");
  if (depositForm && !depositForm.dataset.boundDeposit) {
    depositForm.dataset.boundDeposit = "true";
    depositForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formError = firstFormError(form);
    if (formError) {
      showToast(formError, "error");
      return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Traitement...");
    try {
      const response = await apiRequest("/deposits", {
        method: "POST",
        headers: authHeaders(),
        body: new FormData(form)
      });
      if (response.reference) showCicoReference(response.reference, "Depot", response.amount, response.fee || 0, null, { asset: response.asset || "USDT" });
      showToast("Demande de depot enregistree. Elle est visible dans vos transactions.");
      form.reset();
      loadCurrentUser()
        .then((freshUser) => renderProtectedShell(document.body.dataset.page, freshUser))
        .catch((refreshError) => showToast(`Demande enregistree, mais actualisation impossible: ${refreshError.message}`, "error"));
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });
  }

  const withdrawForm = document.querySelector("[data-withdraw-form]");
  if (withdrawForm && !withdrawForm.dataset.boundWithdraw) {
    withdrawForm.dataset.boundWithdraw = "true";
    withdrawForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formError = firstFormError(form);
    if (formError) {
      showToast(formError, "error");
      return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Traitement...");
    try {
      const grsCoinPerUsdt = getGrsCoinPerUsdt(user);
      const amount = Number(form.querySelector("[name='amount']")?.value || 0);
      const asset = "USDT";
      const fee = Number((amount * MTN_WITHDRAW_FEE_RATE).toFixed(2));
      const feeGrs = grsCoinPerUsdt ? Number((fee * grsCoinPerUsdt).toFixed(2)) : 0;
      if (amount > assetBalance(user, asset)) {
        showToast(`Solde ${asset} insuffisant. Disponible: ${formatAssetAmount(assetBalance(user, asset), asset)}.`, "error");
        return;
      }
      if (!grsCoinPerUsdt || feeGrs > Number(user.grsBalance || 0)) {
        showToast("Solde GRSCOIN insuffisant. Les frais de retrait sont payables exclusivement en GRSC. Veuillez recharger votre portefeuille GRSCOIN pour poursuivre cette opération.", "error");
        return;
      }
      const response = await apiJson("/withdrawals", formToObject(form));
      if (response.reference) {
        showCicoReference(response.reference, "Retrait", response.amount, response.fee || 0, response.netAmount, {
          asset: response.asset || "USDT",
          feeAsset: response.feeAsset,
          feeGrsAmount: response.feeGrsAmount
        });
      }
      showToast("Demande de retrait soumise. Elle est visible dans vos transactions.");
      form.reset();
      loadCurrentUser()
        .then((freshUser) => renderProtectedShell(document.body.dataset.page, freshUser))
        .catch((refreshError) => showToast(`Demande enregistree, mais actualisation impossible: ${refreshError.message}`, "error"));
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });
  }

  const swapForm = document.querySelector("[data-swap-form]");
  if (swapForm && !swapForm.dataset.boundSwap) {
    swapForm.dataset.boundSwap = "true";
    swapForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const amount = Number(form.querySelector("[name='amount']")?.value || 0);
      const direction = form.querySelector("[name='direction']")?.value || "USDT_GRSC";
      const sourceAsset = direction.split("_")[0] || "USDT";
      if (direction === "GRSC_USDT" || direction === "GRSC_AUSD") {
        showToast("Indisponible pour le moment.", "error");
        return;
      }
      if (!Number.isFinite(amount) || amount < 1) {
        showToast(`Montant minimum swap: 1 ${sourceAsset}.`, "error");
        return;
      }
      if (amount > assetBalance(user, sourceAsset)) {
        showToast(`Solde ${sourceAsset} insuffisant. Disponible: ${formatAssetAmount(assetBalance(user, sourceAsset), sourceAsset)}.`, "error");
        return;
      }
      const submitButton = form.querySelector('button[type="submit"]');
      const restoreButton = setButtonLoading(submitButton, "Conversion...");
      try {
        const response = direction === "USDT_GRSC"
          ? await apiJson("/swap/usdt-to-grsc", { amount }, { timeoutMs: 20_000 })
          : await apiJson("/swap/convert", { amount, direction }, { timeoutMs: 20_000 });
        const targetAsset = direction.split("_")[1] || "GRSC";
        const credited = targetAsset === "AUSD"
          ? formatAusd(response.ausdAmount)
          : targetAsset === "GRSC"
          ? formatGrsc(response.grsAmount)
          : formatUsdt(response.usdtAmount);
        showToast(`Swap effectue: ${credited}.`);
        form.reset();
        const freshUser = await apiRequest("/me", { timeoutMs: 15_000 }).then((payload) => normalizeUser(payload.user || payload));
        renderProtectedShell(document.body.dataset.page, freshUser);
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        restoreButton();
      }
    });
  }

  const grsDepositForm = document.querySelector("[data-grs-deposit-form]");
  if (grsDepositForm && !grsDepositForm.dataset.boundGrsDeposit) {
    grsDepositForm.dataset.boundGrsDeposit = "true";
    grsDepositForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const formError = firstFormError(form);
      if (formError) {
        showToast(formError, "error");
        return;
      }
      const amount = Number(form.querySelector("[name='amount']")?.value || 0);
      if (!Number.isFinite(amount) || amount < 1) {
        showToast("Montant minimum depot GRSCOIN: 1 GRSC.", "error");
        return;
      }
      const submitButton = form.querySelector('button[type="submit"]');
      const restoreButton = setButtonLoading(submitButton, "Envoi...");
      try {
        const response = await apiRequest("/swap/grscoin-deposits", {
          method: "POST",
          headers: authHeaders(),
          body: new FormData(form),
          timeoutMs: 30_000
        });
        showToast(`Demande de depot envoyee: ${formatGrsc(response.grsAmount)} (${formatUsdt(response.usdtAmount)}).`);
        form.reset();
        const freshUser = await apiRequest("/me", { timeoutMs: 15_000 }).then((payload) => normalizeUser(payload.user || payload));
        renderProtectedShell(document.body.dataset.page, freshUser);
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        restoreButton();
      }
    });
  }

  const grsUsdtDepositForm = document.querySelector("[data-grs-usdt-deposit-form]");
  if (grsUsdtDepositForm && !grsUsdtDepositForm.dataset.boundGrsUsdtDeposit) {
    grsUsdtDepositForm.dataset.boundGrsUsdtDeposit = "true";
    grsUsdtDepositForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const formError = firstFormError(form);
      if (formError) {
        showToast(formError, "error");
        return;
      }
      const amount = Number(form.querySelector("[name='amount']")?.value || 0);
      if (!Number.isFinite(amount) || amount < 1) {
        showToast("Montant minimum depot USDT BEP20: 1 USDT.", "error");
        return;
      }
      const submitButton = form.querySelector('button[type="submit"]');
      const restoreButton = setButtonLoading(submitButton, "Envoi...");
      try {
        const response = await apiRequest("/swap/grscoin-deposits", {
          method: "POST",
          headers: authHeaders(),
          body: new FormData(form),
          timeoutMs: 30_000
        });
        const credited = response.creditAsset === "AUSD" ? formatAusd(response.ausdAmount) : formatGrsc(response.grsAmount);
        showToast(`Depot USDT envoye: ${formatUsdt(response.usdtAmount)} -> ${credited}.`);
        form.reset();
        const freshUser = await apiRequest("/me", { timeoutMs: 15_000 }).then((payload) => normalizeUser(payload.user || payload));
        renderProtectedShell(document.body.dataset.page, freshUser);
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        restoreButton();
      }
    });
  }

  const grsWithdrawForm = document.querySelector("[data-grs-withdraw-form]");
  if (grsWithdrawForm && !grsWithdrawForm.dataset.boundGrsWithdraw) {
    grsWithdrawForm.dataset.boundGrsWithdraw = "true";
    const grsWithdrawAmount = grsWithdrawForm.querySelector("[data-grs-withdraw-amount]");
    const grsWithdrawPreview = grsWithdrawForm.querySelector("[data-grs-withdraw-preview]");
    const updateGrsWithdrawPreview = () => {
      const amount = Number(grsWithdrawAmount?.value || 0);
      const fee = amount > 0 ? amount * 0.10 : 0;
      const net = Math.max(0, amount - fee);
      if (grsWithdrawPreview) {
        grsWithdrawPreview.textContent = amount > 0
          ? `Frais 10%: ${formatGrsc(fee)}. Net a recevoir: ${formatGrsc(net)}.`
          : "Frais retrait: 10%. Saisissez un montant GRSCOIN.";
      }
    };
    grsWithdrawAmount?.addEventListener("input", updateGrsWithdrawPreview);
    updateGrsWithdrawPreview();
    grsWithdrawForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const formError = firstFormError(form);
      if (formError) {
        showToast(formError, "error");
        return;
      }
      const amount = Number(form.querySelector("[name='amount']")?.value || 0);
      if (!Number.isFinite(amount) || amount < 1) {
        showToast("Montant minimum retrait GRSCOIN: 1 GRSC.", "error");
        return;
      }
      if (amount > Number(user.grsBalance || 0)) {
        showToast(`Solde GRSCOIN insuffisant. Disponible: ${formatGrsc(user.grsBalance)}.`, "error");
        return;
      }
      const submitButton = form.querySelector('button[type="submit"]');
      const restoreButton = setButtonLoading(submitButton, "Envoi...");
      try {
        await apiJson("/swap/grscoin-withdrawals", formToObject(form), { timeoutMs: 20_000 });
        showToast("Demande de retrait GRSCOIN soumise.");
        form.reset();
        const freshUser = await apiRequest("/me", { timeoutMs: 15_000 }).then((payload) => normalizeUser(payload.user || payload));
        renderProtectedShell(document.body.dataset.page, freshUser);
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        restoreButton();
      }
    });
  }

  bindClickOnce("[data-plans-list]", async (event) => {
    const button = event.target.closest("[data-plan]");
    if (!button) return;
    const article = button.closest("article");
    const amount = Number(article?.querySelector("[data-plan-amount]")?.value || 0);
    if (!Number.isFinite(amount) || amount < 10) {
      showToast("Montant minimum investissement: 10 USDT.", "error");
      return;
    }
    if (amount > Number(user.balance || 0)) {
      showToast(`Solde insuffisant. Disponible: ${formatUsdt(user.balance)}.`, "error");
      return;
    }
    const restoreButton = setButtonLoading(button, "Activation...");
    try {
      const response = await apiJson("/plans/activate", { amount, plan: button.dataset.plan }, { timeoutMs: 25_000 });
      showToast(`Activation ${formatUsdt(amount)} - ${response.activePlan?.name || "plan"} validee.`);
      try {
        const freshUser = await apiRequest("/me", { timeoutMs: 15_000 }).then((data) => normalizeUser(data.user || data));
        renderProtectedShell(document.body.dataset.page, freshUser);
      } catch (refreshError) {
        showToast(`Activation validee, actualisez la page si le solde ne change pas: ${refreshError.message}`, "error");
      }
    } catch (error) {
      restoreButton();
      showToast(error.message, "error");
      return;
    }
    restoreButton();
  });

  bindClickOnce("[data-staking-plans-list]", async (event) => {
    const button = event.target.closest("[data-staking-plan]");
    if (!button) return;
    const article = button.closest("article");
    const amount = Number(article?.querySelector("[data-staking-amount]")?.value || 0);
    const plan = stakingPlans.find((item) => item.id === button.dataset.stakingPlan);
    const minAmount = Number(plan?.minAmount || 100);
    if (!Number.isFinite(amount) || amount < minAmount) {
      showToast(`Montant minimum ${plan?.name || "staking"}: ${formatGrsc(minAmount)}.`, "error");
      return;
    }
    if (amount > Number(user.grsBalance || 0)) {
      showToast(`Solde GRSCOIN insuffisant. Disponible: ${formatGrsc(user.grsBalance)}.`, "error");
      return;
    }
    const restoreButton = setButtonLoading(button, "Activation...");
    try {
      const response = await apiJson("/staking/activate", { amount, plan: button.dataset.stakingPlan }, { timeoutMs: 25_000 });
      showToast(`Staking active: ${formatGrsc(response.activeStake?.amount || amount)}.`);
      const freshUser = await apiRequest("/me", { timeoutMs: 15_000 }).then((data) => normalizeUser(data.user || data));
      renderProtectedShell(document.body.dataset.page, freshUser);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });

  bindClickOnce("[data-active-stakes-list]", async (event) => {
    const button = event.target.closest("[data-staking-claim]");
    if (!button) return;
    const restoreButton = setButtonLoading(button, "Reclamation...");
    try {
      const response = await apiJson(`/staking/${encodeURIComponent(button.dataset.stakingClaim)}/claim`, {}, { timeoutMs: 25_000 });
      showToast(`Staking reclame: ${formatGrsc(response.claimedAmount)} credites.`);
      const freshUser = await apiRequest("/me", { timeoutMs: 15_000 }).then((data) => normalizeUser(data.user || data));
      renderProtectedShell(document.body.dataset.page, freshUser);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });

  bindClickOnce("[data-founders-plans-list]", async (event) => {
    const button = event.target.closest("[data-founder-plan]");
    if (!button) return;
    const article = button.closest("article");
    const amount = Number(article?.querySelector("[data-founder-amount]")?.value || 0);
    const plan = foundersPlans.find((item) => item.id === button.dataset.founderPlan);
    const minAmount = Number(plan?.minAmount || 10000);
    if (!Number.isFinite(amount) || amount < minAmount) {
      showToast(`Participation minimum ${plan?.name || "Founders Club"}: ${formatGrsc(minAmount)}.`, "error");
      return;
    }
    const activationFee = Number((amount * FOUNDERS_ACTIVATION_FEE_RATE).toFixed(2));
    const totalRequired = Number((amount + activationFee).toFixed(2));
    if (totalRequired > Number(user.grsBalance || 0)) {
      showToast(`Solde GRSCOIN insuffisant. Total requis: ${formatGrsc(totalRequired)} incluant ${formatGrsc(activationFee)} de frais. Disponible: ${formatGrsc(user.grsBalance)}.`, "error");
      return;
    }
    const confirmed = window.confirm(`Confirmer l'immobilisation de ${formatGrsc(amount)} dans ${plan?.name || "GRS Core Founders Club"} ? Frais activation: ${formatGrsc(activationFee)}. Total debite: ${formatGrsc(totalRequired)}.`);
    if (!confirmed) return;
    const restoreButton = setButtonLoading(button, "Activation...");
    try {
      const response = await apiJson("/founders/activate", { amount, plan: button.dataset.founderPlan }, { timeoutMs: 25_000 });
      showToast(`Founders Club active: ${formatGrsc(response.activeFounder?.amount || amount)}. Frais: ${formatGrsc(response.activationFee || activationFee)}.`);
      const freshUser = await apiRequest("/me", { timeoutMs: 15_000 }).then((data) => normalizeUser(data.user || data));
      renderProtectedShell(document.body.dataset.page, freshUser);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });

  bindClickOnce("[data-active-founders-list]", async (event) => {
    const button = event.target.closest("[data-founder-claim]");
    if (!button) return;
    const restoreButton = setButtonLoading(button, "Reclamation...");
    try {
      const response = await apiJson(`/founders/${encodeURIComponent(button.dataset.founderClaim)}/claim`, {}, { timeoutMs: 25_000 });
      showToast(`Participation Founders reclamee: ${formatGrsc(response.claimedAmount)} credites.`);
      const freshUser = await apiRequest("/me", { timeoutMs: 15_000 }).then((data) => normalizeUser(data.user || data));
      renderProtectedShell(document.body.dataset.page, freshUser);
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });

  const p2pForm = document.querySelector("[data-p2p-form]");
  const p2pLookup = document.querySelector("[data-p2p-lookup]");
  const p2pRecipientInput = document.querySelector("[data-p2p-recipient]");
  const p2pAmountInput = document.querySelector("[data-p2p-amount]");
  const p2pAssetInput = document.querySelector("[data-p2p-asset]");
  let p2pRecipient = null;

  const lookupP2pRecipient = async () => {
    const email = String(p2pRecipientInput?.value || "").trim().toLowerCase();
    if (!email) {
      showToast("Email du destinataire requis.", "error");
      return null;
    }
    const restoreButton = setButtonLoading(p2pLookup, "Verification...");
    try {
      const data = await apiRequest(`/p2p-recipient/${encodeURIComponent(email)}`);
      p2pRecipient = data;
      renderP2pRecipientPreview(data);
      showToast("Destinataire verifie.");
      return data;
    } catch (error) {
      p2pRecipient = null;
      renderP2pRecipientPreview(null);
      showToast(error.message, "error");
      return null;
    } finally {
      restoreButton();
    }
  };

  if (p2pLookup && !p2pLookup.dataset.boundLookup) {
    p2pLookup.dataset.boundLookup = "true";
    p2pLookup.addEventListener("click", lookupP2pRecipient);
  }
  if (p2pRecipientInput && !p2pRecipientInput.dataset.boundP2pRecipient) {
    p2pRecipientInput.dataset.boundP2pRecipient = "true";
    p2pRecipientInput.addEventListener("input", () => {
      p2pRecipient = null;
      renderP2pRecipientPreview(null);
    });
  }
  if (p2pAmountInput && !p2pAmountInput.dataset.boundP2pAmount) {
    p2pAmountInput.dataset.boundP2pAmount = "true";
    p2pAmountInput.addEventListener("input", updateP2pFeePreview);
    updateP2pFeePreview();
  }
  if (p2pAssetInput && !p2pAssetInput.dataset.boundP2pAsset) {
    p2pAssetInput.dataset.boundP2pAsset = "true";
    p2pAssetInput.addEventListener("change", updateP2pFeePreview);
  }

  if (p2pForm && !p2pForm.dataset.boundSubmit) p2pForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = formToObject(form);
    const amount = Number(data.amount || 0);
    const asset = String(data.asset || "USDT").toUpperCase();
    const fee = Number((amount * P2P_FEE_RATE).toFixed(2));
    const total = Number((amount + fee).toFixed(2));
    if (!Number.isFinite(amount) || amount < 1) {
      showToast(`Montant minimum transfert: 1 ${asset}.`, "error");
      return;
    }
    if (total > assetBalance(user, asset)) {
      showToast(`Solde ${asset} insuffisant. Total requis: ${formatAssetAmount(total, asset)}.`, "error");
      return;
    }
    if (!p2pRecipient || p2pRecipient.email !== String(data.recipient || "").trim().toLowerCase()) {
      const recipient = await lookupP2pRecipient();
      if (!recipient) return;
    }
    const confirmed = window.confirm(`Confirmer l'envoi de ${formatAssetAmount(amount, asset)} a ${p2pRecipient.displayName || p2pRecipient.email} ? Frais: ${formatAssetAmount(fee, asset)}. Total debite: ${formatAssetAmount(total, asset)}.`);
    if (!confirmed) return;
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Envoi...");
    try {
      const response = await apiJson("/p2p-transfers", data, { timeoutMs: 20_000 });
      showToast(`Transfert P2P envoye. Reference: ${response.reference || "AFRIX"}.`);
      form.reset();
      p2pRecipient = null;
      renderP2pRecipientPreview(null);
      updateP2pFeePreview();
      try {
        const freshUser = await apiRequest("/me", { timeoutMs: 15_000 }).then((payload) => normalizeUser(payload.user || payload));
        renderProtectedShell(document.body.dataset.page, freshUser);
      } catch (refreshError) {
        showToast(`Transfert envoye, actualisez la page si le solde ne change pas: ${refreshError.message}`, "error");
      }
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });
  if (p2pForm) p2pForm.dataset.boundSubmit = "true";

  const profileForm = document.querySelector("[data-profile-form]");
  if (profileForm && !profileForm.dataset.boundSubmit) profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const avatarInput = form.querySelector("[data-profile-avatar-input]");
    const avatarFile = avatarInput?.files?.[0];
    if (avatarFile && avatarFile.size > 1024 * 1024) {
      showToast("Photo trop lourde. Taille maximale: 1 Mo.", "error");
      return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Mise à jour...");
    try {
      const response = await apiRequest("/profile", {
        method: "PATCH",
        body: new FormData(form),
        timeoutMs: 20_000
      });
      const freshUser = normalizeUser(response.user || response);
      renderProtectedShell(document.body.dataset.page, freshUser);
      showToast("Profil mis à jour.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });
  if (profileForm) profileForm.dataset.boundSubmit = "true";

  const changePasswordForm = document.querySelector("[data-change-password-form]");
  if (changePasswordForm && !changePasswordForm.dataset.boundSubmit) changePasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Modification...");
    try {
      await apiJson("/auth/change-password", formToObject(form), { timeoutMs: 20_000 });
      form.reset();
      showToast("Mot de passe modifie.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });
  if (changePasswordForm) changePasswordForm.dataset.boundSubmit = "true";

  const cicoForm = document.querySelector("[data-cico-form]");
  if (cicoForm && !cicoForm.dataset.boundSubmit) cicoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const operation = form.querySelector("[name='operation']")?.value || "Depot";
    const amount = Number(form.querySelector("[name='amount']")?.value || 0);
    if (operation === "Retrait" && amount < 10) {
      showToast("Montant minimum retrait: 10 USDT.", "error");
      return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Creation...");
    try {
      const response = await apiJson("/cico-requests", formToObject(form));
      if (response.reference) showCicoReference(response.reference, response.operation || "CICO", response.amount, response.fee || 0);
      showToast("Reference CICO creee.");
    } catch (error) {
      restoreButton();
      showToast(error.message, "error");
      return;
    }
    restoreButton();
  });
  if (cicoForm) cicoForm.dataset.boundSubmit = "true";

  const cicoOperation = document.querySelector("[data-cico-operation]");
  const cicoAmount = document.querySelector("[data-cico-amount]");
  const updateCicoMinimum = () => {
    if (!cicoOperation || !cicoAmount) return;
    const minimum = cicoOperation.value === "Retrait" ? 10 : 1;
    cicoAmount.min = String(minimum);
    if (Number(cicoAmount.value || 0) < minimum) cicoAmount.value = String(minimum);
  };
  cicoOperation?.addEventListener("change", updateCicoMinimum);
  updateCicoMinimum();

  const merchantApplicationForm = document.querySelector("[data-merchant-application-form]");
  if (merchantApplicationForm && !merchantApplicationForm.dataset.boundSubmit) merchantApplicationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Envoi...");
    try {
      await apiJson("/merchant/applications", formToObject(form));
      form.reset();
      showToast("Profil merchant envoye pour validation.");
    } catch (error) {
      restoreButton();
      showToast(error.message, "error");
      return;
    }
    restoreButton();
  });
  if (merchantApplicationForm) merchantApplicationForm.dataset.boundSubmit = "true";

  const exchangeAdForm = document.querySelector("[data-exchange-ad-form]");
  if (exchangeAdForm && !exchangeAdForm.dataset.boundSubmit) exchangeAdForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = formToObject(form);
    const rate = Number(data.rate || 0);
    const type = String(data.type || "");
    if (type === "sell" && (rate < 550 || rate > 600)) {
      showToast("Le prix de vente doit être compris entre 550 et 600 FCFA.", "error");
      return;
    }
    if (type === "buy" && (rate < 630 || rate > 650)) {
      showToast("Le prix d'achat doit être compris entre 630 et 650 FCFA.", "error");
      return;
    }
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Publication...");
    try {
      await apiJson("/exchange/ads", data);
      form.reset();
      showToast("Annonce Exchange publiée.");
      loadCurrentUser()
        .then((freshUser) => renderMerchants(freshUser))
        .catch((refreshError) => showToast(`Annonce publiée, mais actualisation impossible: ${refreshError.message}`, "error"));
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });
  if (exchangeAdForm) exchangeAdForm.dataset.boundSubmit = "true";

  const disputeForm = document.querySelector("[data-dispute-form]");
  if (disputeForm && !disputeForm.dataset.boundSubmit) disputeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Envoi...");
    try {
      await apiJson("/disputes", formToObject(form));
      form.reset();
      showToast("Litige envoye au support.");
    } catch (error) {
      restoreButton();
      showToast(error.message, "error");
      return;
    }
    restoreButton();
  });
  if (disputeForm) disputeForm.dataset.boundSubmit = "true";

  document.removeEventListener("click", handleAdminClick);
  document.addEventListener("click", handleAdminClick);
  bindClickOnce("[data-admin-proof-close]", () => {
    const viewer = document.querySelector("[data-admin-proof-viewer]");
    const content = document.querySelector("[data-admin-proof-content]");
    if (viewer) viewer.hidden = true;
    if (content) content.innerHTML = "";
  });

  const adminCreateUserForm = document.querySelector("[data-admin-create-user-form]");
  if (adminCreateUserForm && !adminCreateUserForm.dataset.boundSubmit) adminCreateUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Creation...");
    const data = formToObject(form);
    try {
      await apiJson("/admin/actions", {
        action: "user-create",
        fullName: String(data.fullName || "").trim(),
        email: String(data.email || "").trim().toLowerCase(),
        password: String(data.password || ""),
        role: data.role || "user"
      });
      form.reset();
      const freshUser = await loadCurrentUser();
      renderProtectedShell(document.body.dataset.page, freshUser);
      showToast("Compte cree par admin.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });
  if (adminCreateUserForm) adminCreateUserForm.dataset.boundSubmit = "true";

  const adminManualDepositForm = document.querySelector("[data-admin-manual-deposit-form]");
  if (adminManualDepositForm && !adminManualDepositForm.dataset.boundSubmit) adminManualDepositForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = formToObject(form);
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Credit...");
    try {
      await apiJson("/admin/actions", {
        action: "manual-deposit",
        email: String(data.email || "").trim().toLowerCase(),
        amount: Number(data.amount || 0),
        note: String(data.note || "").trim()
      }, { timeoutMs: 20_000 });
      form.reset();
      showToast("Depot manuel credite.");
      try {
        const freshUser = await apiRequest("/me", { timeoutMs: 15_000 }).then((payload) => normalizeUser(payload.user || payload));
        renderProtectedShell(document.body.dataset.page, freshUser);
      } catch (refreshError) {
        showToast(`Credit valide, actualisez la page si la liste ne change pas: ${refreshError.message}`, "error");
      }
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });
  if (adminManualDepositForm) adminManualDepositForm.dataset.boundSubmit = "true";

  const bindAdminSimpleForm = (selector, actionName, loadingLabel, successMessage, mapper = (data) => data) => {
    const form = document.querySelector(selector);
    if (!form || form.dataset.boundSubmit) return;
    form.dataset.boundSubmit = "true";
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = mapper(formToObject(form));
      const submitButton = form.querySelector('button[type="submit"]');
      const restoreButton = setButtonLoading(submitButton, loadingLabel);
      try {
        const response = await apiJson("/admin/actions", { action: actionName, ...data }, { timeoutMs: 25_000 });
        form.reset();
        const detail = actionName === "repair-referral" && response
          ? " Les prochains bonus suivront les gains journaliers."
          : "";
        showToast(`${successMessage}${detail}`);
        try {
          const freshUser = await apiRequest("/me", { timeoutMs: 15_000 }).then((payload) => normalizeUser(payload.user || payload));
          renderProtectedShell(document.body.dataset.page, freshUser);
        } catch (refreshError) {
          showToast(`Action validee, actualisez la page si besoin: ${refreshError.message}`, "error");
        }
      } catch (error) {
        showToast(error.message, "error");
      } finally {
        restoreButton();
      }
    });
  };

  bindAdminSimpleForm("[data-admin-fund-deduct-form]", "admin-fund-deduct", "Déduction...", "Fonds deduits.", (data) => ({
    email: String(data.email || "").trim().toLowerCase(),
    amount: Number(data.amount || 0),
    note: String(data.note || "").trim()
  }));
  bindAdminSimpleForm("[data-admin-plan-activate-form]", "admin-plan-activate", "Activation...", "Investissement active.", (data) => ({
    email: String(data.email || "").trim().toLowerCase(),
    plan: String(data.plan || ""),
    amount: Number(data.amount || 0)
  }));
  bindAdminSimpleForm("[data-admin-bonus-levels-form]", "bonus-levels", "Activation...", "Niveaux bonus actives.", (data) => ({
    email: String(data.email || "").trim().toLowerCase(),
    levels: Number(data.levels || 0)
  }));
  bindAdminSimpleForm("[data-admin-referral-repair-form]", "repair-referral", "Réparation...", "Parrainage repare.", (data) => ({
    email: String(data.email || "").trim().toLowerCase(),
    referrerEmail: String(data.referrerEmail || "").trim().toLowerCase()
  }));

  document.querySelectorAll("[data-admin-control]").forEach((control) => {
    if (control.dataset.boundAdminControl) return;
    control.dataset.boundAdminControl = "true";
    control.addEventListener("change", async (event) => {
      try {
        await apiJson("/admin/settings", {
          key: event.currentTarget.dataset.adminControl,
          value: event.currentTarget.checked
        });
        showToast("Parametre admin enregistre.");
      } catch (error) {
        event.currentTarget.checked = !event.currentTarget.checked;
        showToast(error.message, "error");
      }
    });
  });

  const merchantCodeForm = document.querySelector("[data-merchant-code-form]");
  if (merchantCodeForm && !merchantCodeForm.dataset.boundSubmit) merchantCodeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Recherche...");
    const reference = String(new FormData(form).get("reference") || "").trim().toUpperCase();
    const result = document.querySelector("[data-merchant-code-result]");

    try {
      const response = await apiRequest(`/merchant/cico-requests/${encodeURIComponent(reference)}`);
      const request = response.request || response;

      if (result) {
        result.innerHTML = `
          <div class="merchant-code-card">
            <span>${escapeHtml(request.reference)}</span>
            <h2>${escapeHtml(request.type)} ${formatUsdt(request.amount)}</h2>
            <p>${escapeHtml(request.customer)} - ${escapeHtml(request.method)} - ${escapeHtml(request.phone)}</p>
            <div class="info-grid compact-info">
              <div><span>Frais client</span><strong>${formatUsdt(request.fee)}</strong></div>
              <div><span>Bonus merchant</span><strong>${formatUsdt(request.merchantBonus)}</strong></div>
            </div>
            <button class="btn primary full" type="button" data-merchant-confirm-code="${escapeHtml(request.reference)}">Valider l'operation</button>
          </div>
        `;
        result.querySelector("[data-merchant-confirm-code]")?.addEventListener("click", async (clickEvent) => {
          const confirmButton = clickEvent.currentTarget;
          const restoreConfirm = setButtonLoading(confirmButton, "Validation...");
          try {
            await apiJson(`/merchant/cico-requests/${encodeURIComponent(clickEvent.currentTarget.dataset.merchantConfirmCode)}/confirm`, {});
            showToast("Operation validee.");
          } catch (error) {
            restoreConfirm();
            showToast(error.message, "error");
            return;
          }
          restoreConfirm();
        });
      }
    } catch (error) {
      restoreButton();
      if (result) result.innerHTML = `<p class="muted">Reference introuvable ou deja traitee.</p>`;
      showToast(error.message, "error");
      return;
    }
    restoreButton();
  });
  if (merchantCodeForm) merchantCodeForm.dataset.boundSubmit = "true";

  const merchantTransferForm = document.querySelector("[data-merchant-transfer-form]");
  if (merchantTransferForm && !merchantTransferForm.dataset.boundSubmit) merchantTransferForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Transfert...");
    try {
      await apiJson("/merchant/transfers", formToObject(form));
      showToast("Transfert du wallet merchant envoye.");
    } catch (error) {
      restoreButton();
      showToast(error.message, "error");
      return;
    }
    restoreButton();
  });
  if (merchantTransferForm) merchantTransferForm.dataset.boundSubmit = "true";

  const exchangeCodeForm = document.querySelector("[data-exchange-code-form]");
  if (exchangeCodeForm && !exchangeCodeForm.dataset.boundSubmit) exchangeCodeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Recherche...");
    const reference = String(new FormData(form).get("reference") || "").trim().toUpperCase();
    const result = document.querySelector("[data-exchange-code-result]");

    try {
      const response = await apiRequest(`/exchange/orders/${encodeURIComponent(reference)}`);
      const order = response.order || response;

      if (result) {
        result.innerHTML = `
          <div class="merchant-code-card">
            <span>${escapeHtml(order.reference)}</span>
            <h2>${exchangeTypeLabel(order.type)} ${formatUsdt(order.amount)}</h2>
            <p>${escapeHtml(order.customerEmail)} - ${escapeHtml(order.paymentMethod)} - ${formatXaf(order.localAmount)}</p>
            <div class="info-grid compact-info">
              <div><span>Taux</span><strong>${Math.round(Number(order.rate || 0)).toLocaleString("fr-FR")} FCFA</strong></div>
              <div><span>Statut</span><strong>${escapeHtml(order.status)}</strong></div>
            </div>
            <button class="btn primary full" type="button" data-exchange-confirm-code="${escapeHtml(order.reference)}">Valider l'opération Exchange</button>
          </div>
        `;
        result.querySelector("[data-exchange-confirm-code]")?.addEventListener("click", async (clickEvent) => {
          const confirmButton = clickEvent.currentTarget;
          const restoreConfirm = setButtonLoading(confirmButton, "Validation...");
          try {
            await apiJson(`/exchange/orders/${encodeURIComponent(clickEvent.currentTarget.dataset.exchangeConfirmCode)}/confirm`, {});
            showToast("Opération Exchange validée.");
          } catch (error) {
            showToast(error.message, "error");
          } finally {
            restoreConfirm();
          }
        });
      }
    } catch (error) {
      if (result) result.innerHTML = `<p class="muted">Référence introuvable ou déjà traitée.</p>`;
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });
  if (exchangeCodeForm) exchangeCodeForm.dataset.boundSubmit = "true";
}

function showCicoReference(reference, operation, amount, fee, netAmount = null, options = {}) {
  const output = document.querySelector("[data-cico-reference-output]");
  const refValue = document.querySelector("[data-cico-reference]");
  const refSummary = document.querySelector("[data-cico-reference-summary]");
  if (!output || !refValue || !refSummary) return;

  refValue.textContent = reference;
  const feeLabel = options.feeAsset === "GRSC"
    ? `${formatGrsc(options.feeGrsAmount || 0)} de frais GRSC`
    : `${formatUsdt(fee)} de frais`;
  const asset = options.asset || "USDT";
  if (netAmount !== null && Number.isFinite(Number(netAmount))) {
    refSummary.textContent = `${operation}: ${formatAssetAmount(amount, asset)} - ${feeLabel}. Montant reçu: ${formatAssetAmount(netAmount, asset)}.`;
  } else {
    refSummary.textContent = `${operation}: ${formatAssetAmount(amount, asset)}${fee || options.feeGrsAmount ? ` + ${feeLabel}` : " sans frais"}.`;
  }
  output.hidden = false;

  document.querySelectorAll(".merchant-card a[href^='https://wa.me/']").forEach((link) => {
    const phone = link.href.split("?")[0];
    const text = encodeURIComponent(`Bonjour, voici ma reference AFRIX Money: ${reference}. Operation: ${operation} ${formatAssetAmount(amount, asset)}.`);
    link.href = `${phone}?text=${text}`;
  });
}

async function handleAdminClick(event) {
  const copyAddressButton = event.target.closest("[data-copy-admin-address]");
  if (copyAddressButton) {
    const address = copyAddressButton.dataset.copyAdminAddress || "";
    try {
      await navigator.clipboard?.writeText(address);
      showToast("Adresse copiee.");
    } catch {
      showToast("Copie impossible sur ce navigateur.", "error");
    }
    return;
  }

  const proofButton = event.target.closest("[data-admin-proof]");
  if (proofButton) {
    const restoreProof = setButtonLoading(proofButton, "Ouverture...");
    try {
      const proof = await apiRequest(`/admin/deposits/${encodeURIComponent(proofButton.dataset.adminProof)}/proof`);
      const viewer = document.querySelector("[data-admin-proof-viewer]");
      const content = document.querySelector("[data-admin-proof-content]");
      if (!viewer || !content) {
        window.location.href = proof.dataUrl;
        return;
      }
      content.innerHTML = `
        <div class="proof-frame">
          <img src="${proof.dataUrl}" alt="Capture dépôt ${escapeHtml(proof.id || "")}">
          <a class="btn secondary" href="${proof.dataUrl}" download="${escapeHtml(proof.originalName || "capture-depot")}">Télécharger</a>
        </div>
      `;
      viewer.hidden = false;
      viewer.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreProof();
    }
    return;
  }

  const exchangeConfirmButton = event.target.closest("[data-admin-exchange-confirm]");
  if (exchangeConfirmButton) {
    const reference = exchangeConfirmButton.dataset.adminExchangeConfirm;
    if (!window.confirm(`Valider la demande Exchange ${reference} ?`)) return;
    const restoreButton = setButtonLoading(exchangeConfirmButton, "Validation...");
    try {
      await apiJson(`/exchange/orders/${encodeURIComponent(reference)}/confirm`, {});
      const freshUser = await loadCurrentUser();
      renderProtectedShell(document.body.dataset.page, freshUser);
      showToast("Demande Exchange validee.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
    return;
  }

  const action = event.target.closest("[data-admin-action], [data-admin-approve], [data-admin-reject], [data-merchant-approve], [data-merchant-reject], [data-merchant-fund], [data-dispute-close], [data-admin-user-suspend], [data-admin-user-reactivate], [data-admin-user-role]");
  if (!action) return;

  const actionMap = [
    ["adminApprove", "approve"],
    ["adminReject", "reject"],
    ["merchantApprove", "merchant-approve"],
    ["merchantReject", "merchant-reject"],
    ["merchantFund", "merchant-fund"],
    ["disputeClose", "dispute-close"],
    ["adminUserSuspend", "user-suspend"],
    ["adminUserReactivate", "user-reactivate"],
    ["adminUserRole", "user-role"]
  ];
  const [datasetKey, mappedActionName] = actionMap.find(([key]) => action.dataset[key] !== undefined) || [];
  const actionName = action.dataset.adminAction || mappedActionName;
  const id = action.dataset.adminId || (datasetKey ? action.dataset[datasetKey] : "");
  if (!actionName || !id) {
    showToast("Action admin invalide.", "error");
    return;
  }
  const amountInput = action.closest(".queue-row")?.querySelector("[data-merchant-fund-amount]");
  const amount = amountInput ? Number(amountInput.value || 0) : undefined;
  const role = action.dataset.role;
  const confirmationLabels = {
    approve: "valider cette transaction",
    reject: "rejeter cette transaction",
    "merchant-approve": "approuver ce merchant",
    "merchant-reject": "rejeter ce merchant",
    "merchant-fund": "approvisionner ce wallet merchant",
    "dispute-close": "cloturer ce litige",
    "user-suspend": "suspendre ce compte",
    "user-reactivate": "reactiver ce compte",
    "user-role": "modifier le role de ce compte"
  };
  if (confirmationLabels[actionName] && !window.confirm(`Confirmer: ${confirmationLabels[actionName]} ?`)) return;
  const restoreButton = setButtonLoading(action, "Traitement...");

  try {
    await apiJson(
      "/admin/actions",
      { action: actionName, id, ...(amount ? { amount } : {}), ...(role ? { role } : {}) },
      { timeoutMs: 20_000 }
    );
    showToast("Action admin validee.");
    action.closest(".queue-row")?.classList.add("is-processing");
    try {
      const freshUser = await apiRequest("/me", { timeoutMs: 15_000 }).then((data) => normalizeUser(data.user || data));
      renderProtectedShell(document.body.dataset.page, freshUser);
    } catch (refreshError) {
      showToast(`Action validee, actualisez la page si la liste ne change pas: ${refreshError.message}`, "error");
    }
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    restoreButton();
  }
}

function renderProtectedShell(page, user) {
  renderSidebar(page, user);
  renderTopbar(page, user);
  renderDashboard(user);
  renderTransactions(user);
  renderWallet(user);
  renderSwap(user);
  renderPlans(user);
  renderStaking(user);
  renderFounders(user);
  renderNetwork(user);
  renderProfile(user);
  renderContact();
  renderExchange(user);
  renderMerchants(user);
  renderAdmin(user);
  setupActions(user);
  renderSupportWidget();
}

function setupPublicHomeReveal() {
  const revealItems = Array.from(document.querySelectorAll(".home-reveal"));
  if (!revealItems.length) return;

  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      entry.target.classList.toggle("is-visible", entry.isIntersecting);
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });

  revealItems.forEach((item, index) => {
    item.style.transitionDelay = `${Math.min(index * 45, 220)}ms`;
    observer.observe(item);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;
  const isProtected = document.body.matches("[data-protected]");

  hydrateInvitationLinks();
  setupAuthForms();
  setupPwa();
  setupPublicHomeReveal();
  renderSupportWidget();

  if (!isProtected) return;

  renderSidebar(page);
  renderTopbar(page);

  if (!getAuthToken()) {
    window.location.href = "/login";
    return;
  }

  try {
    const user = await loadCurrentUser();
    if (page === "admin" && !canUseBackoffice(user)) {
      window.location.href = "/dashboard";
      return;
    }
    renderProtectedShell(page, user);
  } catch (error) {
    showLoadError(error.message);
  }
});
