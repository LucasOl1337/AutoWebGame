import assert from "node:assert/strict";
import { getBotDecision } from "../output/esm/Engine/bot-ai.js";
import { TILE_SIZE } from "../output/esm/PersonalConfig/config.js";

const tile = (x, y) => ({ x, y });
const position = (x, y) => ({ x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 });
const makePlayer = (id, x, y, overrides = {}) => ({
  id, active: true, alive: true, tile: tile(x, y), position: position(x, y),
  spawnProtectionMs: 0, flameRange: 1, activeBombs: 1, maxBombs: 1,
  speedLevel: 0, remoteLevel: 0, bombPassLevel: 0, kickLevel: 1,
  ...overrides,
});

const bot = makePlayer(2, 4, 4);
const enemy = makePlayer(1, 8, 8, { kickLevel: 0 });
const baseContext = {
  players: { 1: enemy, 2: bot }, activePlayerIds: [1, 2],
  bombs: [{ id: 7, ownerId: 1, tile: tile(5, 4), fuseMs: 2000, ownerCanPass: false, flameRange: 1 }],
  flames: [],
  arena: { config: { grid: { width: 11, height: 11 } }, solid: new Set(), breakable: new Set(), powerUps: [] },
  suddenDeathActive: false, suddenDeathTickMs: 0, suddenDeathIndex: 0,
  suddenDeathPath: [], suddenDeathClosureEffects: [], botBombCooldownMs: 0,
  botCommittedDirection: { 1: null, 2: "right" },
  botPendingReverseDirection: { 1: null, 2: null }, botPendingReverseFrames: { 1: 0, 2: 0 },
  canOccupyPosition: () => true,
  evaluateMovementOption: (_player, direction) => ({ direction }),
  canMovementOptionAdvance: () => true,
  areOppositeDirections: () => false,
  isPlayerOverlappingTile: () => false,
};

const safeDecision = getBotDecision(bot, baseContext);
assert.deepEqual(safeDecision, { direction: "right", placeBomb: false }, "bot should deliberately continue into a safe adjacent kick");

const noKickDecision = getBotDecision({ ...bot, kickLevel: 0 }, baseContext);
assert.notEqual(noKickDecision.direction, "right", "bot without kick must not deliberately enter the bomb");

const uncommittedDecision = getBotDecision(bot, {
  ...baseContext,
  botCommittedDirection: { ...baseContext.botCommittedDirection, 2: null },
});
assert.notEqual(uncommittedDecision.direction, "right", "kick requires one deterministic committed direction");

const blockedDecision = getBotDecision(bot, {
  ...baseContext,
  arena: { ...baseContext.arena, solid: new Set(["6,4"]) },
});
assert.notEqual(blockedDecision.direction, "right", "kick must not target a blocked landing tile");

const urgentDecision = getBotDecision(bot, {
  ...baseContext,
  bombs: [{ ...baseContext.bombs[0], fuseMs: 300 }],
});
assert.notEqual(urgentDecision.direction, "right", "kick must not commit when the fuse lacks the safety window");

console.log(JSON.stringify({ safeDecision, noKickDecision, uncommittedDecision, blockedDecision, urgentDecision, pass: true }, null, 2));
