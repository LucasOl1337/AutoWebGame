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
    "bomb-pass-up": null,
    "kick-up": null,
  },
};

function setPlayerTile(player, tile) {
  player.position = {
    x: tile.x * TILE_SIZE + TILE_SIZE * 0.5,
    y: tile.y * TILE_SIZE + TILE_SIZE * 0.5,
  };
  player.tile = { ...tile };
}

const game = new GameApp(root, assets);
game.startServerAuthoritativeMatch(
  [1, 2, 3, 4],
  { 1: 0, 2: 0, 3: 0, 4: 0 },
  { botPlayerIds: [2] },
);

const defeatedP1 = game.players[1];
const bot = game.players[2];
const liveTarget = game.players[3];
const distantPlayer = game.players[4];

game.flames = [];
game.bombs = [];
game.arena.solid = new Set();
game.arena.breakable = new Set();
for (const powerUp of game.arena.powerUps) {
  powerUp.revealed = false;
  powerUp.collected = true;
}

setPlayerTile(bot, { x: 5, y: 5 });
setPlayerTile(defeatedP1, { x: 5, y: 6 });
setPlayerTile(liveTarget, { x: 7, y: 5 });
setPlayerTile(distantPlayer, { x: 10, y: 9 });

defeatedP1.alive = false;
bot.spawnProtectionMs = 0;
bot.flameRange = 2;
bot.activeBombs = 0;
bot.maxBombs = 1;
liveTarget.alive = true;
liveTarget.spawnProtectionMs = 0;
distantPlayer.alive = true;
distantPlayer.spawnProtectionMs = 0;
game.botBombCooldownMs = 0;

const decision = game.getBotDecision(bot);
const pass = decision.placeBomb === true
  && decision.detonate !== true
  && decision.direction === null;

console.log(JSON.stringify({
  decision,
  defeatedP1: { alive: defeatedP1.alive, tile: defeatedP1.tile },
  liveTarget: { alive: liveTarget.alive, tile: liveTarget.tile },
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
