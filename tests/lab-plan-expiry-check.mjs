import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bridgeSource = fs.readFileSync(
  path.join(root, "src", "Engine", "auto-improvement-bridge.ts"),
  "utf8",
);
const {
  getDecisionFreshness,
  getLiveDecisionPresentation,
  resolveFreshDecision,
} = await import(pathToFileURL(
  path.join(root, "output", "esm", "Engine", "auto-improvement-bridge.js"),
));

const receivedAt = 10_000;
const plan = {
  playerId: "1",
  direction: "right",
  placeBomb: false,
  detonate: false,
  reason: "controlled 800ms plan",
  microActions: [
    { direction: "right", durationMs: 400, placeBomb: false, detonate: false, skillAction: "none" },
    { direction: "left", durationMs: 400, placeBomb: false, detonate: false, skillAction: "none" },
  ],
};

const justBeforeExpiry = getDecisionFreshness(plan, receivedAt, receivedAt + 799);
assert.deepEqual(justBeforeExpiry, {
  ageMs: 799,
  ttlMs: 800,
  remainingMs: 1,
  fresh: true,
});
assert.equal(resolveFreshDecision(plan, receivedAt, receivedAt + 799)?.direction, "left");

const atExpiry = getDecisionFreshness(plan, receivedAt, receivedAt + 800);
assert.deepEqual(atExpiry, {
  ageMs: 800,
  ttlMs: 800,
  remainingMs: 0,
  fresh: false,
});
assert.equal(resolveFreshDecision(plan, receivedAt, receivedAt + 800), null);
assert.equal(resolveFreshDecision(plan, receivedAt, receivedAt + 1_549), null);

const strictPresentation = getLiveDecisionPresentation({
  decision: plan,
  decisionAt: receivedAt,
  now: receivedAt + 1_549,
  heartbeatHealthy: true,
  strictMode: true,
  modelControlEnabled: true,
  playerControlEnabled: true,
});
assert.equal(strictPresentation.status, "PLANO EXPIRADO");
assert.equal(strictPresentation.movement, "· SEM COMANDO");
assert.equal(strictPresentation.bomb, "NENHUMA");
assert.match(strictPresentation.reason, /bot está parado aguardando uma decisão nova/);
assert.equal(strictPresentation.fallbackActive, false);

const fallbackPresentation = getLiveDecisionPresentation({
  decision: plan,
  decisionAt: receivedAt,
  now: receivedAt + 1_549,
  heartbeatHealthy: true,
  strictMode: false,
  modelControlEnabled: true,
  playerControlEnabled: true,
});
assert.equal(fallbackPresentation.status, "FALLBACK DETERMINÍSTICO");
assert.equal(fallbackPresentation.movement, "· POLÍTICA LOCAL");
assert.equal(fallbackPresentation.bomb, "DECISÃO LOCAL");
assert.match(fallbackPresentation.reason, /Controle atual: IA determinística local/);
assert.equal(fallbackPresentation.fallbackActive, true);

const playerDisabledPresentation = getLiveDecisionPresentation({
  decision: plan,
  decisionAt: receivedAt,
  now: receivedAt + 200,
  heartbeatHealthy: true,
  strictMode: false,
  modelControlEnabled: true,
  playerControlEnabled: false,
});
assert.equal(playerDisabledPresentation.status, "CONTROLE DESATIVADO");
assert.equal(playerDisabledPresentation.movement, "· SEM COMANDO");
assert.equal(playerDisabledPresentation.bomb, "NENHUMA");
assert.match(playerDisabledPresentation.reason, /desativado pelo operador/);
assert.equal(playerDisabledPresentation.fallbackActive, false);
assert.equal(playerDisabledPresentation.controlDisabled, true);

const globalOffFallbackPresentation = getLiveDecisionPresentation({
  decision: plan,
  decisionAt: receivedAt,
  now: receivedAt + 200,
  heartbeatHealthy: true,
  strictMode: false,
  modelControlEnabled: false,
  playerControlEnabled: true,
});
assert.equal(globalOffFallbackPresentation.status, "FALLBACK DETERMINÍSTICO");
assert.match(globalOffFallbackPresentation.reason, /desativado globalmente/);
assert.equal(globalOffFallbackPresentation.fallbackActive, true);

const erroredFallbackPresentation = getLiveDecisionPresentation({
  decision: plan,
  decisionAt: receivedAt,
  now: receivedAt + 1_549,
  heartbeatHealthy: true,
  agentError: "timeout do provedor",
  strictMode: false,
  modelControlEnabled: true,
  playerControlEnabled: true,
});
assert.equal(erroredFallbackPresentation.status, "FALLBACK DETERMINÍSTICO");
assert.match(erroredFallbackPresentation.reason, /Falha do modelo: timeout do provedor/);
assert.match(erroredFallbackPresentation.reason, /Controle atual: IA determinística local/);

assert.match(bridgeSource, /CONTROLADOR ATUAL/);
assert.doesNotMatch(bridgeSource, /planMs \+ 750/);

console.log("lab-plan-expiry-check: ok");
