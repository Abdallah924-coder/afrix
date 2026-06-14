const STORAGE_KEY = "afrix_mock_user";

const mockUser = {
  fullName: "Partenaire AFRIX",
  email: "partenaire@afrix.capital",
  balance: 1240,
  activity: 500,
  team: 24,
  bonus: 185.5,
  rank: "Niveau 3",
  progress: 46,
  wallet: "TRX9AFRIX2026USDT001",
  paymentTargets: {
    trc20: {
      label: "Adresse de depot TRC20",
      value: "TRX9AFRIX2026USDT001",
      note: "Envoyez uniquement des USDT TRC20 vers cette adresse."
    },
    bep20: {
      label: "Adresse de depot BEP20",
      value: "BNB9AFRIX2026USDT002",
      note: "Envoyez uniquement des USDT BEP20 vers cette adresse."
    },
    mobile: {
      label: "Compte Mobile Money",
      value: "+242 06 000 2026",
      note: "Effectuez le paiement Mobile Money, puis renseignez la reference."
    },
    airtel: {
      label: "Compte Airtel Money",
      value: "+242 05 000 2026",
      note: "Effectuez le paiement Airtel Money, puis renseignez la reference."
    }
  },
  refCode: "AFX2026",
  refLink: "https://afrix.capital/ref/AFX2026",
  transactions: [
    { date: "2026-06-08", type: "Depot", description: "Depot wallet TRC20", amount: "+250.00 USDT", status: "Completed" },
    { date: "2026-06-07", type: "Bonus", description: "Bonus reseau niveau 2", amount: "+35.00 USDT", status: "Completed" },
    { date: "2026-06-06", type: "Plan", description: "Activation pack croissance", amount: "-500.00 USDT", status: "Active" },
    { date: "2026-06-05", type: "Retrait", description: "Demande de retrait USDT", amount: "-120.00 USDT", status: "Pending" }
  ],
  directPartners: [
    { fullName: "Grace Mbemba", email: "grace@example.com", activity: 160 },
    { fullName: "Junior Mavoungou", email: "junior@example.com", activity: 95 },
    { fullName: "Prisca Okemba", email: "prisca@example.com", activity: 310 }
  ],
  merchants: [
    { code: "AFX-MER-BZV-001", businessName: "AFRIX Agent Brazzaville", city: "Brazzaville", country: "Congo", methods: "MTN, Airtel, Cash", phone: "+242060002026", status: "Disponible", rating: "Nouveau", limits: "10 - 2 000 USDT", source: "merchant" },
    { code: "AFX-MER-PNR-002", businessName: "AFRIX Agent Pointe-Noire", city: "Pointe-Noire", country: "Congo", methods: "Airtel, Banque, Cash", phone: "+242050002026", status: "Disponible", rating: "Nouveau", limits: "20 - 1 500 USDT", source: "merchant" },
    { code: "AFX-MER-KIN-003", businessName: "AFRIX Agent Kinshasa", city: "Kinshasa", country: "RDC", methods: "Mobile Money, Cash", phone: "+243810002026", status: "Disponible", rating: "Nouveau", limits: "10 - 1 000 USDT", source: "merchant" }
  ],
  merchantWallet: {
    available: 860,
    pending: 200,
    bonus: 18.5,
    mainBalance: 1240
  },
  cicoRequests: [
    { reference: "AFX-WD-260614-200", type: "Retrait", customer: "client@example.com", country: "Congo", amount: 200, fee: 20, merchantBonus: 6, method: "Mobile Money", phone: "+242 06 111 2026", status: "En attente merchant" },
    { reference: "AFX-DP-260614-050", type: "Depot", customer: "client2@example.com", country: "Congo", amount: 50, fee: 0, merchantBonus: 0.25, method: "Airtel Money", phone: "+242 05 111 2026", status: "En attente merchant" }
  ],
  merchantApplications: [
    { businessName: "AFRIX Agent Dolisie", userEmail: "agent@example.com", city: "Dolisie", country: "Congo", phone: "+242060003030", guarantee: 1000, status: "pending" }
  ],
  disputes: [
    { reason: "Verification Cash Out", userEmail: "client@example.com", reference: "AFX-20260609", type: "CICO", status: "open" }
  ]
};

