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
const { tileKey } = await import("../output/esm/game/arena.js");

const root = { appendChild: noop };
const assets = {
  players: {
    1: { up: null, down: null, left: null, right: null, walk: { up: [], down: [], left: [], right: [] } },
    2: { up: null, down: null, left: null, right: null, walk: { up: [], down: [], left: [], right: [] } },
  },
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

setPlayerTile(bot, { x: 2, y: 2 });
setPlayerTile(enemy, { x: 1, y: 1 });
game.flames = [];
game.bombs = [
  {
    id: 4401,
    ownerId: 2,
    tile: { x: 2, y: 3 },
    fuseMs: 1700,
    ownerCanPass: false,
    flameRange: 2,
  },
];
game.arena.breakable = new Set();

const decision = game.getBotDecision(bot);
const directionDelta = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const blast = game.getBombBlastKeys({ x: 2, y: 3 }, 2);
const nextTile = decision.direction
  ? {
      x: bot.tile.x + directionDelta[decision.direction].x,
      y: bot.tile.y + directionDelta[decision.direction].y,
    }
  : null;
const escapesBlast = nextTile ? !blast.has(tileKey(nextTile.x, nextTile.y)) : false;
const pass = decision.direction !== null && escapesBlast;

console.log(JSON.stringify({
  decision,
  nextTile,
  escapesBlast,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
