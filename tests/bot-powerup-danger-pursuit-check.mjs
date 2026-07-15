import { performance } from "node:perf_hooks";

import {
  getBotDecision,
  getBotPowerUpEscapeRouteSignalForTile,
} from "../output/esm/Engine/bot-ai.js";
import { getBotPowerUpEscapeRouteSignal } from "../output/esm/Engine/bot-powerup-pursuit.js";
import { runBotPowerUpDangerLabScenario } from "../output/esm/Engine/bot-powerup-danger-lab-scenario.js";
import { TILE_SIZE } from "../output/esm/PersonalConfig/config.js";

const tile = (x, y) => ({ x, y });
const position = (x, y) => ({
  x: x * TILE_SIZE + TILE_SIZE / 2,
  y: y * TILE_SIZE + TILE_SIZE / 2,
});

const createPlayer = (id, x, y) => ({
  id,
  name: `Player ${id}`,
  active: true,
  alive: true,
  tile: tile(x, y),
  position: position(x, y),
  velocity: { x: 0, y: 0 },
  direction: "down",
  lastMoveDirection: null,
  maxBombs: 1,
  activeBombs: 0,
  flameRange: 1,
  speedLevel: 0,
  remoteLevel: 0,
  shieldCharges: 0,
  bombPassLevel: 0,
  kickLevel: 0,
  shortFuseLevel: 0,
  flameGuardMs: 0,
  spawnProtectionMs: 0,
  skill: {
    id: null,
    phase: "idle",
    channelRemainingMs: 0,
    cooldownRemainingMs: 0,
    castElapsedMs: 0,
    projectedPosition: null,
    projectedLastMoveDirection: null,
  },
});

const bot = createPlayer(2, 3, 3);
const enemy = createPlayer(1, 8, 7);
enemy.spawnProtectionMs = 2_000;

const bomb = {
  id: 910,
  ownerId: 1,
  tile: tile(1, 3),
  fuseMs: 1_000,
  ownerCanPass: false,
  flameRange: 2,
};
const powerUps = [{
  type: "shield-up",
  tile: tile(3, 4),
  revealed: true,
  collected: false,
}];

const createContext = () => ({
  players: { 1: enemy, 2: bot },
  activePlayerIds: [1, 2],
  bombs: [bomb],
  flames: [],
  arena: {
    config: { grid: { width: 11, height: 9 } },
    solid: new Set(),
    breakable: new Set(),
    powerUps,
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
  evaluateMovementOption: () => ({}),
  canMovementOptionAdvance: () => true,
  areOppositeDirections: () => false,
  isPlayerOverlappingTile: () => false,
});

const decisions = [];
const durations = [];
for (let index = 0; index < 100; index += 1) {
  const startedAt = performance.now();
  decisions.push(getBotDecision(bot, createContext()));
  durations.push(performance.now() - startedAt);
}
durations.sort((a, b) => a - b);

const emptyRouteCount = decisions.filter((decision) => decision.direction === "up").length;
const shieldRouteCount = decisions.filter((decision) => decision.direction === "down").length;
const topologyContext = createContext();
topologyContext.arena.solid.add("4,4");
const topologyProtectedDecision = getBotDecision(bot, topologyContext);
bot.shieldCharges = 2;
const maxedShieldDecision = getBotDecision(bot, createContext());
bot.shieldCharges = 0;
const emptyRouteSignal = getBotPowerUpEscapeRouteSignal({
  powerUpType: null,
  utility: 0,
  safeNeighborCount: 3,
  distanceSteps: 1,
  moveDurationMs: 320,
  dangerEtaMs: 1_000,
});
const shieldRouteSignal = getBotPowerUpEscapeRouteSignal({
  powerUpType: "shield-up",
  utility: 500,
  safeNeighborCount: 3,
  distanceSteps: 1,
  moveDurationMs: 320,
  dangerEtaMs: 1_000,
});
const lessSafeHighUtilitySignal = getBotPowerUpEscapeRouteSignal({
  powerUpType: "shield-up",
  utility: 50_000,
  safeNeighborCount: 2,
  distanceSteps: 1,
  moveDurationMs: 320,
  dangerEtaMs: 1_000,
});
const powerUpBreaksOnlySafetyTie = shieldRouteSignal.routeScore > emptyRouteSignal.routeScore
  && lessSafeHighUtilitySignal.routeScore < emptyRouteSignal.routeScore;
const labScenario = runBotPowerUpDangerLabScenario();
const distanceAwareContext = createContext();
distanceAwareContext.dangerMap = new Map([["4,5", 700]]);
const distanceAwareSignal = getBotPowerUpEscapeRouteSignalForTile(
  bot,
  tile(3, 5),
  distanceAwareContext,
);
const temporalSafetyContext = createContext();
temporalSafetyContext.dangerMap = new Map([
  ["3,3", 1_000],
  ["2,4", 600],
  ["4,4", 600],
  ["3,5", 600],
]);
const temporalSafetyDecision = getBotDecision(bot, temporalSafetyContext);
const report = {
  scenario: "duas rotas de fuga equivalentes; escudo revelado somente na rota inferior",
  samples: decisions.length,
  emptyRouteCount,
  shieldRouteCount,
  pickupAwareEscapeRate: shieldRouteCount / decisions.length,
  medianDecisionMs: Number(durations[49].toFixed(4)),
  p95DecisionMs: Number(durations[94].toFixed(4)),
  decision: decisions[0],
  emptyRouteSignal,
  shieldRouteSignal,
  powerUpBreaksOnlySafetyTie,
  topologyProtectedDecision,
  maxedShieldDecision,
  executableBaseline: {
    emptyRouteCount: labScenario.legacyEmptyRouteCount,
    pickupRouteCount: labScenario.legacyPickupRouteCount,
  },
  policySignals: {
    emptySafeNeighbors: labScenario.emptyRouteSignal.safeNeighborCount,
    pickupSafeNeighbors: labScenario.pickupRouteSignal.safeNeighborCount,
  },
  distanceAwareSignal,
  temporalSafetyDecision,
  pass: shieldRouteCount === decisions.length
    && powerUpBreaksOnlySafetyTie
    && topologyProtectedDecision.direction === "up"
    && maxedShieldDecision.direction === "up"
    && labScenario.legacyEmptyRouteCount === labScenario.samples
    && labScenario.legacyPickupRouteCount === 0
    && labScenario.emptyRouteSignal.safeNeighborCount === 4
    && labScenario.pickupRouteSignal.safeNeighborCount === 4
    && distanceAwareSignal.safeNeighborCount === 3
    && temporalSafetyDecision.direction === "up",
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) {
  process.exit(1);
}