const pageTitles = {
  dashboard: "Tableau de bord",
  wallet: "Wallet USDT",
  "afrix-money": "AFRIX Money",
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
  ["dashboard", "Dashboard", "dashboard.html"],
  ["wallet", "Wallet USDT", "wallet.html"],
  ["afrix-money", "AFRIX Money", "afrix-money.html"],
  ["merchant", "Merchant", "merchant.html"],
  ["plans", "Plans", "plans.html"],
  ["network", "Reseau", "network.html"],
  ["elite", "Elite", "elite.html"],
  ["transactions", "Transactions", "transactions.html"],
  ["admin", "Admin", "admin.html"]
];

const DEPOSIT_MOBILE_RATE = 650;
const WITHDRAW_MOBILE_RATE = 550;
const bonusRates = [10, 5, 5, 5, 5, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const plans = [
  { tier: "Bronze", name: "Starter Plan", amount: "10 USDT", daily: "0,50%", duration: "90 jours", cycle: "jusqu'a 45%", note: "Ideal pour decouvrir progressivement l'ecosysteme." },
  { tier: "Silver", name: "Smart Plan", amount: "50 USDT", daily: "0,60%", duration: "180 jours", cycle: "jusqu'a 108%", note: "Adapte aux membres recherchant une strategie plus longue.", featured: true },
  { tier: "Gold", name: "Premium Plan", amount: "100 USDT", daily: "0,70%", duration: "270 jours", cycle: "jusqu'a 189%", note: "Concu pour les participants souhaitant renforcer leur engagement." },
  { tier: "Elite", name: "Elite Plan", amount: "100 USDT et plus", daily: "0,80%", duration: "365 jours", cycle: "jusqu'a 292%", note: "Destine aux partenaires et investisseurs ayant une vision long terme." }
];

const formatUsdt = (value) => `${Number(value).toFixed(2)} USDT`;
const formatXaf = (value) => `${Math.round(Number(value)).toLocaleString("fr-FR")} XAF`;

function getUser() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored);
    const merchantsAreCurrent = Array.isArray(parsed.merchants) && parsed.merchants.some((merchant) => merchant.code);

    return {
      ...mockUser,
      ...parsed,
      paymentTargets: { ...mockUser.paymentTargets, ...(parsed.paymentTargets || {}) },
      merchants: merchantsAreCurrent ? parsed.merchants : mockUser.merchants,
      merchantWallet: { ...mockUser.merchantWallet, ...(parsed.merchantWallet || {}) },
      cicoRequests: Array.isArray(parsed.cicoRequests) ? parsed.cicoRequests : mockUser.cicoRequests
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function setUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...mockUser, ...user }));
}

function ensureMockSession() {
  const body = document.body;
  if (!body.matches("[data-protected]")) return getUser();

  let user = getUser();
  if (!user) {
    setUser(mockUser);
    user = getUser();
  }

  return user;
}

