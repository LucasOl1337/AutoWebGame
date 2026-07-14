import assert from "node:assert/strict";

import { getBotDecision } from "../output/esm/Engine/bot-ai.js";
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
  maxBombs: 2,
  activeBombs: 2,
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

const bot = createPlayer(2, 5, 5);
const enemy = createPlayer(1, 9, 9);

const getDecision = (bombs, overlappingBombIds = new Set()) => getBotDecision(bot, {
  players: { 1: enemy, 2: bot },
  activePlayerIds: [1, 2],
  bombs,
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
  evaluateMovementOption: () => ({}),
  canMovementOptionAdvance: () => true,
  areOppositeDirections: () => false,
  isPlayerOverlappingTile: (_player, bombTile) => bombs.some((bomb) => (
    overlappingBombIds.has(bomb.id)
    && bomb.tile.x === bombTile.x
    && bomb.tile.y === bombTile.y
  )),
});

const immediateEnemyBomb = {
  id: 10,
  ownerId: 1,
  tile: tile(5, 5),
  fuseMs: 700,
  ownerCanPass: false,
  flameRange: 1,
};
const delayedOwnBomb = {
  id: 20,
  ownerId: 2,
  tile: tile(5, 6),
  fuseMs: 1500,
  ownerCanPass: true,
  flameRange: 2,
};
const overlappingBombIds = new Set([immediateEnemyBomb.id, delayedOwnBomb.id]);
const immediateFirst = getDecision([immediateEnemyBomb, delayedOwnBomb], overlappingBombIds);
const immediateLast = getDecision([delayedOwnBomb, immediateEnemyBomb], overlappingBombIds);

assert.deepEqual(
  immediateFirst,
  immediateLast,
  "overlapping-bomb safety must not depend on bomb array order",
);
assert.equal(
  immediateFirst.direction,
  "up",
  "the earliest overlapping blast must take priority over ownership",
);

const lowerIdThreat = {
  id: 30,
  ownerId: 2,
  tile: tile(5, 2),
  fuseMs: 900,
  ownerCanPass: false,
  flameRange: 3,
};
const higherIdThreat = {
  id: 40,
  ownerId: 2,
  tile: tile(5, 3),
  fuseMs: 900,
  ownerCanPass: false,
  flameRange: 3,
};
const lowerIdFirst = getDecision([lowerIdThreat, higherIdThreat]);
const lowerIdLast = getDecision([higherIdThreat, lowerIdThreat]);

assert.deepEqual(
  lowerIdFirst,
  lowerIdLast,
  "equal-fuse owned threats must use a stable bomb-id tie-break",
);
assert.equal(lowerIdFirst.direction, "down");

console.log(JSON.stringify({
  overlappingThreatDecision: immediateFirst,
  equalFuseThreatDecision: lowerIdFirst,
  pass: true,
}, null, 2));
