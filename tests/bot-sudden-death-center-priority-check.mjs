Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: class HTMLElement {}, configurable: true });

const noop = () => {};
const fakeCtx = {
  imageSmoothingEnabled: false,
  clearRect: noop,
  fillRect: noop,
  strokeRect: noop,
  beginPath: noop,
  moveTo: noop,
  lineTo: noop,
  closePath: noop,
  fill: noop,
  stroke: noop,
  arc: noop,
  ellipse: noop,
  drawImage: noop,
  fillText: noop,
  strokeText: noop,
  save: noop,
  restore: noop,
  setTransform: noop,
  translate: noop,
  scale: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
};

const fakeCanvas = {
  width: 0,
  height: 0,
  dataset: {},
  style: {},
  setAttribute: noop,
  closest: () => null,
  getContext: () => fakeCtx,
  requestFullscreen: async () => {},
};

globalThis.document = {
  fullscreenElement: null,
  createElement: () => fakeCanvas,
  exitFullscreen: async () => {},
};

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  addEventListener: noop,
  requestAnimationFrame: noop,
};

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { getSuddenDeathPressureDirection } = await import("../output/esm/Engine/bot-ai.js");
const { getSuddenDeathPressureSignal } = await import("../output/esm/Engine/bot-sudden-death-pressure.js");
const { tileKey } = await import("../output/esm/Arenas/arena.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");

const emptySprites = {
  up: null,
  down: null,
  left: null,
  right: null,
  idle: { up: [], down: [], left: [], right: [] },
  walk: { up: [], down: [], left: [], right: [] },
};

const root = { appendChild: noop };
const assets = {
  players: { 1: emptySprites, 2: emptySprites, 3: emptySprites, 4: emptySprites },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: {
    "bomb-up": null,
    "flame-up": null,
    "speed-up": null,
    "remote-up": null,
    "shield-up": null,
    "short-fuse-up": null,
    "bomb-pass-up": null,
    "kick-up": null,
  },
};

const game = new GameApp(root, assets);
game.startServerAuthoritativeMatch(
  [1, 2],
  { 1: 0, 2: 0, 3: 0, 4: 0 },
  { botPlayerIds: [2] },
);

const bot = game.players[2];
const enemy = game.players[1];
const setPlayerTile = (player, tile) => {
  player.position = {
    x: tile.x * TILE_SIZE + TILE_SIZE * 0.5,
    y: tile.y * TILE_SIZE + TILE_SIZE * 0.5,
  };
  player.tile = { ...tile };
};

game.flames = [];
game.bombs = [];
game.arena.solid = new Set();
game.arena.breakable = new Set();
for (const powerUp of game.arena.powerUps) {
  powerUp.collected = true;
}

const centerTile = {
  x: Math.floor(game.arena.config.grid.width / 2),
  y: Math.floor(game.arena.config.grid.height / 2),
};
setPlayerTile(bot, { x: centerTile.x - 2, y: centerTile.y });
setPlayerTile(enemy, { x: centerTile.x + 5, y: centerTile.y });
bot.spawnProtectionMs = 0;
enemy.spawnProtectionMs = 10_000;
game.suddenDeathActive = true;
game.suddenDeathTickMs = 900;
game.suddenDeathIndex = 0;
game.suddenDeathPath = [{ x: 0, y: 0 }];
game.botCommittedDirection[bot.id] = "left";

const beforeDistance = Math.abs(bot.tile.x - centerTile.x) + Math.abs(bot.tile.y - centerTile.y);
const decision = game.getBotDecision(bot);
const nextTile = decision.direction === "right"
  ? { x: bot.tile.x + 1, y: bot.tile.y }
  : decision.direction === "left"
    ? { x: bot.tile.x - 1, y: bot.tile.y }
    : decision.direction === "down"
      ? { x: bot.tile.x, y: bot.tile.y + 1 }
      : decision.direction === "up"
        ? { x: bot.tile.x, y: bot.tile.y - 1 }
        : { ...bot.tile };