function showToast(message, type = "info") {
  const oldToast = document.querySelector(".toast");
  if (oldToast) oldToast.remove();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === "error" ? "!" : "✓"}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" type="button" aria-label="Fermer">×</button>
  `;
  document.body.appendChild(toast);

  toast.querySelector("button").addEventListener("click", () => toast.remove());
  window.setTimeout(() => toast.remove(), 3200);
}

function renderSidebar(page) {
  const sidebar = document.querySelector("[data-sidebar]");
  if (!sidebar) return;

  sidebar.innerHTML = `
    <a class="brand" href="../index.html">
      <span class="brand-mark">A</span>
      <span><strong>AFRIX</strong><small>Capital Investment</small></span>
    </a>
    <nav class="nav">
      ${navItems.map(([key, label, href]) => `<a class="${page === key ? "active" : ""}" href="${href}">${label}</a>`).join("")}
    </nav>
    <div class="side-card">
      <span>Rang partenaire</span>
      <strong>Niveau 3</strong>
      <small>Progression Web3 active</small>
    </div>
  `;
}

function renderTopbar(page, user) {
  const topbar = document.querySelector("[data-topbar]");
  if (!topbar) return;

  topbar.innerHTML = `
    <button class="btn secondary menu-btn" type="button" data-menu-toggle>☰</button>
    <div class="topbar-title">
      <p>Wallet • Trading • Blockchain</p>
      <h1>${pageTitles[page] || "AFRIX"}</h1>
    </div>
    <div class="user-box">
      <span>${user.email}</span>
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

  if (balance) balance.textContent = formatUsdt(user.balance);
  if (activity) activity.textContent = `${user.activity} USDT`;
  if (levelNote) levelNote.textContent = "3 niveaux actives";
  if (team) team.textContent = user.team;
  if (bonus) bonus.textContent = formatUsdt(user.bonus);
  if (rank) rank.textContent = user.rank;
  if (progress) progress.style.width = `${user.progress}%`;
  if (progressText) progressText.textContent = "Encore 270 USDT d'activite pour atteindre le niveau suivant.";
  if (refLink) refLink.value = user.refLink;

  if (recentList) {
    recentList.innerHTML = user.transactions.slice(0, 3).map((item) => `
      <div>
        <span>${item.type}</span>
        <strong class="${item.amount.startsWith("+") ? "positive" : ""}">${item.amount}</strong>
        <small>${item.description}</small>
      </div>
    `).join("");
  }
}

