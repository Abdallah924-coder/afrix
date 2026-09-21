export function roundAmount(value, precision = 2) {
  return Number(Number(value || 0).toFixed(precision));
}

export function money(value) {
  return roundAmount(value, 2);
}

export function buildPlatformSummary(transactions = []) {
  const completedOrActive = transactions.filter((tx) => tx.status === "Completed" || tx.status === "Active");
  const deposits = transactions.filter((tx) => tx.type === "Depot");
  const withdrawals = transactions.filter((tx) => tx.type === "Retrait");
  const byStatus = (rows, status) => rows.filter((tx) => tx.status === status);
  const sumAmount = (rows) => money(rows.reduce((total, tx) => total + Math.abs(Number(tx.amount || 0)), 0));
  const sumFees = (rows) => money(rows.reduce((total, tx) => total + Number(tx.metadata?.fee || 0), 0));
  const platformRevenue = money(completedOrActive.reduce((total, tx) => {
    if (tx.type === "Retrait") return total + Number(tx.metadata?.fee || 0);
    if (tx.type === "P2P" && tx.displayAmount?.startsWith("-")) return total + Number(tx.metadata?.fee || 0);
    return total;
  }, 0));

  return {
    transactions: {
      total: transactions.length,
      completed: byStatus(transactions, "Completed").length,
      pending: byStatus(transactions, "Pending").length,
      rejected: byStatus(transactions, "Rejected").length,
      active: byStatus(transactions, "Active").length,
      volume: sumAmount(completedOrActive)
    },
    deposits: {
      total: deposits.length,
      pending: byStatus(deposits, "Pending").length,
      completed: byStatus(deposits, "Completed").length,
      rejected: byStatus(deposits, "Rejected").length,
      completedAmount: sumAmount(byStatus(deposits, "Completed")),
      rejectedAmount: sumAmount(byStatus(deposits, "Rejected")),
      pendingAmount: sumAmount(byStatus(deposits, "Pending"))
    },
    withdrawals: {
      total: withdrawals.length,
      pending: byStatus(withdrawals, "Pending").length,
      completed: byStatus(withdrawals, "Completed").length,
      rejected: byStatus(withdrawals, "Rejected").length,
      completedAmount: sumAmount(byStatus(withdrawals, "Completed")),
      rejectedAmount: sumAmount(byStatus(withdrawals, "Rejected")),
      pendingAmount: sumAmount(byStatus(withdrawals, "Pending")),
      fees: sumFees(withdrawals)
    },
    platformRevenue
  };
}

export function parseAdminPagination(query = {}, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function buildAdminPaginatedResponse(items, total, page, limit) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages
    }
  };
}

export function canViewTransaction(user, tx, capabilities = {}) {
  if (!user || !tx) return false;
  if (tx.type === "Commission") {
    return Boolean(capabilities.canUseBackoffice || (tx.userId === user.id && capabilities.canViewCommissionSummary));
  }
  return Boolean(user.role === "admin" || tx.userId === user.id);
}

