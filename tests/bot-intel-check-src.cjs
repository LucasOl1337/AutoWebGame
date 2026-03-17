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
  save: noop,
  restore: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
};

const fakeCanvas = {
  width: 0,
  height: 0,
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
  addEventListener: noop,
  requestAnimationFrame: noop,
};

const { GameApp } = require('../output/cjs/app/game-app.js');
const { tileKey } = require('../output/cjs/game/arena.js');
const { TILE_SIZE } = require('../output/cjs/core/config.js');

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { 'bomb-up': null, 'flame-up': null, 'speed-up': null },
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

const decisionPressure = game.getBotDecision(bot);
const pressurePass = decisionPressure && (decisionPressure.direction !== null || decisionPressure.placeBomb === true);

const botTile = game.getTileFromPosition(bot.position);
game.flames = [{ tile: { x: botTile.x, y: botTile.y }, remainingMs: 300 }];
const decisionDanger = game.getBotDecision(bot);
const dangerPass = decisionDanger.placeBomb === false && decisionDanger.direction !== null;

const customTile = { x: 8, y: 6 };
setPlayerTile(bot, customTile);
game.flames = [];
game.bombs = [];
game.botBombCooldownMs = 0;
for (const id of [1, 2]) {
  game.players[id].flameRange = 1;
}
const breakableTile = tileKey(customTile.x + 1, customTile.y);
const breakable = new Set([breakableTile]);
for (const item of game.arena.powerUps) {
  item.revealed = false;
  item.collected = false;
}
game.arena.breakable = breakable;
const decisionBomb = game.getBotDecision(bot);
const bombPass = decisionBomb.placeBomb === true;

setPlayerTile(bot, { x: 6, y: 6 });
setPlayerTile(enemy, { x: 8, y: 6 });
game.flames = [];
game.bombs = [];
game.botBombCooldownMs = 0;
game.arena.breakable = new Set();
bot.flameRange = 2;
const decisionLineBomb = game.getBotDecision(bot);
const lineBombPass = decisionLineBomb.placeBomb === true;

setPlayerTile(bot, { x: 5, y: 5 });
setPlayerTile(enemy, { x: 8, y: 5 });
game.flames = [];
game.bombs = [];
game.botBombCooldownMs = 0;
game.arena.breakable = new Set([
  tileKey(3, 5),
  tileKey(4, 4),
  tileKey(4, 6),
]);
bot.flameRange = 2;
const decisionAttackPosition = game.getBotDecision(bot);
const attackPositionPass = decisionAttackPosition.placeBomb === false && decisionAttackPosition.direction !== null;

const report = {
  pressurePass,
  dangerPass,
  bombPass,
  lineBombPass,
  attackPositionPass,
};

console.log(JSON.stringify(report, null, 2));
if (!pressurePass || !dangerPass || !bombPass || !lineBombPass || !attackPositionPass) {
  process.exit(1);
}
