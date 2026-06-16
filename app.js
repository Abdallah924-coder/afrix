const API_BASE = window.AFRIX_API_BASE || "/api";
const AUTH_TOKEN_KEY = "afrix_auth_token";
const API_TIMEOUT_MS = 120_000;
const MAX_PROOF_FILE_BYTES = 5 * 1024 * 1024;

const pageTitles = {
  dashboard: "Tableau de bord",
  wallet: "Wallet USDT",
  "afrix-money": "AFRIX Money",
  exchange: "Exchange",
  merchant: "Merchant",
  plans: "Plans",
  network: "Reseau",
  elite: "Programme Elite",
  transactions: "Historique",
  admin: "Admin",
  login: "Connexion",
  register: "Inscription"
};

const navItems = [
  ["dashboard", "Dashboard", "/dashboard"],
  ["wallet", "Wallet USDT", "/wallet"],
  ["afrix-money", "AFRIX Money", "/afrix-money"],
  ["exchange", "Exchange", "/exchange"],
  ["merchant", "Merchant", "/merchant"],
  ["plans", "Plans", "/plans"],
  ["network", "Reseau", "/network"],
  ["elite", "Elite", "/elite"],
  ["transactions", "Transactions", "/transactions"],
  ["admin", "Admin", "/admin"]
];