export function buildAdminStats(db = {}) {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setUTCDate(startOfDay.getUTCDate() - 6);
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const userCreatedAt = (user) => new Date(user.createdAt || 0).getTime();
  const transactions = Array.isArray(db.transactions) ? db.transactions : [];
  const users = Array.isArray(db.users) ? db.users : [];
  const activePlans = users.flatMap((user) => (user.activePlans || []).filter((plan) => plan.status === "active" || plan.status === "dividend"));
  const activeEtfs = users.flatMap((user) => (user.activeEtfs || []).filter((item) => item.status === "active" || item.status === "matured"));
  const completedTransactions = transactions.filter((tx) => tx.status === "Completed" || tx.status === "Active");
  const platformRevenue = completedTransactions.reduce((total, tx) => {
    if (tx.type === "Retrait") return total + Number(tx.metadata?.fee || 0);
    if (tx.type === "P2P" && tx.displayAmount?.startsWith("-")) return total + Number(tx.metadata?.fee || 0);
    return total;
  }, 0);
  const countries = new Set(users.map((user) => String(user.country || "").trim()).filter(Boolean));

  return {
    totalUsers: users.length,
    newUsersToday: users.filter((user) => userCreatedAt(user) >= startOfDay.getTime()).length,
    newUsersWeek: users.filter((user) => userCreatedAt(user) >= startOfWeek.getTime()).length,
    newUsersMonth: users.filter((user) => userCreatedAt(user) >= startOfMonth.getTime()).length,
    activeUsers: users.filter((user) => (user.status || "active") === "active").length,
    activePlansCount: activePlans.length + activeEtfs.length,
    usersWithActivePlans: users.filter((user) => (user.activePlans || []).some((plan) => plan.status === "active" || plan.status === "dividend") || (user.activeEtfs || []).some((item) => item.status === "active" || item.status === "matured")).length,
    investedCapital: money(activePlans.reduce((total, plan) => total + Number(plan.amount || 0), 0) + activeEtfs.reduce((total, item) => total + Number(item.amount || 0), 0)),
    transactionVolume: money(completedTransactions.reduce((total, tx) => total + Math.abs(Number(tx.amount || 0)), 0)),
    platformRevenue: money(platformRevenue),
    partners: users.filter((user) => user.referrerId).length,
    approvedMerchants: users.filter((user) => String(user.merchantProfile?.status || "").trim().toLowerCase() === "approved").length,
    activeCountries: countries.size
  };
}

export function compactAdminUser(user = {}) {
  const activePlans = Array.isArray(user.activePlans) ? user.activePlans : [];
  const activeStakes = Array.isArray(user.activeStakes) ? user.activeStakes : [];
  const activeFounders = Array.isArray(user.activeFounders) ? user.activeFounders : [];
  const activeEtfs = Array.isArray(user.activeEtfs) ? user.activeEtfs : [];
  return {
    id: user.id,
    fullName: user.fullName || user.email,
    email: user.email,
    country: user.country || "",
    wallet: user.wallet || "",
    role: user.role || "user",
    status: user.status || "active",
    ausdBalance: money(user.ausdBalance),
    balance: money(user.balance),
    grsBalance: money(user.grsBalance),
    reservedBalance: money(user.reservedBalance),
    activity: money(user.activity),
    bonus: money(user.bonus),
    refCode: user.refCode || "",
    referrerId: user.referrerId || "",
    referrerEmail: user.referrerEmail || "",
    referrerCode: user.referrerCode || "",
    bonusLevelsOverride: Number(user.bonusLevelsOverride || 0),
    activePlansCount: activePlans.filter((plan) => plan.status === "active" || plan.status === "dividend").length,
    activeStakesCount: activeStakes.filter((stake) => stake.status === "active").length,
    activeFoundersCount: activeFounders.filter((item) => item.status === "active").length,
    activeEtfsCount: activeEtfs.filter((item) => item.status === "active" || item.status === "matured").length,
    activeInvestmentAmount: money(activePlans.filter((plan) => plan.status === "active" || plan.status === "dividend").reduce((total, plan) => total + Number(plan.amount || 0), 0)),
    activeStakeAmount: money(activeStakes.filter((stake) => stake.status === "active").reduce((total, stake) => total + Number(stake.amount || 0), 0)),
    activeFounderAmount: money(activeFounders.filter((item) => item.status === "active").reduce((total, item) => total + Number(item.amount || 0), 0)),
    activeEtfAmount: money(activeEtfs.filter((item) => item.status === "active" || item.status === "matured").reduce((total, item) => total + Number(item.amount || 0), 0)),
    merchantStatus: user.merchantProfile?.status || "Aucun profil",
    createdAt: user.createdAt || ""
  };
}

