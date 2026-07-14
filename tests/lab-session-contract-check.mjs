import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const brokerPath = path.join(root, "auto-improvements", "game_broker.py");
const labSessionTs = path.join(root, "src", "UiLayouts", "lab-session.ts");
const launcherTs = path.join(root, "src", "UiLayouts", "launcher-shell.ts");
const mainTs = path.join(root, "src", "UiLayouts", "main.ts");
const gameAppTs = path.join(root, "src", "Engine", "game-app.ts");
const bridgeTs = path.join(root, "src", "Engine", "auto-improvement-bridge.ts");
const modelManager = path.join(root, "auto-improvements", "model_manager.py");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertIncludes(content, needle, label) {
  assert.ok(content.includes(needle), `${label} should include ${needle}`);
}

const labTs = read(labSessionTs);
const launcher = read(launcherTs);
const main = read(mainTs);
const gameApp = read(gameAppTs);
const bridge = read(bridgeTs);
const modelPy = read(modelManager);
const brokerPy = read(brokerPath);

assertIncludes(labTs, 'const LAB_API_BASE = "/api/lab"', "lab-session.ts");
assertIncludes(labTs, "/session", "lab-session.ts");
assert.equal(labTs.includes("127.0.0.1:8766"), false, "production frontend must not reference local broker");
assert.equal(labTs.includes("NINE_ROUTER_API_KEY"), false, "browser must not reference NINE_ROUTER_API_KEY");
assert.equal(labTs.includes("apiKey"), false, "browser payload helpers must not send apiKey");
assertIncludes(launcher, "createLabSession", "launcher-shell.ts");
assertIncludes(launcher, "LabShell", "launcher-shell.ts");
assert.equal(launcher.includes('name="providerA"'), false, "Lab must not expose a P1 provider field");
assert.equal(launcher.includes('name="providerB"'), false, "Lab must not expose a P2 provider field");
assert.equal(launcher.includes("Math.random"), false, "Lab must not simulate winners with Math.random");
assertIncludes(main, 'route === "lab"', "main.ts");
assertIncludes(main, "LabShell", "main.ts");
assertIncludes(main, "validLabSession", "main.ts");
assertIncludes(main, "livePlayerIds.length > 0", "main.ts");
assertIncludes(gameApp, "import.meta.env?.DEV || liveLabSession", "game-app.ts Lab activation");
assertIncludes(gameApp, "if (AutoImprovementBridge.isEnabled)", "game-app.ts telemetry activation");
assertIncludes(gameApp, "AutoImprovementBridge.isEnabled && this.isLiveBridgeControlled", "game-app.ts decision activation");
assert.equal(bridge.includes('const BROKER_BASE = "http://127.0.0.1:8766"'), false, "bridge must not use localhost in production");
assertIncludes(bridge, 'const LAB_API_BASE = "/api/lab"', "bridge same-origin API");
assertIncludes(bridge, "mountSidePanels: mountLiveLabHud", "bridge production Lab HUD");
assertIncludes(bridge, "_latestNavigation = snapshot.navigation ?? {}", "bridge navigation cache");
assert.equal(
  bridge.includes("navigation.blockedDirections.includes(entry.d.direction)"),
  false,
  "bridge must not override model movement with a deterministic blocked-direction guard",
);
assertIncludes(bridge, "_decisionTtlMs(entry.d)", "bridge model-selected short decision horizon");
assertIncludes(bridge, "_consumedDecisionActions", "bridge one-shot action pulses");
assertIncludes(modelPy, '"9router"', "model_manager.py");
assert.equal(modelPy.includes('"temperature"'), false, "9Router requests must support models that reject temperature");
assertIncludes(brokerPy, "POST /lab/session", "game_broker.py");
assertIncludes(brokerPy, "secrets_not_allowed_from_browser", "game_broker.py");
assertIncludes(brokerPy, "NINE_ROUTER_API_KEY", "game_broker.py");

