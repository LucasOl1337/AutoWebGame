import { performance } from "node:perf_hooks";

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { buildBotDangerMap, getBotDecision } = await import("../output/esm/Engine/bot-ai.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");

const noop = () => {};
const emptySprites = {
  up: null,
  down: null,
  left: null,
  right: null,
  idle: { up: [], down: [], left: [], right: [] },
  walk: { up: [], down: [], left: [], right: [] },
};
const assets = {
  players: { 1: emptySprites, 2: emptySprites, 3: emptySprites, 4: emptySprites },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: {},
};

function setPlayerTile(player, x, y) {
  player.tile = { x, y };
  player.position = {
    x: x * TILE_SIZE + TILE_SIZE * 0.5,
    y: y * TILE_SIZE + TILE_SIZE * 0.5,
  };
  player.spawnProtectionMs = 0;
}

const game = new GameApp({ appendChild: noop }, assets);
game.startServerAuthoritativeMatch(
  [1, 2, 3, 4],
  { 1: 0, 2: 0, 3: 0, 4: 0 },
  { botPlayerIds: [2, 3, 4] },
);

setPlayerTile(game.players[1], 1, 1);
setPlayerTile(game.players[2], 9, 1);
setPlayerTile(game.players[3], 1, 9);
setPlayerTile(game.players[4], 9, 9);
game.arena.breakable = new Set();
game.flames = [
  { tile: { x: 5, y: 4 }, remainingMs: 300 },
  { tile: { x: 5, y: 6 }, remainingMs: 300 },
];
game.bombs = [
  { id: 101, ownerId: 1, tile: { x: 3, y: 3 }, fuseMs: 420, ownerCanPass: false, flameRange: 3 },
  { id: 102, ownerId: 2, tile: { x: 5, y: 3 }, fuseMs: 980, ownerCanPass: false, flameRange: 3 },
  { id: 103, ownerId: 3, tile: { x: 7, y: 3 }, fuseMs: 1540, ownerCanPass: false, flameRange: 3 },
  { id: 104, ownerId: 4, tile: { x: 3, y: 7 }, fuseMs: 760, ownerCanPass: false, flameRange: 3 },
  { id: 105, ownerId: 1, tile: { x: 5, y: 7 }, fuseMs: 1320, ownerCanPass: false, flameRange: 3 },
  { id: 106, ownerId: 2, tile: { x: 7, y: 7 }, fuseMs: 1880, ownerCanPass: false, flameRange: 3 },
];

const bots = [game.players[2], game.players[3], game.players[4]];
const baselineContext = game.createBotContext();
const sharedDangerMap = buildBotDangerMap(baselineContext);
const sharedContext = game.createBotContext(sharedDangerMap);
const baselineDecisions = bots.map((bot) => getBotDecision(bot, baselineContext));
const sharedDecisions = bots.map((bot) => getBotDecision(bot, sharedContext));
const decisionContractPass = JSON.stringify(sharedDecisions) === JSON.stringify(baselineDecisions);

function timeDecisions(context, rounds) {
  let checksum = 0;
  const startedAt = performance.now();
  for (let round = 0; round < rounds; round += 1) {
    for (const bot of bots) {
      const decision = getBotDecision(bot, context);
      checksum += decision.placeBomb ? 3 : decision.direction ? 1 : 0;
    }
  }
  return { elapsedMs: performance.now() - startedAt, checksum };
}

for (let index = 0; index < 3; index += 1) {
  timeDecisions(baselineContext, 40);
  timeDecisions(sharedContext, 40);
}

const roundsPerRun = 600;
const runs = [];
for (let index = 0; index < 7; index += 1) {
  const baseline = timeDecisions(baselineContext, roundsPerRun);
  const shared = timeDecisions(sharedContext, roundsPerRun);
  runs.push({
    baselineMs: Number(baseline.elapsedMs.toFixed(3)),
    sharedMs: Number(shared.elapsedMs.toFixed(3)),
    checksumPass: baseline.checksum === shared.checksum,
  });
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const baselineMedianMs = median(runs.map((run) => run.baselineMs));
const sharedMedianMs = median(runs.map((run) => run.sharedMs));
const improvementPercent = Number((((baselineMedianMs - sharedMedianMs) / baselineMedianMs) * 100).toFixed(1));
const benchmarkPass = runs.every((run) => run.checksumPass)
  && sharedMedianMs < baselineMedianMs * 0.8;

game.botDangerCacheActive = true;
const firstCachedMap = game.getSharedBotDangerMap();
const cacheReusePass = firstCachedMap === game.getSharedBotDangerMap();
const bombOwner = game.players[1];
bombOwner.activeBombs = 0;
bombOwner.maxBombs = 4;
setPlayerTile(bombOwner, 5, 5);
const placedBomb = game.placeBomb(bombOwner, false);
const secondCachedMap = game.getSharedBotDangerMap();
game.botDangerCacheActive = false;
game.cachedBotDangerMap = null;
const outsideStepMapA = game.getSharedBotDangerMap();
const outsideStepMapB = game.getSharedBotDangerMap();
const cacheScopePass = outsideStepMapA !== outsideStepMapB;
const invalidationPass = placedBomb
  && firstCachedMap !== secondCachedMap
  && secondCachedMap.has("5,5");
const pass = decisionContractPass
  && cacheReusePass
  && cacheScopePass
  && invalidationPass
  && benchmarkPass;

console.log(JSON.stringify({
  pass,
  decisionContractPass,
  cacheReusePass,
  cacheScopePass,
  invalidationPass,
  benchmarkPass,
  botCount: bots.length,
  roundsPerRun,
  baselineMedianMs,
  sharedMedianMs,
  improvementPercent,
  runs,
}, null, 2));

if (!pass) {
  process.exit(1);
}
