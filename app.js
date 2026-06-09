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
  ]
};

const pageTitles = {
  dashboard: "Tableau de bord",
  wallet: "Wallet USDT",
  transactions: "Historique",
  login: "Connexion",
  register: "Inscription"
};

const navItems = [
  ["dashboard", "Dashboard", "dashboard.html"],
  ["wallet", "Wallet USDT", "wallet.html"],
  ["transactions", "Transactions", "transactions.html"]
];

const DEPOSIT_MOBILE_RATE = 650;
const WITHDRAW_MOBILE_RATE = 550;

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

function setupAuthForms() {
  const loginForm = document.querySelector("[data-login-form]");
  const registerForm = document.querySelector("[data-register-form]");

  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      setUser({ email: formData.get("email") || mockUser.email });
      window.location.href = "dashboard.html";
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(registerForm);
      setUser({
        fullName: formData.get("fullName") || mockUser.fullName,
        email: formData.get("email") || mockUser.email,
        refCode: formData.get("refCode") || mockUser.refCode
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
}

document.addEventListener("DOMContentLoaded", () => {
  const page = document.body.dataset.page;
  const user = ensureMockSession() || mockUser;

  renderSidebar(page);
  renderTopbar(page, user);
  renderDashboard(user);
  renderTransactions(user);
  renderWallet(user);
  setupAuthForms();
  setupActions(user);
});