const DEPOSIT_MOBILE_RATE = 650;
const WITHDRAW_MOBILE_RATE = 550;
const bonusRates = [10, 5, 5, 5, 5, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const plans = [
  { tier: "Bronze", name: "Starter Plan", minAmount: 10, amount: "10 a 49,99 USDT", daily: "0,50%", duration: "90 jours", cycle: "capital + jusqu'a 45% de benefices", note: "Ideal pour decouvrir progressivement l'ecosysteme." },
  { tier: "Silver", name: "Smart Plan", minAmount: 50, amount: "50 a 99,99 USDT", daily: "0,60%", duration: "180 jours", cycle: "capital + jusqu'a 108% de benefices", note: "Adapte aux membres recherchant une strategie plus longue.", featured: true },
  { tier: "Gold", name: "Premium Plan", minAmount: 100, amount: "100 a 499,99 USDT", daily: "0,70%", duration: "270 jours", cycle: "capital + jusqu'a 189% de benefices", note: "Concu pour les participants souhaitant renforcer leur engagement." },
  { tier: "Elite", name: "Elite Plan", minAmount: 500, amount: "500 USDT et plus", daily: "0,80%", duration: "365 jours", cycle: "capital + jusqu'a 292% de benefices", note: "Destine aux partenaires et investisseurs ayant une vision long terme." }
];

const emptyUser = {
  fullName: "",
  email: "",
  balance: 0,
  activity: 0,
  team: 0,
  bonus: 0,
  rank: "Niveau 0",
  progress: 0,
  wallet: "",
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
  platformControls: {},
  role: "user"
};

const formatUsdt = (value) => `${Number(value || 0).toFixed(2)} USDT`;
const formatXaf = (value) => `${Math.round(Number(value || 0)).toLocaleString("fr-FR")} XAF`;

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
    throw new Error("Connexion au serveur AFRIX impossible. Vérifiez que le déploiement Render est terminé et que l'API est en ligne.");
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
    method: options.method || "POST",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    body: JSON.stringify(data)
  });
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
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
    directPartners: Array.isArray(user?.directPartners) ? user.directPartners : [],
    merchants: Array.isArray(user?.merchants) ? user.merchants : [],
    merchantWallet: { ...emptyUser.merchantWallet, ...(user?.merchantWallet || {}) },
    cicoRequests: Array.isArray(user?.cicoRequests) ? user.cicoRequests : [],
    exchangeAds: Array.isArray(user?.exchangeAds) ? user.exchangeAds : [],
    exchangeOrders: Array.isArray(user?.exchangeOrders) ? user.exchangeOrders : [],
    adminExchangeOrders: Array.isArray(user?.adminExchangeOrders) ? user.adminExchangeOrders : [],
    merchantApplications: Array.isArray(user?.merchantApplications) ? user.merchantApplications : [],
    disputes: Array.isArray(user?.disputes) ? user.disputes : [],
    platformControls: user?.platformControls || {}
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
  const visibleNavItems = navItems.filter(([key]) => key !== "admin" || user.role === "admin");

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
    </div>
  `;
}

function renderTopbar(page, user = emptyUser) {
  const topbar = document.querySelector("[data-topbar]");
  if (!topbar) return;

  topbar.innerHTML = `
    <button class="btn secondary menu-btn" type="button" data-menu-toggle>☰</button>
    <div class="topbar-title">
      <p>Wallet • Trading • Blockchain</p>
      <h1>${pageTitles[page] || "AFRIX"}</h1>
    </div>
    <div class="user-box">
      <span>${escapeHtml(user.email || "Compte AFRIX")}</span>
      <strong>USDT</strong>
    </div>
  `;

  const menuButton = topbar.querySelector("[data-menu-toggle]");
  const sidebar = document.querySelector("[data-sidebar]");
  if (menuButton && sidebar) {
    menuButton.addEventListener("click", () => sidebar.classList.toggle("open"));
  }
}

function renderDashboard(user) {
  const balance = document.querySelector("[data-balance]");
  const activity = document.querySelector("[data-activity]");
  const levelNote = document.querySelector("[data-level-note]");
  const team = document.querySelector("[data-team]");
  const bonus = document.querySelector("[data-bonus]");
  const rank = document.querySelector("[data-rank]");
  const progress = document.querySelector("[data-progress]");
  const progressText = document.querySelector("[data-progress-text]");
  const refLink = document.querySelector("[data-ref-link]");
  const recentList = document.querySelector("[data-recent-list]");
  const activeLevels = Math.max(0, Math.min(20, Math.floor(Number(user.activity || 0) / 100)));

  if (balance) balance.textContent = formatUsdt(user.balance);
  if (activity) activity.textContent = `${Number(user.activity || 0).toFixed(0)} USDT`;
  if (levelNote) levelNote.textContent = `${activeLevels} niveau${activeLevels > 1 ? "x" : ""} actif${activeLevels > 1 ? "s" : ""}`;
  if (team) team.textContent = Number(user.team || 0);
  if (bonus) bonus.textContent = formatUsdt(user.bonus);
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
  const withdrawAmount = document.querySelector("[data-withdraw-amount]");
  const depositConversion = document.querySelector("[data-deposit-conversion]");
  const withdrawConversion = document.querySelector("[data-withdraw-conversion]");
  const depositLocalAmount = document.querySelector("[data-deposit-local-amount]");
  const withdrawLocalAmount = document.querySelector("[data-withdraw-local-amount]");

  function updateDepositConversion() {
    if (depositConversion) depositConversion.hidden = true;
    const amount = Number(depositAmount?.value || 0);
    if (depositLocalAmount) depositLocalAmount.textContent = formatXaf(amount * DEPOSIT_MOBILE_RATE);
  }

  function updateWithdrawConversion() {
    if (withdrawConversion) withdrawConversion.hidden = true;
    const amount = Number(withdrawAmount?.value || 0);
    if (withdrawLocalAmount) withdrawLocalAmount.textContent = formatXaf(amount * WITHDRAW_MOBILE_RATE);
  }

  function updateDepositTarget() {
    const method = depositMethod?.value || "bep20";
    const target = user.paymentTargets?.[method];

    if (targetLabel) targetLabel.textContent = target?.label || "Coordonnees de depot indisponibles";
    if (targetValue) targetValue.textContent = target?.value || "Indisponible";
    if (targetNote) targetNote.textContent = target?.note || "Connectez le backend pour charger les coordonnees officielles.";
    updateDepositConversion();
  }

  function updateWithdrawFields() {
    if (receiveCrypto) receiveCrypto.hidden = false;
    if (receiveMobile) receiveMobile.hidden = true;
    updateWithdrawConversion();
  }

  depositMethod?.addEventListener("change", updateDepositTarget);
  withdrawMethod?.addEventListener("change", updateWithdrawFields);
  depositAmount?.addEventListener("input", updateDepositConversion);
  withdrawAmount?.addEventListener("input", updateWithdrawConversion);
  updateDepositTarget();
  updateWithdrawFields();
}

function renderPlans(user) {
  const list = document.querySelector("[data-plans-list]");
  if (!list) return;

  list.innerHTML = plans.map((plan) => `
    <article class="${plan.featured ? "featured" : ""}">
      <span class="plan-tier">${plan.tier}</span>
      <h2>${plan.name}</h2>
      <strong>${plan.amount}</strong>
      <div class="plan-metrics">
        <small><span>Objectif quotidien</span>${plan.daily}</small>
        <small><span>Duree du cycle</span>${plan.duration}</small>
        <small><span>Objectif cycle</span>${plan.cycle}</small>
      </div>
      <p>${plan.note}</p>
      <small>Solde disponible: ${formatUsdt(user.balance)} - Activite actuelle: ${Number(user.activity || 0).toFixed(0)} USDT</small>
      <label class="plan-investment-input">
        Montant a investir
        <input type="number" min="10" step="0.01" value="${plan.minAmount}" data-plan-amount>
      </label>
      <button class="btn primary" type="button" data-plan="${escapeHtml(plan.name)}" data-plan-min="${plan.minAmount}">Activer</button>
    </article>
  `).join("");
}

function renderNetwork(user) {
  const levelsList = document.querySelector("[data-levels-list]");
  const partnersList = document.querySelector("[data-direct-partners-list]");
  const partnersCount = document.querySelector("[data-direct-partners-count]");
  const refLink = document.querySelector("[data-ref-link]");
  const activeLevels = Math.max(0, Math.min(20, Math.floor(Number(user.activity || 0) / 100)));

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

function renderAdmin(user) {
  if (user.role !== "admin") return;
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

  const depositTotal = adminTransactions
    .filter((item) => item.type === "Depot")
    .reduce((total, item) => total + Math.abs(Number(item.rawAmount || String(item.amount).replace(/[^\d.-]/g, ""))), 0);
  const withdrawalTotal = adminTransactions
    .filter((item) => item.type === "Retrait")
    .reduce((total, item) => total + Math.abs(Number(item.rawAmount || String(item.amount).replace(/[^\d.-]/g, ""))), 0);

  const adminDeposits = document.querySelector("[data-admin-deposits]");
  const adminWithdrawals = document.querySelector("[data-admin-withdrawals]");
  const adminTx = document.querySelector("[data-admin-tx]");
  const adminTeam = document.querySelector("[data-admin-team]");
  const pendingDepositsCount = document.querySelector("[data-pending-deposits-count]");
  const pendingWithdrawalsCount = document.querySelector("[data-pending-withdrawals-count]");
  const cicoRequestsCount = document.querySelector("[data-cico-requests-count]");
  const merchantApplicationsCount = document.querySelector("[data-merchant-applications-count]");
  const disputesCount = document.querySelector("[data-disputes-count]");
  const adminUsersCount = document.querySelector("[data-admin-users-count]");

  if (adminDeposits) adminDeposits.textContent = formatUsdt(depositTotal);
  if (adminWithdrawals) adminWithdrawals.textContent = formatUsdt(withdrawalTotal);
  if (adminTx) adminTx.textContent = adminTransactions.length;
  if (adminTeam) adminTeam.textContent = Number(user.team || 0);
  if (pendingDepositsCount) pendingDepositsCount.textContent = pendingDeposits.length;
  if (pendingWithdrawalsCount) pendingWithdrawalsCount.textContent = pendingWithdrawals.length;
  if (cicoRequestsCount) cicoRequestsCount.textContent = user.cicoRequests.length;
  if (merchantApplicationsCount) merchantApplicationsCount.textContent = user.merchantApplications.length;
  if (disputesCount) disputesCount.textContent = user.disputes.length;
  if (adminUsersCount) adminUsersCount.textContent = Array.isArray(user.adminUsers) ? user.adminUsers.length : 0;

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
  });
  renderAdminUsers(filteredAdminUsers);

  document.querySelectorAll("[data-admin-control]").forEach((control) => {
    control.checked = Boolean(platformControls[control.dataset.adminControl]);
  });

  document.querySelectorAll("[data-admin-filter]").forEach((field) => {
    if (field.dataset.boundAdminFilter) return;
    field.dataset.boundAdminFilter = "true";
    field.addEventListener("input", () => renderAdmin(user));
  });
}

function renderAdminUsers(users) {
  const list = document.querySelector("[data-admin-users]");
  if (!list) return;

  list.innerHTML = users.length ? users.map((item) => {
    const isBlocked = item.status === "blocked";
    const nextRole = item.role === "admin" ? "user" : "admin";
    return `
      <div class="queue-row user-row">
        <span>${escapeHtml(item.fullName || item.email)}<small>${escapeHtml(item.email)} - ${escapeHtml(item.role)} - ${escapeHtml(item.status)} - ${formatUsdt(item.balance)}</small></span>
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

  list.innerHTML = rows.length ? rows.map((item) => `
    <div class="queue-row">
      <span>${escapeHtml(item.description)}<small>${escapeHtml(item.userEmail || "")} - ${escapeHtml(item.date)} - Réf. ${escapeHtml(item.reference || item.id || "")}${item.metadata?.txRef ? ` - TX ${escapeHtml(item.metadata.txRef)}` : ""}</small></span>
      <strong>${escapeHtml(item.amount)}</strong>
      ${options.proof && item.hasProof ? `<button class="btn secondary" type="button" data-admin-proof="${escapeHtml(item.id || item.reference || "")}">Capture</button>` : ""}
      <button class="btn primary" type="button" data-admin-approve="${escapeHtml(item.id || item.reference || "")}">Valider</button>
      <button class="btn secondary" type="button" data-admin-reject="${escapeHtml(item.id || item.reference || "")}">Rejeter</button>
    </div>
  `).join("") : `<p class="muted">Aucune demande en attente.</p>`;
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
    <div>
      <span>${escapeHtml(item.reference)}<small>${exchangeTypeLabel(item.type)} - ${escapeHtml(item.customerEmail)} - ${escapeHtml(item.paymentMethod)} - ${escapeHtml(item.status)}</small></span>
      <strong>${formatUsdt(item.amount)}</strong>
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