const afterDistance = Math.abs(nextTile.x - centerTile.x) + Math.abs(nextTile.y - centerTile.y);
const outwardSignal = getSuddenDeathPressureSignal({
  candidateTile: { x: bot.tile.x - 1, y: bot.tile.y },
  centerTile,
  currentDistanceToCenter: beforeDistance,
  routeContinuity: true,
});
const inwardSignal = getSuddenDeathPressureSignal({
  candidateTile: { x: bot.tile.x + 1, y: bot.tile.y },
  centerTile,
  currentDistanceToCenter: beforeDistance,
  routeContinuity: false,
});
const neutralContinuity = getSuddenDeathPressureSignal({
  candidateTile: { x: bot.tile.x, y: bot.tile.y - 1 },
  centerTile: { x: bot.tile.x, y: bot.tile.y - 3 },
  currentDistanceToCenter: 2,
  routeContinuity: true,
});
const neutralTurn = getSuddenDeathPressureSignal({
  candidateTile: { x: bot.tile.x, y: bot.tile.y - 1 },
  centerTile: { x: bot.tile.x, y: bot.tile.y - 3 },
  currentDistanceToCenter: 2,
  routeContinuity: false,
});
const ranksCenterFirst = inwardSignal.score > outwardSignal.score;
const preservesContinuityTie = neutralContinuity.score > neutralTurn.score;
const preservesExteriorFallback = outwardSignal.phase === "escape-only" && Number.isFinite(outwardSignal.score);

const shortGame = new GameApp(root, assets);
shortGame.startServerAuthoritativeMatch(
  [1, 2],
  { 1: 0, 2: 0, 3: 0, 4: 0 },
  { botPlayerIds: [2] },
);
shortGame.flames = [];
shortGame.bombs = [];
shortGame.arena.breakable = new Set();
for (const powerUp of shortGame.arena.powerUps) powerUp.collected = true;
const shortBot = shortGame.players[2];
const shortEnemy = shortGame.players[1];
setPlayerTile(shortBot, centerTile);
setPlayerTile(shortEnemy, { x: centerTile.x + 5, y: centerTile.y });
shortBot.spawnProtectionMs = 0;
shortEnemy.spawnProtectionMs = 10_000;
shortGame.botCommittedDirection[shortBot.id] = null;
const shortOnlyDestination = { x: centerTile.x + 1, y: centerTile.y };
shortGame.arena.solid = new Set([
  tileKey(centerTile.x - 1, centerTile.y),
  tileKey(centerTile.x, centerTile.y - 1),
  tileKey(centerTile.x, centerTile.y + 1),
  tileKey(centerTile.x + 2, centerTile.y),
  tileKey(centerTile.x + 1, centerTile.y - 1),
  tileKey(centerTile.x + 1, centerTile.y + 1),
]);
shortGame.suddenDeathActive = true;
shortGame.suddenDeathPath = [shortOnlyDestination];
shortGame.suddenDeathIndex = 0;
shortGame.suddenDeathTickMs = 1000;
const shortContext = shortGame.createBotContext(shortGame.getDangerMap());
const shortDestinationDangerMs = shortContext.dangerMap.get(tileKey(shortOnlyDestination.x, shortOnlyDestination.y));
const shortOnlyDestinationDirection = getSuddenDeathPressureDirection(
  shortBot,
  shortContext.dangerMap,
  shortContext,
);
const rejectsShortOnlyDestination = shortOnlyDestinationDirection === null;
const pass = decision.direction === "right"
  && afterDistance < beforeDistance
  && decision.placeBomb === false
  && ranksCenterFirst
  && preservesContinuityTie
  && preservesExteriorFallback
  && rejectsShortOnlyDestination;

console.log(JSON.stringify({
  scenario: "equal-distance route choice with outward committed direction",
  controller: "deterministic",
  botTile: bot.tile,
  centerTile,
  committedDirection: "left",
  decision,
  beforeDistance,
  afterDistance,
  closesInMs: 900,
  outwardSignal,
  inwardSignal,
  ranksCenterFirst,
  preservesContinuityTie,
  preservesExteriorFallback,
  shortOnlyDestinationEtaMs: 1000,
  shortDestinationDangerMs,
  shortOnlyDestinationDirection,
  rejectsShortOnlyDestination,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
