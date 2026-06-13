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
    { businessName: "AFRIX Agent Brazzaville", city: "Brazzaville", country: "Congo", methods: "Cash, MTN, Airtel", phone: "+242 06 000 2026", status: "Approuve" }
  ],
  merchantApplications: [
    { businessName: "AFRIX Agent Pointe-Noire", userEmail: "agent@example.com", city: "Pointe-Noire", country: "Congo", guarantee: 100, status: "pending" }
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
    return { ...mockUser, ...JSON.parse(stored) };
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
  const applicationStatus = document.querySelector("[data-merchant-application-status]");

  if (applicationStatus) applicationStatus.textContent = "Aucune demande";
  if (!merchantList) return;

  const merchants = user.merchants || mockUser.merchants;
  merchantList.innerHTML = merchants.length ? merchants.map((merchant) => `
    <div class="merchant-card">
      <span>${merchant.businessName}<small>${merchant.city}, ${merchant.country} - ${merchant.methods}</small></span>
      <strong>${merchant.phone}</strong>
      <span class="badge">${merchant.status}</span>
    </div>
  `).join("") : `<p class="muted">Aucun merchant approuve pour le moment.</p>`;
}

function renderAdmin(user) {
  const pendingDeposits = user.transactions.filter((item) => item.type === "Depot" && item.status === "Pending");
  const pendingWithdrawals = user.transactions.filter((item) => item.type === "Retrait" && item.status === "Pending");
  const merchantApplications = user.merchantApplications || mockUser.merchantApplications;
  const disputes = user.disputes || mockUser.disputes;

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
  if (pendingDepositsCount) pendingDepositsCount.textContent = pendingDeposits.length;
  if (pendingWithdrawalsCount) pendingWithdrawalsCount.textContent = pendingWithdrawals.length;
  if (merchantApplicationsCount) merchantApplicationsCount.textContent = merchantApplications.length;
  if (disputesCount) disputesCount.textContent = disputes.length;

  renderQueue("[data-admin-pending-deposits]", pendingDeposits);
  renderQueue("[data-admin-pending-withdrawals]", pendingWithdrawals);
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
    showToast("Demande de depot enregistree en mode maquette.");
  });

  document.querySelector("[data-withdraw-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    showToast("Demande de retrait soumise en mode maquette.");
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
    showToast("Demande Merchant CICO enregistree en mode maquette.");
  });

  document.querySelector("[data-merchant-application-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    showToast("Demande merchant envoyee en mode maquette.");
  });

  document.querySelector("[data-dispute-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    showToast("Litige envoye au support en mode maquette.");
  });

  document.querySelector("[data-admin-pending-deposits]")?.addEventListener("click", handleAdminClick);
  document.querySelector("[data-admin-pending-withdrawals]")?.addEventListener("click", handleAdminClick);
  document.querySelector("[data-admin-merchant-applications]")?.addEventListener("click", handleAdminClick);
  document.querySelector("[data-admin-disputes]")?.addEventListener("click", handleAdminClick);
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