export function adminProgramStatsFromUsers(users = []) {
  const activeTrading = users.flatMap((user) => (user.activePlans || [])
    .filter((plan) => plan.status === "active")
    .map((plan) => ({ ...plan, userId: user.id, userEmail: user.email, userName: user.fullName || user.email })));
  const allTrading = users.flatMap((user) => (user.activePlans || [])
    .map((plan) => ({ ...plan, userId: user.id, userEmail: user.email, userName: user.fullName || user.email })));
  const activeStaking = users.flatMap((user) => (user.activeStakes || [])
    .filter((stake) => stake.status === "active")
    .map((stake) => ({ ...stake, userId: user.id, userEmail: user.email, userName: user.fullName || user.email })));
  const allStaking = users.flatMap((user) => (user.activeStakes || [])
    .map((stake) => ({ ...stake, userId: user.id, userEmail: user.email, userName: user.fullName || user.email })));
  const activeFounders = users.flatMap((user) => (user.activeFounders || [])
    .filter((item) => item.status === "active")
    .map((item) => ({ ...item, userId: user.id, userEmail: user.email, userName: user.fullName || user.email })));
  const allFounders = users.flatMap((user) => (user.activeFounders || [])
    .map((item) => ({ ...item, userId: user.id, userEmail: user.email, userName: user.fullName || user.email })));
  const activeEtfs = users.flatMap((user) => (user.activeEtfs || [])
    .filter((item) => item.status === "active" || item.status === "matured")
    .map((item) => ({ ...item, userId: user.id, userEmail: user.email, userName: user.fullName || user.email })));
  const allEtfs = users.flatMap((user) => (user.activeEtfs || [])
    .map((item) => ({ ...item, userId: user.id, userEmail: user.email, userName: user.fullName || user.email })));

  return {
    trading: {
      activeCount: activeTrading.length,
      totalCount: allTrading.length,
      activeCapital: money(activeTrading.reduce((total, plan) => total + Number(plan.amount || 0), 0)),
      totalEarned: money(allTrading.reduce((total, plan) => total + Number(plan.earnedAmount || 0), 0))
    },
    staking: {
      activeCount: activeStaking.length,
      totalCount: allStaking.length,
      activeLocked: money(activeStaking.reduce((total, stake) => total + Number(stake.amount || 0), 0)),
      totalEarned: money(allStaking.reduce((total, stake) => total + Number(stake.earnedAmount || 0), 0))
    },
    founders: {
      activeCount: activeFounders.length,
      totalCount: allFounders.length,
      activeLocked: money(activeFounders.reduce((total, item) => total + Number(item.amount || 0), 0)),
      totalReward: money(allFounders.reduce((total, item) => total + Number(item.rewardAmount || 0), 0))
    },
    etf: {
      activeCount: activeEtfs.length,
      totalCount: allEtfs.length,
      activeCapital: money(activeEtfs.reduce((total, item) => total + Number(item.amount || 0), 0)),
      totalDividends: money(allEtfs.reduce((total, item) => total + Number(item.dividendAmount || 0), 0))
    }
  };
}

export function transactionStatusSummary(rows = []) {
  const items = Array.isArray(rows) ? rows : Array.isArray(rows?.rows) ? rows.rows : [];
  const summary = { total: 0, pending: 0, completed: 0, rejected: 0, active: 0, rows: [] };

  items.forEach((row) => {
    const status = String(row?.status ?? row?._id ?? "").trim();
    const key = status.toLowerCase();
    const countValue = Number(row?.count ?? row?.total ?? 1);
    const count = Number.isFinite(countValue) && countValue > 0 ? countValue : 1;

    summary.total += count;
    if (key === "pending") summary.pending += count;
    if (key === "completed") summary.completed += count;
    if (key === "rejected") summary.rejected += count;
    if (key === "active") summary.active += count;
  });

  summary.rows = items.map((row) => ({
    status: row?._id || row?.status || "",
    count: Number(row?.count ?? row?.total ?? 0),
    amount: money(Number(row?.amount || 0))
  }));

  return summary;
}

export function transactionExportSummary(rows = []) {
  return {
    total: rows.length,
    completed: rows.filter((tx) => tx.status === "Completed").length,
    pending: rows.filter((tx) => tx.status === "Pending").length,
    rejected: rows.filter((tx) => tx.status === "Rejected").length,
    volume: money(rows.reduce((total, tx) => total + Math.abs(Number(tx.amount || 0)), 0))
  };
}