function renderTransactions(user) {
  const table = document.querySelector("[data-transaction-table]");
  if (!table) return;

  table.innerHTML = user.transactions.map((item) => `
    <tr>
      <td>${item.date}</td>
      <td>${item.type}</td>
      <td>${item.description}</td>
      <td>${item.amount}</td>
      <td>${item.status}</td>
    </tr>
  `).join("");
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

  function isMobileMethod(method) {
    return method === "mobile" || method === "airtel";
  }

  function updateDepositConversion() {
    const method = depositMethod?.value || "trc20";
    const amount = Number(depositAmount?.value || 0);
    const showConversion = isMobileMethod(method);

    if (depositConversion) depositConversion.hidden = !showConversion;
    if (depositLocalAmount) depositLocalAmount.textContent = formatXaf(amount * DEPOSIT_MOBILE_RATE);
  }

  function updateWithdrawConversion() {
    const method = withdrawMethod?.value || "trc20";
    const amount = Number(withdrawAmount?.value || 0);
    const showConversion = isMobileMethod(method);

    if (withdrawConversion) withdrawConversion.hidden = !showConversion;
    if (withdrawLocalAmount) withdrawLocalAmount.textContent = formatXaf(amount * WITHDRAW_MOBILE_RATE);
  }

  function updateDepositTarget() {
    const method = depositMethod?.value || "trc20";
    const target = user.paymentTargets?.[method] || mockUser.paymentTargets.trc20;

    if (targetLabel) targetLabel.textContent = target.label;
    if (targetValue) targetValue.textContent = target.value;
    if (targetNote) targetNote.textContent = target.note;
    updateDepositConversion();
  }

  function updateWithdrawFields() {
    const method = withdrawMethod?.value || "trc20";
    const isCrypto = method === "trc20" || method === "bep20";

    if (receiveCrypto) receiveCrypto.hidden = !isCrypto;
    if (receiveMobile) receiveMobile.hidden = isCrypto;
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
      <small>Activite actuelle: ${Number(user.activity || 0).toFixed(0)} USDT</small>
      <button class="btn primary" type="button" data-plan="${plan.name}">Activer</button>
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

  if (refLink) refLink.value = user.refLink;
  if (partnersCount) partnersCount.textContent = user.directPartners?.length || 0;
  if (partnersList) {
    const partners = user.directPartners || [];
    partnersList.innerHTML = partners.length ? partners.map((partner) => `
      <div>
        <span>${partner.fullName}<small>${partner.email}</small></span>
        <strong>${partner.activity} USDT</strong>
      </div>
    `).join("") : `<p class="muted">Aucun partenaire direct pour le moment.</p>`;
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

  if (applicationStatus) applicationStatus.textContent = "Aucune demande";

  const wallet = user.merchantWallet || mockUser.merchantWallet;
  if (merchantWalletAvailable) merchantWalletAvailable.textContent = formatUsdt(wallet.available);
  if (merchantWalletPending) merchantWalletPending.textContent = formatUsdt(wallet.pending);
  if (merchantWalletBonus) merchantWalletBonus.textContent = formatUsdt(wallet.bonus);
  if (merchantMainBalance) merchantMainBalance.textContent = formatUsdt(wallet.mainBalance);

  const merchants = user.merchants || mockUser.merchants;
  const renderMerchantCards = (rows) => rows.length ? rows.map((merchant) => {
    const whatsAppMessage = encodeURIComponent(`Bonjour ${merchant.businessName}, je souhaite effectuer une operation AFRIX Money. Ma reference est AFX-...`);
    const whatsAppLink = `https://wa.me/${String(merchant.phone).replace(/[^\d]/g, "")}?text=${whatsAppMessage}`;
    return `
    <div class="merchant-card">
      <span>${merchant.businessName}<small>${merchant.city}, ${merchant.country} - ${merchant.methods} - WhatsApp merchant: ${merchant.phone} - ${merchant.limits}</small></span>
      <strong>${merchant.rating}</strong>
      <span class="badge">${merchant.status}</span>
      <a class="btn secondary" href="${whatsAppLink}" target="_blank" rel="noopener">WhatsApp</a>
    </div>
  `;
  }).join("") : `<p class="muted">Aucun merchant disponible pour cette recherche.</p>`;

  if (merchantList) merchantList.innerHTML = renderMerchantCards(merchants);
  if (merchantResults) merchantResults.innerHTML = renderMerchantCards(merchants.filter((merchant) => merchant.country.toLowerCase() === "congo"));
  if (merchantSearch && merchantResults) {
    merchantSearch.addEventListener("input", () => {
      const query = merchantSearch.value.trim().toLowerCase();
      const results = query
        ? merchants.filter((merchant) => merchant.country.toLowerCase().includes(query) || merchant.city.toLowerCase().includes(query))
        : merchants.filter((merchant) => merchant.country.toLowerCase() === "congo");
      merchantResults.innerHTML = renderMerchantCards(results);
    });
  }

  if (requestList) {
    const requests = user.cicoRequests || mockUser.cicoRequests;
    requestList.innerHTML = requests.map((item) => `
      <div>
        <span>${item.reference}<small>${item.type} ${item.method} - ${item.customer}</small></span>
        <strong>${formatUsdt(item.amount)}</strong>
      </div>
    `).join("");
  }
}

function renderAdmin(user) {
  const pendingDeposits = user.transactions.filter((item) => item.type === "Depot" && item.status === "Pending");
  const pendingWithdrawals = user.transactions.filter((item) => item.type === "Retrait" && item.status === "Pending");
  const merchantApplications = user.merchantApplications || mockUser.merchantApplications;
  const disputes = user.disputes || mockUser.disputes;
  const cicoRequests = user.cicoRequests || mockUser.cicoRequests;

  const depositTotal = user.transactions
    .filter((item) => item.type === "Depot")
    .reduce((total, item) => total + Number(String(item.amount).replace(/[^\d.-]/g, "")), 0);
  const withdrawalTotal = user.transactions
    .filter((item) => item.type === "Retrait")
    .reduce((total, item) => total + Math.abs(Number(String(item.amount).replace(/[^\d.-]/g, ""))), 0);

  const adminDeposits = document.querySelector("[data-admin-deposits]");
  const adminWithdrawals = document.querySelector("[data-admin-withdrawals]");
  const adminTx = document.querySelector("[data-admin-tx]");
  const adminTeam = document.querySelector("[data-admin-team]");
  const pendingDepositsCount = document.querySelector("[data-pending-deposits-count]");
  const pendingWithdrawalsCount = document.querySelector("[data-pending-withdrawals-count]");
  const merchantApplicationsCount = document.querySelector("[data-merchant-applications-count]");
  const disputesCount = document.querySelector("[data-disputes-count]");

  if (adminDeposits) adminDeposits.textContent = formatUsdt(depositTotal);
  if (adminWithdrawals) adminWithdrawals.textContent = formatUsdt(withdrawalTotal);
  if (adminTx) adminTx.textContent = user.transactions.length;
  if (adminTeam) adminTeam.textContent = user.team;
  if (pendingDepositsCount) pendingDepositsCount.textContent = cicoRequests.length;
  if (pendingWithdrawalsCount) pendingWithdrawalsCount.textContent = "Merchant";
  if (merchantApplicationsCount) merchantApplicationsCount.textContent = merchantApplications.length;
  if (disputesCount) disputesCount.textContent = disputes.length;

  renderQueue("[data-admin-pending-deposits]", pendingDeposits);
  renderQueue("[data-admin-pending-withdrawals]", pendingWithdrawals);
  renderCicoAdminRequests(cicoRequests);
  renderMerchantApplications(merchantApplications);
  renderDisputes(disputes);
}

function renderQueue(selector, rows) {
  const list = document.querySelector(selector);
  if (!list) return;

  list.innerHTML = rows.length ? rows.map((item, index) => `
    <div class="queue-row">
      <span>${item.description}<small>${item.date}</small></span>
      <strong>${item.amount}</strong>
      <button class="btn primary" type="button" data-admin-approve="${index}">Valider</button>
      <button class="btn secondary" type="button" data-admin-reject="${index}">Rejeter</button>
    </div>
  `).join("") : `<p class="muted">Aucune demande en attente.</p>`;
}

function renderCicoAdminRequests(rows) {
  const list = document.querySelector("[data-admin-cico-requests]");
  if (!list) return;

  list.innerHTML = rows.length ? rows.map((item) => `
    <div>
      <span>${item.reference}<small>${item.type} ${item.method} - ${item.country} - ${item.status}</small></span>
      <strong>${formatUsdt(item.amount)}</strong>
    </div>
  `).join("") : `<p class="muted">Aucune operation CICO merchant.</p>`;
}

function renderMerchantApplications(applications) {
  const list = document.querySelector("[data-admin-merchant-applications]");
  if (!list) return;

  list.innerHTML = applications.length ? applications.map((item, index) => `
    <div class="queue-row">
      <span>${item.businessName}<small>${item.userEmail} - ${item.city}, ${item.country}</small></span>
      <strong>${formatUsdt(item.guarantee)}</strong>
      <button class="btn primary" type="button" data-merchant-approve="${index}">Approuver</button>
      <button class="btn secondary" type="button" data-merchant-reject="${index}">Rejeter</button>
    </div>
  `).join("") : `<p class="muted">Aucune demande merchant en attente.</p>`;
}

function renderDisputes(disputes) {
  const list = document.querySelector("[data-admin-disputes]");
  if (!list) return;

  list.innerHTML = disputes.length ? disputes.map((item, index) => `
    <div class="queue-row">
      <span>${item.reason}<small>${item.userEmail} - ${item.reference}</small></span>
      <strong>${item.type}</strong>
      <button class="btn primary" type="button" data-dispute-close="${index}">Cloturer</button>
    </div>
  `).join("") : `<p class="muted">Aucun litige ouvert.</p>`;
}

function setupAuthForms() {
  const loginForm = document.querySelector("[data-login-form]");
  const registerForm = document.querySelector("[data-register-form]");

  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      const email = String(formData.get("email") || mockUser.email).trim().toLowerCase();
      const password = String(formData.get("password") || "").trim();

      if (!email || !password) {
        showToast("Email et mot de passe requis.", "error");
        return;
      }

      setUser({ email, password });
      window.location.href = "dashboard.html";
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      const email = String(formData.get("email") || mockUser.email).trim().toLowerCase();
      const password = String(formData.get("password") || "").trim();

      if (!email || password.length < 4) {
        showToast("Renseignez un email et un mot de passe d'au moins 4 caracteres.", "error");
        return;
      }

      setUser({
        fullName: email.split("@")[0] || mockUser.fullName,
        email,
        password
      });
      window.location.href = "dashboard.html";
    });
  }
}

