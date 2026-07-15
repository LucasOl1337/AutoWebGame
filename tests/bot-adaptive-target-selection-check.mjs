import assert from "node:assert/strict";
import { getBotDecision, getBotTargetSelectionSignal } from "../output/esm/Engine/bot-ai.js";
import { selectBotTarget } from "../output/esm/Engine/bot-target-selection.js";
import { runBotTargetLabScenario } from "../output/esm/Engine/bot-target-lab-scenario.js";
import { TILE_SIZE } from "../output/esm/PersonalConfig/config.js";

const tile = (x, y) => ({ x, y });
const position = (x, y) => ({ x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 });
const player = (id, x, y, overrides = {}) => ({
  id,
  name: `P${id}`,
  active: true,
  alive: true,
  tile: tile(x, y),
  position: position(x, y),
  velocity: { x: 0, y: 0 },
  direction: "down",
  lastMoveDirection: null,
  spawnProtectionMs: 0,
  flameGuardMs: 0,
  shieldCharges: 0,
  flameRange: 1,
  activeBombs: 0,
  maxBombs: 1,
  speedLevel: 0,
  remoteLevel: 0,
  bombPassLevel: 0,
  kickLevel: 0,
  shortFuseLevel: 0,
  skill: {
    id: null,
    phase: "idle",
    channelRemainingMs: 0,
    cooldownRemainingMs: 0,
    castElapsedMs: 0,
    projectedPosition: null,
    projectedLastMoveDirection: null,
  },
  ...overrides,
});

const bot = player(2, 5, 5, { maxBombs: 0 });
const closeShielded = player(1, 3, 5, { shieldCharges: 1 });
const exposedReloading = player(3, 8, 5, { activeBombs: 1, maxBombs: 1 });
const context = {
  players: { 1: closeShielded, 2: bot, 3: exposedReloading },
  activePlayerIds: [2, 1, 3],
  bombs: [{ id: 31, ownerId: 3, tile: tile(9, 9), fuseMs: 1_800, ownerCanPass: false, flameRange: 1 }],
  flames: [],
  arena: {
    config: { grid: { width: 11, height: 11 } },
    solid: new Set(),
    breakable: new Set(),
    powerUps: [],
  },
  suddenDeathActive: false,
  suddenDeathTickMs: 0,
  suddenDeathIndex: 0,
  suddenDeathPath: [],
  suddenDeathClosureEffects: [],
  botBombCooldownMs: 0,
  botCommittedDirection: { 1: null, 2: null, 3: null, 4: null },
  botPendingReverseDirection: { 1: null, 2: null, 3: null, 4: null },
  botPendingReverseFrames: { 1: 0, 2: 0, 3: 0, 4: 0 },
  canOccupyPosition: () => true,
  evaluateMovementOption: (_player, direction) => ({ direction }),
  canMovementOptionAdvance: () => true,
  areOppositeDirections: () => false,
  isPlayerOverlappingTile: () => false,
};

const iterations = 100;
const decisions = Array.from({ length: iterations }, () => getBotDecision(bot, context));
const signal = getBotTargetSelectionSignal(bot, context);
const directions = decisions.reduce((counts, decision) => {
  const direction = decision.direction ?? "hold";
  counts[direction] = (counts[direction] ?? 0) + 1;
  return counts;
}, {});

console.log(JSON.stringify({
  scenario: "P2 entre P1 protegido por escudo e P3 exposto sem bombas disponíveis",
  iterations,
  directions,
  expectedTarget: "P3",
  expectedDirection: "right",
  signal,
}, null, 2));

assert.equal(directions.right, iterations, "the bot should consistently pursue the exposed reloading target");
assert.equal(signal.selected?.targetId, 3, "selected target signal must match the pursued player");
assert.equal(signal.selected?.reasonCode, "exposed-capacity-committed");
assert.equal(signal.selected?.commitmentRemainingMs, 1_800);
assert.equal(decisions[0]?.targetId, 3, "attack decision must carry the consumed target");
assert.equal(decisions[0]?.intent, "chase-enemy", "attack decision must identify its branch");
assert.equal(signal.candidates.find((candidate) => candidate.targetId === 1)?.defenseState, "shielded");

const tied = selectBotTarget([
  { targetId: 4, distanceSteps: 2, openEscapeRoutes: 4, spawnProtectionMs: 0, flameGuardMs: 0, shieldCharges: 0, activeBombs: 0, maxBombs: 1, remoteLevel: 0, soonestOwnedBombFuseMs: null },
  { targetId: 1, distanceSteps: 2, openEscapeRoutes: 4, spawnProtectionMs: 0, flameGuardMs: 0, shieldCharges: 0, activeBombs: 0, maxBombs: 1, remoteLevel: 0, soonestOwnedBombFuseMs: null },
]);
assert.equal(tied.selected?.targetId, 4, "exact ties must preserve active player order");

const protectionControl = selectBotTarget([
  { targetId: 1, distanceSteps: 1, openEscapeRoutes: 1, spawnProtectionMs: 500, flameGuardMs: 0, shieldCharges: 0, activeBombs: 1, maxBombs: 1, remoteLevel: 0, soonestOwnedBombFuseMs: 1_800 },
  { targetId: 3, distanceSteps: 8, openEscapeRoutes: 4, spawnProtectionMs: 0, flameGuardMs: 0, shieldCharges: 0, activeBombs: 0, maxBombs: 1, remoteLevel: 0, soonestOwnedBombFuseMs: null },
]);
assert.equal(protectionControl.selected?.targetId, 3, "invulnerable targets must remain a last resort");

const remoteControl = selectBotTarget([
  { targetId: 3, distanceSteps: 3, openEscapeRoutes: 4, spawnProtectionMs: 0, flameGuardMs: 0, shieldCharges: 0, activeBombs: 1, maxBombs: 1, remoteLevel: 1, soonestOwnedBombFuseMs: 1_800 },
]);
assert.equal(remoteControl.selected?.bombCapacityCommitted, false, "remote detonation must suppress the commitment bonus");
assert.equal(remoteControl.selected?.reasonCode, "nearest-exposed");

const chainContext = {
  ...context,
  bombs: [
    { id: 31, ownerId: 3, tile: tile(9, 9), fuseMs: 1_800, ownerCanPass: false, flameRange: 1 },
    { id: 11, ownerId: 1, tile: tile(8, 9), fuseMs: 100, ownerCanPass: false, flameRange: 1 },
  ],
};
const chainSignal = getBotTargetSelectionSignal(bot, chainContext);
const chainedTarget = chainSignal.candidates.find((candidate) => candidate.targetId === 3);
assert.equal(chainedTarget?.commitmentRemainingMs, 100, "chain reaction ETA must replace the raw fuse");
assert.equal(chainedTarget?.bombCapacityCommitted, false, "an imminent chain must suppress the commitment bonus");

const lab = runBotTargetLabScenario();
assert.deepEqual(lab.legacyTargetCounts, { P1: 100 });
assert.deepEqual(lab.selectedTargetCounts, { P3: 100 });
assert.deepEqual(lab.directionCounts, { right: 100 });