function setupAuthForms() {
  const loginForm = document.querySelector("[data-login-form]");
  const registerForm = document.querySelector("[data-register-form]");
  const forgotPasswordForm = document.querySelector("[data-forgot-password-form]");
  const resetPasswordForm = document.querySelector("[data-reset-password-form]");
  const resetToken = new URLSearchParams(window.location.search).get("token");

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

      if (!email || password.length < 10) {
        showToast("Renseignez un email et un mot de passe d'au moins 10 caractères.", "error");
        restoreButton();
        return;
      }

      try {
        const response = await apiJson("/auth/register", { email, password });
        setAuthToken(response.token);
        window.location.href = "/dashboard";
      } catch (error) {
        restoreButton();
        showToast(error.message, "error");
      }
    });
  }

  if (forgotPasswordForm && resetPasswordForm && resetToken) {
    forgotPasswordForm.hidden = true;
    resetPasswordForm.hidden = false;
    resetPasswordForm.querySelector('[name="token"]').value = resetToken;
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
        showToast(response.message || "Lien envoye si le compte existe.");
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
      const password = String(data.password || "");

      if (!data.token || password.length < 10) {
        showToast("Lien invalide ou mot de passe trop court.", "error");
        restoreButton();
        return;
      }

      try {
        const response = await apiJson("/auth/reset-password", { token: data.token, password });
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

  document.querySelector("[data-export]")?.addEventListener("click", async () => {
    try {
      const response = await apiRequest("/transactions/export");
      if (response.url) window.location.href = response.url;
      else showToast("Export prepare.");
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  const depositForm = document.querySelector("[data-deposit-form]");
  if (depositForm && !depositForm.dataset.boundDeposit) {
    depositForm.dataset.boundDeposit = "true";
    depositForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formError = firstFormError(event.currentTarget);
    if (formError) {
      showToast(formError, "error");
      return;
    }
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Traitement...");
    try {
      const response = await apiRequest("/deposits", {
        method: "POST",
        headers: authHeaders(),
        body: new FormData(event.currentTarget)
      });
      if (response.reference) showCicoReference(response.reference, "Depot", response.amount, response.fee || 0);
      showToast("Demande de depot enregistree. Elle est visible dans vos transactions.");
      event.currentTarget.reset();
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
    const formError = firstFormError(event.currentTarget);
    if (formError) {
      showToast(formError, "error");
      return;
    }
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Traitement...");
    try {
      const response = await apiJson("/withdrawals", formToObject(event.currentTarget));
      if (response.reference) showCicoReference(response.reference, "Retrait", response.amount, response.fee || 0);
      showToast("Demande de retrait soumise. Elle est visible dans vos transactions.");
      event.currentTarget.reset();
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
      const response = await apiJson("/plans/activate", { amount });
      showToast(`Activation ${formatUsdt(amount)} - ${response.activePlan?.name || "plan"} soumise.`);
      const freshUser = await loadCurrentUser();
      renderProtectedShell(document.body.dataset.page, freshUser);
    } catch (error) {
      restoreButton();
      showToast(error.message, "error");
      return;
    }
    restoreButton();
  });

  const p2pForm = document.querySelector("[data-p2p-form]");
  if (p2pForm && !p2pForm.dataset.boundSubmit) p2pForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Envoi...");
    try {
      await apiJson("/p2p-transfers", formToObject(event.currentTarget));
      showToast("Transfert P2P envoye.");
    } catch (error) {
      restoreButton();
      showToast(error.message, "error");
      return;
    }
    restoreButton();
  });
  if (p2pForm) p2pForm.dataset.boundSubmit = "true";

  const cicoForm = document.querySelector("[data-cico-form]");
  if (cicoForm && !cicoForm.dataset.boundSubmit) cicoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const operation = event.currentTarget.querySelector("[name='operation']")?.value || "Depot";
    const amount = Number(event.currentTarget.querySelector("[name='amount']")?.value || 0);
    if (operation === "Retrait" && amount < 10) {
      showToast("Montant minimum retrait: 10 USDT.", "error");
      return;
    }
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Creation...");
    try {
      const response = await apiJson("/cico-requests", formToObject(event.currentTarget));
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
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Envoi...");
    try {
      await apiJson("/merchant/applications", formToObject(event.currentTarget));
      event.currentTarget.reset();
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
    const data = formToObject(event.currentTarget);
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
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Publication...");
    try {
      await apiJson("/exchange/ads", data);
      event.currentTarget.reset();
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
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Envoi...");
    try {
      await apiJson("/disputes", formToObject(event.currentTarget));
      event.currentTarget.reset();
      showToast("Litige envoye au support.");
    } catch (error) {
      restoreButton();
      showToast(error.message, "error");
      return;
    }
    restoreButton();
  });
  if (disputeForm) disputeForm.dataset.boundSubmit = "true";

  bindClickOnce("[data-admin-pending-deposits]", handleAdminClick);
  bindClickOnce("[data-admin-pending-withdrawals]", handleAdminClick);
  bindClickOnce("[data-admin-merchant-applications]", handleAdminClick);
  bindClickOnce("[data-admin-disputes]", handleAdminClick);
  bindClickOnce("[data-admin-users]", handleAdminClick);

  const adminCreateUserForm = document.querySelector("[data-admin-create-user-form]");
  if (adminCreateUserForm && !adminCreateUserForm.dataset.boundSubmit) adminCreateUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Creation...");
    const data = formToObject(event.currentTarget);
    try {
      await apiJson("/admin/actions", {
        action: "user-create",
        fullName: String(data.fullName || "").trim(),
        email: String(data.email || "").trim().toLowerCase(),
        password: String(data.password || ""),
        role: data.role || "user"
      });
      event.currentTarget.reset();
      const freshUser = await loadCurrentUser();
      renderAdmin(freshUser);
      showToast("Compte cree par admin.");
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreButton();
    }
  });
  if (adminCreateUserForm) adminCreateUserForm.dataset.boundSubmit = "true";

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
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Recherche...");
    const reference = String(new FormData(event.currentTarget).get("reference") || "").trim().toUpperCase();
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
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Transfert...");
    try {
      await apiJson("/merchant/transfers", formToObject(event.currentTarget));
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
    const submitButton = event.currentTarget.querySelector('button[type="submit"]');
    const restoreButton = setButtonLoading(submitButton, "Recherche...");
    const reference = String(new FormData(event.currentTarget).get("reference") || "").trim().toUpperCase();
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

function showCicoReference(reference, operation, amount, fee) {
  const output = document.querySelector("[data-cico-reference-output]");
  const refValue = document.querySelector("[data-cico-reference]");
  const refSummary = document.querySelector("[data-cico-reference-summary]");
  if (!output || !refValue || !refSummary) return;

  refValue.textContent = reference;
  refSummary.textContent = `${operation}: ${formatUsdt(amount)}${fee ? ` + ${formatUsdt(fee)} de frais` : " sans frais"}.`;
  output.hidden = false;

  document.querySelectorAll(".merchant-card a[href^='https://wa.me/']").forEach((link) => {
    const phone = link.href.split("?")[0];
    const text = encodeURIComponent(`Bonjour, voici ma reference AFRIX Money: ${reference}. Operation: ${operation} ${formatUsdt(amount)}.`);
    link.href = `${phone}?text=${text}`;
  });
}

async function handleAdminClick(event) {
  const proofButton = event.target.closest("[data-admin-proof]");
  if (proofButton) {
    const restoreProof = setButtonLoading(proofButton, "Ouverture...");
    try {
      const proof = await apiRequest(`/admin/deposits/${encodeURIComponent(proofButton.dataset.adminProof)}/proof`);
      const proofWindow = window.open("", "_blank", "noopener,noreferrer");
      if (proofWindow) {
        proofWindow.document.write(`
          <!doctype html>
          <html lang="fr">
          <head><meta charset="utf-8"><title>Capture dépôt ${escapeHtml(proof.id || "")}</title></head>
          <body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh;">
            <img src="${proof.dataUrl}" alt="Capture dépôt" style="max-width:100%;max-height:100vh;object-fit:contain;">
          </body>
          </html>
        `);
        proofWindow.document.close();
      } else {
        window.location.href = proof.dataUrl;
      }
    } catch (error) {
      showToast(error.message, "error");
    } finally {
      restoreProof();
    }
    return;
  }

  const action = event.target.closest("[data-admin-approve], [data-admin-reject], [data-merchant-approve], [data-merchant-reject], [data-merchant-fund], [data-dispute-close], [data-admin-user-suspend], [data-admin-user-reactivate], [data-admin-user-role]");
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
  const [datasetKey, actionName] = actionMap.find(([key]) => action.dataset[key] !== undefined) || [];
  const id = datasetKey ? action.dataset[datasetKey] : "";
  if (!actionName || !id) {
    showToast("Action admin invalide.", "error");
    return;
  }
  const amountInput = action.closest(".queue-row")?.querySelector("[data-merchant-fund-amount]");
  const amount = amountInput ? Number(amountInput.value || 0) : undefined;
  const role = action.dataset.role;
  const restoreButton = setButtonLoading(action, "...");

  try {
    await apiJson("/admin/actions", { action: actionName, id, ...(amount ? { amount } : {}), ...(role ? { role } : {}) });
    const freshUser = await loadCurrentUser();
    renderAdmin(freshUser);
    showToast("Action admin enregistree.");
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
  renderPlans(user);
  renderNetwork(user);
  renderExchange(user);
  renderMerchants(user);
  renderAdmin(user);
  setupActions(user);
}

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;
  const isProtected = document.body.matches("[data-protected]");

  setupAuthForms();

  if (!isProtected) return;

  renderSidebar(page);
  renderTopbar(page);

  if (!getAuthToken()) {
    window.location.href = "/login";
    return;
  }

  try {
    const user = await loadCurrentUser();
    if (page === "admin" && user.role !== "admin") {
      window.location.href = "/dashboard";
      return;
    }
    renderProtectedShell(page, user);
  } catch (error) {
    showLoadError(error.message);
  }
});