function setupActions(user) {
  document.querySelector("[data-copy-ref]")?.addEventListener("click", () => {
    navigator.clipboard?.writeText(user.refLink);
    showToast("Lien de parrainage copie.");
  });

  document.querySelector("[data-copy-wallet]")?.addEventListener("click", () => {
    const activeTarget = document.querySelector("[data-deposit-target]")?.textContent || user.wallet;
    navigator.clipboard?.writeText(activeTarget);
    showToast("Coordonnees de depot copiees.");
  });

  document.querySelector("[data-export]")?.addEventListener("click", () => {
    showToast("Export CSV simule pour la maquette.");
  });

  document.querySelector("[data-deposit-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const method = String(formData.get("method") || "trc20");
    if (method === "mobile" || method === "airtel") {
      const amount = Number(formData.get("amount") || 0);
      const reference = createCicoReference("DP", amount);
      showCicoReference(reference, "Depot", amount, 0);
      showToast("Reference depot generee. Contactez un merchant disponible.");
      return;
    }
    showToast("Demande de depot crypto enregistree en mode maquette.");
  });

  document.querySelector("[data-withdraw-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const method = String(formData.get("method") || "trc20");
    const amount = Number(formData.get("amount") || 0);
    if (method === "mobile" || method === "airtel") {
      const reference = createCicoReference("WD", amount);
      showCicoReference(reference, "Retrait", amount, amount * 0.1);
      showToast("Reference retrait generee. Envoyez-la au merchant par WhatsApp.");
      return;
    }
    showToast("Demande de retrait crypto soumise en mode maquette.");
  });

  document.querySelector("[data-plans-list]")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-plan]");
    if (!button) return;
    showToast(`Activation du plan ${button.dataset.plan} USDT simulee.`);
  });

  document.querySelector("[data-p2p-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    showToast("Transfert P2P enregistre en mode maquette.");
  });

  document.querySelector("[data-cico-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const operation = String(formData.get("operation") || "Retrait");
    const amount = Number(formData.get("amount") || 0);
    const reference = createCicoReference(operation === "Depot" ? "DP" : "WD", amount);
    showCicoReference(reference, operation, amount, operation === "Depot" ? 0 : amount * 0.1);
    showToast("Reference CICO generee.");
  });

  document.querySelector("[data-merchant-application-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const businessName = String(formData.get("businessName") || "").trim();
    const country = String(formData.get("country") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const methods = String(formData.get("methods") || "").trim();
    const phone = String(formData.get("phone") || "").replace(/[^\d+]/g, "");
    const guarantee = Number(formData.get("guarantee") || 0);

    if (!businessName || !country || !city || !methods) {
      showToast("Completez les informations du merchant.", "error");
      return;
    }

    if (phone.length < 8) {
      showToast("Le numero WhatsApp du merchant est obligatoire.", "error");
      return;
    }

    const existingMerchants = user.merchants || mockUser.merchants;
    const merchant = {
      code: `AFX-MER-${Date.now().toString().slice(-6)}`,
      businessName,
      city,
      country,
      methods,
      phone,
      status: "Disponible",
      rating: "Nouveau",
      limits: `10 - ${Math.max(100, guarantee).toLocaleString("fr-FR")} USDT`,
      source: "merchant"
    };
    const nextUser = {
      ...user,
      merchants: [merchant, ...existingMerchants.filter((item) => item.phone !== phone)],
      merchantApplications: [
        {
          businessName,
          userEmail: user.email,
          city,
          country,
          phone,
          guarantee,
          status: "registered"
        },
        ...(user.merchantApplications || mockUser.merchantApplications)
      ]
    };

    setUser(nextUser);
    renderMerchants(nextUser);
    event.currentTarget.reset();
    showToast("Merchant enregistre. Son WhatsApp apparait maintenant dans la recherche.");
  });

  document.querySelector("[data-dispute-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    showToast("Litige envoye au support en mode maquette.");
  });

  document.querySelector("[data-admin-pending-deposits]")?.addEventListener("click", handleAdminClick);
  document.querySelector("[data-admin-pending-withdrawals]")?.addEventListener("click", handleAdminClick);
  document.querySelector("[data-admin-merchant-applications]")?.addEventListener("click", handleAdminClick);
  document.querySelector("[data-admin-disputes]")?.addEventListener("click", handleAdminClick);

  document.querySelector("[data-merchant-code-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const reference = String(formData.get("reference") || "").trim().toUpperCase();
    const request = (user.cicoRequests || mockUser.cicoRequests).find((item) => item.reference.toUpperCase() === reference);
    const result = document.querySelector("[data-merchant-code-result]");

    if (!request) {
      if (result) result.innerHTML = `<p class="muted">Reference introuvable ou deja traitee.</p>`;
      showToast("Reference introuvable.", "error");
      return;
    }

    if (result) {
      result.innerHTML = `
        <div class="merchant-code-card">
          <span>${request.reference}</span>
          <h2>${request.type} ${formatUsdt(request.amount)}</h2>
          <p>${request.customer} - ${request.method} - ${request.phone}</p>
          <div class="info-grid compact-info">
            <div><span>Frais client</span><strong>${formatUsdt(request.fee)}</strong></div>
            <div><span>Bonus merchant</span><strong>${formatUsdt(request.merchantBonus)}</strong></div>
          </div>
          <button class="btn primary full" type="button" data-merchant-confirm-code>Valider l'operation</button>
        </div>
      `;
      result.querySelector("[data-merchant-confirm-code]")?.addEventListener("click", () => {
        showToast("Operation validee: le solde client et le wallet merchant sont mis a jour en maquette.");
      });
    }
  });

  document.querySelector("[data-merchant-transfer-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    showToast("Transfert du wallet merchant vers le compte principal simule.");
  });
}

function createCicoReference(prefix, amount) {
  const date = new Date();
  const stamp = `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const cleanAmount = Math.max(0, Math.round(Number(amount || 0))).toString().padStart(3, "0");
  return `AFX-${prefix}-${stamp}-${cleanAmount}`;
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

function handleAdminClick(event) {
  const action = event.target.closest("[data-admin-approve], [data-admin-reject], [data-merchant-approve], [data-merchant-reject], [data-dispute-close]");
  if (!action) return;
  showToast("Action admin simulee en mode maquette.");
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  const user = ensureMockSession() || mockUser;

  renderSidebar(page);
  renderTopbar(page, user);
  renderDashboard(user);
  renderTransactions(user);
  renderWallet(user);
  renderPlans(user);
  renderNetwork(user);
  renderMerchants(user);
  renderAdmin(user);
  setupAuthForms();
  setupActions(user);
});
