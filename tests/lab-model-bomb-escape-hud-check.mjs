import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const compiledBridgePath = path.join(root, "output", "esm", "Engine", "auto-improvement-bridge.js");
const testModulePath = path.join(root, "output", "esm", "Engine", `.lab-bomb-hud-${process.pid}.mjs`);
const compiledBridge = fs.readFileSync(compiledBridgePath, "utf8");

const testExports = String.raw`
export function __configureBombSafetyHudTest(pid, panel, model, navigation) {
  _strictMode = true;
  _aiControlEnabled = true;
  _perPlayerEnabled[pid] = true;
  _livePlayerPanels.set(pid, panel);
  _sessionModels.set(pid, model);
  _latestNavigation[pid] = navigation;
  _decisionHistory.set(pid, []);
}
export { _renderLivePlayerPanel as __renderLivePlayerPanel };
`;
fs.writeFileSync(testModulePath, `${compiledBridge}\n${testExports}`, "utf8");

function fakeElement() {
  return {
    textContent: "",
    className: "",
    dataset: {},
    children: [],
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    replaceChildren(...nodes) { this.children = nodes; },
  };
}

globalThis.document = { createElement: () => fakeElement() };

try {
  const bridge = await import(`${pathToFileURL(testModulePath).href}?v=${Date.now()}`);
  const receivedAt = Date.now() - 100;
  const safetyReason = "BOMB: escape right clears full blast in 900ms";
  const microActions = Array.from({ length: 30 }, (_, index) => ({
    direction: index < 3 ? "right" : null,
    durationMs: 450,
    placeBomb: index === 0,
    detonate: false,
    skillAction: "none",
  }));
  const plan = {
    playerId: "1",
    direction: "right",
    placeBomb: true,
    detonate: false,
    reason: safetyReason,
    receivedAt,
    requestId: 42,
    stateTick: 818,
    latencyMs: 734,
    microActions,
  };
  const activeDecision = bridge.resolveMicroAction(plan, receivedAt, receivedAt + 100);
  assert.equal(activeDecision.microActionIndex, 0);
  assert.equal(activeDecision.placeBomb, true);

  const panel = Object.fromEntries([
    "model", "status", "heartbeat", "decisionAge", "movement", "bomb",
    "reason", "coords", "delta", "log",
  ].map((key) => [key, fakeElement()]));
  bridge.__configureBombSafetyHudTest("1", panel, "gpt-5.4-mini", {
    tile: { x: 3, y: 5 },
    stalledForMs: 0,
    lastMovementDelta: { x: 1.5, y: 0 },
  });
  bridge.__renderLivePlayerPanel("1", activeDecision, Date.now() - 50, { status: "active" });

  assert.equal(panel.model.textContent, "gpt-5.4-mini");
  assert.equal(panel.status.textContent, "AO VIVO");
  assert.equal(panel.status.dataset.tone, "live");
  assert.match(panel.decisionAge.textContent, /#42/);
  assert.match(panel.decisionAge.textContent, /ação 1\/30/);
  assert.match(panel.decisionAge.textContent, /tick 818/);
  assert.match(panel.decisionAge.textContent, /734ms/);
  assert.match(panel.decisionAge.textContent, /0\.[12]s atrás/);
  assert.equal(panel.bomb.textContent, "COLOCAR BOMBA");
  assert.equal(panel.reason.textContent, safetyReason);
  assert.equal(panel.coords.textContent, "(3, 5)");

  const presentation = bridge.getLiveDecisionPresentation({
    decision: activeDecision,
    decisionAt: receivedAt,
    now: receivedAt + 100,
    heartbeatHealthy: true,
    strictMode: true,
    modelControlEnabled: true,
    playerControlEnabled: true,
  });
  assert.equal(presentation.freshness.remainingMs, 13_400);

  console.log(JSON.stringify({
    pass: true,
    bot: "P1",
    controller: panel.model.textContent,
    status: panel.status.textContent,
    decision: panel.decisionAge.textContent,
    action: panel.bomb.textContent,
    intention: panel.reason.textContent,
    validity: `${presentation.freshness.remainingMs}ms restantes`,
  }, null, 2));
} finally {
  fs.rmSync(testModulePath, { force: true });
}
