import assert from "node:assert/strict";
import { getBotDecision } from "../output/esm/Engine/bot-ai.js";
import { TILE_SIZE } from "../output/esm/PersonalConfig/config.js";

const tile = (x, y) => ({ x, y });
const position = (x, y) => ({ x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 });
const player = (id, x, y) => ({
  id, active: true, alive: true, tile: tile(x, y), position: position(x, y),
  spawnProtectionMs: 0, flameRange: 1, activeBombs: 1, maxBombs: 1,
  speedLevel: 0, remoteLevel: 0, bombPassLevel: 0,
});

const bot = player(2, 5, 5);
const lowerIdTarget = player(1, 3, 5);
const firstActiveTarget = player(4, 7, 5);
const context = {
  players: { 1: lowerIdTarget, 2: bot, 4: firstActiveTarget },
  activePlayerIds: [2, 4, 1],
  bombs: [], flames: [],
  arena: { config: { grid: { width: 11, height: 11 } }, solid: new Set(), breakable: new Set(), powerUps: [] },
  suddenDeathActive: false, suddenDeathTickMs: 0, suddenDeathIndex: 0,
  suddenDeathPath: [], suddenDeathClosureEffects: [], botBombCooldownMs: 0,
  botCommittedDirection: { 1: null, 2: null, 3: null, 4: null },
  botPendingReverseDirection: { 1: null, 2: null, 3: null, 4: null },
  botPendingReverseFrames: { 1: 0, 2: 0, 3: 0, 4: 0 },
  canOccupyPosition: () => true,
  evaluateMovementOption: (_player, direction) => ({ direction }),
  canMovementOptionAdvance: () => true,
  areOppositeDirections: () => false,
  isPlayerOverlappingTile: () => false,
};

const decision = getBotDecision(bot, context);
assert.equal(decision.direction, "right", "equal-distance targets should preserve activePlayerIds order");
assert.equal(decision.placeBomb, false);
console.log(JSON.stringify({ decision, activePlayerIds: context.activePlayerIds, pass: true }, null, 2));
