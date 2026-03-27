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
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null, "remote-up": null },
};

function setPlayerTile(player, tile) {
  player.position = {
    x: tile.x * TILE_SIZE + TILE_SIZE * 0.5,
    y: tile.y * TILE_SIZE + TILE_SIZE * 0.5,
  };
  player.tile = { ...tile };
}

const game = new GameApp(root, assets);
game.startMatch();

const bot = game.players[2];
const enemy = game.players[1];
bot.spawnProtectionMs = 0;
enemy.spawnProtectionMs = 0;
bot.remoteLevel = 1;
bot.flameRange = 2;
game.flames = [];
game.arena.solid = new Set();
game.arena.breakable = new Set();
setPlayerTile(bot, { x: 4, y: 4 });
setPlayerTile(enemy, { x: 7, y: 5 });
game.bombs = [
  { id: 7001, ownerId: 2, tile: { x: 5, y: 5 }, fuseMs: 1600, ownerCanPass: false, flameRange: 2 },
];
bot.activeBombs = 1;

const detonateDecision = game.getBotDecision(bot);
const shouldDetonatePass = detonateDecision.detonate === true
  && detonateDecision.placeBomb === false;

game.updateMatch(1000 / 60);
game.updateMatch(1000 / 60);
const remoteExplosionPass = game.bombs.length === 0 && game.flames.length > 0 && enemy.alive === false;

const unsafeGame = new GameApp(root, assets);
unsafeGame.startMatch();
const unsafeBot = unsafeGame.players[2];
const unsafeEnemy = unsafeGame.players[1];
unsafeBot.spawnProtectionMs = 0;
unsafeEnemy.spawnProtectionMs = 0;
unsafeBot.remoteLevel = 1;
unsafeBot.flameRange = 2;
unsafeGame.flames = [];
unsafeGame.arena.solid = new Set();
unsafeGame.arena.breakable = new Set();
setPlayerTile(unsafeBot, { x: 3, y: 5 });
setPlayerTile(unsafeEnemy, { x: 7, y: 5 });
unsafeGame.bombs = [
  { id: 8001, ownerId: 2, tile: { x: 5, y: 5 }, fuseMs: 1600, ownerCanPass: false, flameRange: 2 },
];
unsafeBot.activeBombs = 1;

const unsafeDecision = unsafeGame.getBotDecision(unsafeBot);
const avoidsUnsafeDetonationPass = unsafeDecision.detonate !== true;

const report = {
  detonateDecision,
  shouldDetonatePass,
  remoteExplosionPass,
  unsafeDecision,
  avoidsUnsafeDetonationPass,
};

console.log(JSON.stringify(report, null, 2));

if (!shouldDetonatePass || !remoteExplosionPass || !avoidsUnsafeDetonationPass) {
  process.exit(1);
}