async function withMockNineRouter(run) {
  const server = createServer((req, res) => {
    if (req.url === "/v1/models") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: [
        { id: "cx/gpt-5.6-sol", name: "GPT-5.6 SOL" },
        { id: "cx/gpt-5.6-terra", name: "GPT-5.6 Terra" },
        { id: "cx/gpt-5.6-luna", name: "GPT-5.6 Luna" },
        { id: "cc/claude-opus-4-8", name: "Claude Opus 4.8" },
        { id: "cc/claude-sonnet-5", name: "Claude Sonnet 5" },
        { id: "mock/not-allowed", name: "Not allowed" },
      ] }));
      return;
    }
    res.writeHead(404).end("not found");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}/v1`);
  } finally {
    server.close();
  }
}

async function waitForHealth(base, timeoutMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("broker health timeout");
}

await withMockNineRouter(async (nineBase) => {
  const brokerPort = 18766 + Math.floor(Math.random() * 200);
  const brokerBase = `http://127.0.0.1:${brokerPort}`;
  const child = spawn("python", [brokerPath], {
    cwd: path.join(root, "auto-improvements"),
    env: {
      ...process.env,
      BROKER_HOST: "127.0.0.1",
      BROKER_PORT: String(brokerPort),
      NINE_ROUTER_BASE_URL: nineBase,
      NINE_ROUTER_API_KEY: "test-key-not-real",
      NINE_ROUTER_MODEL: "cx/gpt-5.6-sol",
      BROKER_INTERNAL_SECRET: "test-internal-secret-not-real",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  try {
    await waitForHealth(brokerBase);

    const unauthorizedRes = await fetch(`${brokerBase}/lab/models`);
    assert.equal(unauthorizedRes.status, 401);
    const wrongSecretRes = await fetch(`${brokerBase}/lab/models`, {
      headers: { "x-bomba-lab-secret": "wrong" },
    });
    assert.equal(wrongSecretRes.status, 401);

    const authHeaders = { "x-bomba-lab-secret": "test-internal-secret-not-real" };
    const modelsRes = await fetch(`${brokerBase}/lab/models`, { headers: authHeaders });
    const modelsJson = await modelsRes.json();
    assert.equal(modelsRes.status, 200);
    assert.equal(modelsJson.ok, true);
    assert.ok(Array.isArray(modelsJson.models));
    assert.deepEqual(
      modelsJson.models.map((model) => model.id),
      [
        "cx/gpt-5.6-sol",
        "cx/gpt-5.6-terra",
        "cx/gpt-5.6-luna",
        "cc/claude-opus-4-8",
        "cc/claude-sonnet-5",
      ],
    );

    const secretRes = await fetch(`${brokerBase}/lab/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        apiKey: "should-be-rejected",
        agents: [
          { slot: "1", provider: "9router", model: "cx/gpt-5.6-sol" },
          { slot: "2", provider: "9router", model: "cx/gpt-5.6-terra" },
        ],
      }),
    });
    const secretJson = await secretRes.json();
    assert.equal(secretRes.status, 400);
    assert.equal(secretJson.error, "secrets_not_allowed_from_browser");

    const invalidProviderRes = await fetch(`${brokerBase}/lab/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        agents: [
          { slot: "1", provider: "not-a-provider", model: "cx/gpt-5.6-sol" },
          { slot: "2", provider: "9router", model: "cx/gpt-5.6-terra" },
        ],
      }),
    });
    const invalidProviderJson = await invalidProviderRes.json();
    assert.equal(invalidProviderRes.status, 400);
    assert.equal(invalidProviderJson.error, "invalid_agent");

    const invalidModelRes = await fetch(`${brokerBase}/lab/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        agents: [
          { slot: "1", provider: "9router", model: "mock/not-allowed" },
          { slot: "2", provider: "9router", model: "cx/gpt-5.6-terra" },
        ],
      }),
    });
    const invalidModelJson = await invalidModelRes.json();
    assert.equal(invalidModelRes.status, 400);
    assert.equal(invalidModelJson.error, "invalid_agent");

    const okRes = await fetch(`${brokerBase}/lab/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        agents: [
          { slot: "1", provider: "9router", model: "cx/gpt-5.6-sol", label: "A" },
          { slot: "2", provider: "9router", model: "cx/gpt-5.6-terra", label: "B" },
        ],
        rounds: 3,
        durationSec: 120,
        map: "classic",
        modifier: "none",
      }),
    });
    const okJson = await okRes.json();
    assert.equal(okRes.status, 200, `session failed: ${JSON.stringify(okJson)} stderr=${stderr}`);
    assert.equal(okJson.ok, true);
    assert.ok(okJson.sessionId);
    assert.ok(String(okJson.gameUrl).includes("codexbot=1,2"));
    assert.ok(String(okJson.gameUrl).includes("autobot="));
    assert.ok(String(okJson.gameUrl).includes("labSession="));
    const capability = new URL(okJson.gameUrl, "http://lab.test").searchParams.get("labCapability");
    assert.match(capability ?? "", /^[A-Za-z0-9_-]{32,128}$/);
    assert.equal(JSON.stringify(okJson).includes("test-key-not-real"), false);
    assert.equal(JSON.stringify(okJson).includes("apiKey"), false);

    const missingCapabilityRes = await fetch(`${brokerBase}/lab/session`, {
      headers: { ...authHeaders, "x-bomba-lab-proxy": "1" },
    });
    assert.equal(missingCapabilityRes.status, 401);

    const authorizedSessionRes = await fetch(`${brokerBase}/lab/session`, {
      headers: {
        ...authHeaders,
        "x-bomba-lab-proxy": "1",
        "x-bomba-lab-session": capability,
      },
    });
    const authorizedSessionJson = await authorizedSessionRes.json();
    assert.equal(authorizedSessionRes.status, 200);
    assert.equal(authorizedSessionJson.session.sessionId, okJson.sessionId);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
});

const workerJs = read(path.join(root, "worker", "index.js"));
assertIncludes(workerJs, '"/api/lab/models"', "worker proxy allowlist");
assertIncludes(workerJs, '"/api/lab/session"', "worker proxy allowlist");
assertIncludes(workerJs, '"/api/lab/telemetry"', "worker proxy allowlist");
assertIncludes(workerJs, "API_LAB_DECISION_ROUTE_RE", "worker decision allowlist");
assertIncludes(workerJs, 'headers.set("x-bomba-lab-secret", env.LAB_BROKER_SECRET)', "worker secret injection");
assertIncludes(workerJs, 'headers.set("x-bomba-lab-proxy", "1")', "worker proxy marker");
assertIncludes(workerJs, 'headers.set("x-bomba-lab-session", sessionCapability)', "worker session capability forwarding");
assert.equal(workerJs.includes("/trigger/worker-real\", { methods"), false, "worker must not expose admin triggers");

console.log("lab-session-contract-check: ok");
