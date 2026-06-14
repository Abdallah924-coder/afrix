import { spawn } from "child_process";
import { setTimeout as wait } from "timers/promises";

const PORT = Number(process.env.TEST_PORT || 4399);
const baseUrl = `http://127.0.0.1:${PORT}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer(child) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before smoke tests with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }
  throw new Error(`Server did not become ready: ${lastError?.message || "timeout"}`);
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
      MONGODB_URI: "",
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
    await waitForServer(child);

    const dashboard = await request("/dashboard");
    assert(dashboard.status === 200, "/dashboard should render");
    assert((dashboard.headers.get("content-security-policy") || "").includes("default-src 'self'"), "CSP header should be present");

    const legacy = await request("/pages/dashboard.html");
    assert(legacy.status === 301, "legacy page URL should redirect");
    assert(legacy.headers.get("location") === "/dashboard", "legacy page URL should redirect to clean route");

    const appScript = await request("/app.js");
    assert(appScript.status === 200, "/app.js should be public");

    const backendSource = await request("/backend/server.js");
    assert(backendSource.status === 404, "backend source must not be public");

    const localData = await request("/backend/data/db.json");
    assert(localData.status === 404, "local JSON data must not be public");
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
