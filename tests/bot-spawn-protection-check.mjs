Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

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
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
};

const fakeCanvas = {
  width: 0,
  height: 0,
  style: {},
  setAttribute: noop,
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

const { GameApp } = await import("../output/esm/app/game-app.js");
const { TILE_SIZE } = await import("../output/esm/core/config.js");

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null },
};

const game = new GameApp(root, assets);
game.startMatch();

const bot = game.players[2];
const enemy = game.players[1];

function setPlayerTile(player, tile) {
  player.position = {
    x: tile.x * TILE_SIZE + TILE_SIZE * 0.5,
    y: tile.y * TILE_SIZE + TILE_SIZE * 0.5,
  };
  player.tile = { ...tile };
}

setPlayerTile(bot, { x: 5, y: 5 });
setPlayerTile(enemy, { x: 6, y: 5 });
game.bombs = [];
game.flames = [];
game.arena.breakable = new Set();
bot.activeBombs = 0;
bot.maxBombs = 1;
enemy.spawnProtectionMs = 1500;
game.botBombCooldownMs = 0;

const noWasteDecision = game.getBotDecision(bot);
const noWastePass = noWasteDecision.placeBomb === false;

game.arena.breakable = new Set(["5,6"]);
const breakablePressureDecision = game.getBotDecision(bot);
const breakablePressurePass = breakablePressureDecision.placeBomb === true;

const pass = noWastePass && breakablePressurePass;
console.log(JSON.stringify({
  noWasteDecision,
  breakablePressureDecision,
  enemySpawnProtectionMs: enemy.spawnProtectionMs,
  noWastePass,
  breakablePressurePass,
  pass,
}, null, 2));
if (!pass) {
  process.exit(1);
}
