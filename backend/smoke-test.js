import { spawn } from "child_process";
import { setTimeout as wait } from "timers/promises";
import { buildAdminPaginatedResponse, buildPlatformSummary, canViewTransaction, parseAdminPagination, roundAmount, money, buildAdminStats, compactAdminUser, adminProgramStatsFromUsers, transactionStatusSummary } from "./business-core.js";
import { normalizeFeeSettings, normalizeRate, splitActivationCommissions, splitPlatformRevenue, validateProofFile } from "./platform-core.js";

const PORT = Number(process.env.TEST_PORT || 4399);
const baseUrl = `http://127.0.0.1:${PORT}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer(child, logs) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before smoke tests with code ${child.exitCode}: ${logs.join("").trim()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/dashboard`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }
  throw new Error(`Server did not become ready: ${lastError?.message || "timeout"}. ${logs.join("").trim()}`);
}

async function request(path) {
  return fetch(`${baseUrl}${path}`, { redirect: "manual" });
}

async function run() {
  const child = spawn("node", ["backend/server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "development",
      AFRIX_TEST_SKIP_STORAGE_BOOT: "1",
      JWT_SECRET: "dev-only-change-this-secret-before-production",
      ADMIN_EMAIL: "",
      ADMIN_PASSWORD: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));

  try {
    await waitForServer(child, logs);

    const dashboard = await request("/dashboard");
    assert(dashboard.status === 200, "/dashboard should render");
    assert((dashboard.headers.get("content-security-policy") || "").includes("default-src 'self'"), "CSP header should be present");

    const resetPassword = await request("/reset-password");
    assert(resetPassword.status === 200, "/reset-password should render");

    const legacy = await request("/pages/dashboard.html");
    assert(legacy.status === 301, "legacy page URL should redirect");
    assert(legacy.headers.get("location") === "/dashboard", "legacy page URL should redirect to clean route");

    const appScript = await request("/app.js");
    assert(appScript.status === 200, "/app.js should be public");

    const revenueSplit = splitPlatformRevenue(1000, { platformRevenueAdminShare: 0.1, platformRevenueDeveloperShare: 0.1 });
    assert(revenueSplit.admin === 100, "admin revenue share should be 10%");
    assert(revenueSplit.developer === 100, "developer revenue share should be 10%");
    assert(revenueSplit.platform === 800, "platform keeps the remaining share");

    const activationSplit = splitActivationCommissions(1000, {
      activationAdminCommissionRate: 0.025,
      activationDeveloperCommissionRate: 0.025
    }, { activationAdminCommissionRate: 0.025, activationDeveloperCommissionRate: 0.025 });
    assert(activationSplit.admin === 25, "activation admin commission should be 2.5%");
    assert(activationSplit.developer === 25, "activation developer commission should be 2.5%");
    assert(roundAmount(10.005) === 10.01, "roundAmount should handle decimals correctly");
    assert(buildPlatformSummary([{ amount: 100, type: "Depot", status: "Completed" }, { amount: 200, type: "Retrait", status: "Completed", metadata: { fee: 15 } }]).platformRevenue === 15, "platform summary should compute revenue");
    assert(parseAdminPagination({ page: "2", limit: "10" }).skip === 10, "pagination helpers should compute the offset");
    assert(buildAdminPaginatedResponse([1], 1, 1, 10).pagination.totalPages === 1, "pagination response should be stable");
    const adminStats = buildAdminStats({ transactions: [{ amount: 100, type: "Depot", status: "Completed" }, { amount: 50, type: "Retrait", status: "Completed", metadata: { fee: 5 } }], users: [{ id: "u1", createdAt: "2024-01-01T00:00:00.000Z", status: "active", country: "FR", activePlans: [{ status: "active", amount: 100 }], referrerId: "r1", merchantProfile: { status: "approved" } }] });
    assert(adminStats.transactionVolume === 150, "admin stats should sum completed transaction amounts");
    assert(adminStats.platformRevenue === 5, "admin stats should include platform revenue fees");
    assert(compactAdminUser({ id: "u1", email: "a@b.com", fullName: "Alice", activePlans: [{ status: "active", amount: 50 }], balance: 42 }).balance === 42, "compactAdminUser should keep user financial fields");
    const programStats = adminProgramStatsFromUsers([{ activePlans: [{ status: "active", amount: 20, earnedAmount: 10 }], activeStakes: [{ status: "active", amount: 30, earnedAmount: 5 }], activeFounders: [{ status: "active", amount: 40, rewardAmount: 8 }], activeEtfs: [{ status: "active", amount: 50, dividendAmount: 7 }] }]);
    assert(programStats.trading.activeCapital === 20, "program stats should summarize trading capital");
    assert(programStats.staking.totalEarned === 5, "program stats should summarize staking rewards");
    assert(programStats.founders.totalReward === 8, "program stats should summarize founders rewards");
    const statusSummary = await transactionStatusSummary([{ status: "Completed", amount: 100 }, { status: "Pending", amount: 40 }, { status: "Completed", amount: 25 }]);
    assert(statusSummary.completed === 2, "transaction summary should count completed rows");
    assert(statusSummary.pending === 1, "transaction summary should count pending rows");
    assert(statusSummary.total === 3, "transaction summary should count all rows");
    assert(normalizeRate("0.12", 0.2) === 0.12, "normalizeRate should preserve valid numeric strings");
    const feeSettings = normalizeFeeSettings({ tradingProgramFeeRate: "0.01", stakingProgramFeeRate: "bad", p2pFeeRate: 0.02 }, {
      tradingProgramFeeRate: 0.0075,
      stakingProgramFeeRate: 0.005,
      p2pFeeRate: 0.01
    });
    assert(feeSettings.tradingProgramFeeRate === 0.01, "normalizeFeeSettings should accept valid rates");
    assert(feeSettings.stakingProgramFeeRate === 0.005, "normalizeFeeSettings should fall back on invalid values");
    assert(feeSettings.p2pFeeRate === 0.02, "normalizeFeeSettings should preserve valid numeric values");
    assert(validateProofFile({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]), mimetype: "image/jpeg" }) === null, "valid JPEG proof should be accepted");

    const backendSource = await request("/backend/server.js");
    assert(backendSource.status === 404, "backend source must not be public");

    const backendData = await request("/backend/data/db.json");
    assert(backendData.status === 404, "backend data paths must not be public");
  } finally {
    child.kill("SIGTERM");
    await wait(250);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
