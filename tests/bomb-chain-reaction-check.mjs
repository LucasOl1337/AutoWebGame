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
  dataset: {},
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
const emptySprites = { up: null, down: null, left: null, right: null };
const assets = {
  players: { 1: emptySprites, 2: emptySprites },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null },
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
game.arena.solid.clear();
game.arena.breakable.clear();

const p1 = game.players[1];
setPlayerTile(p1, { x: 3, y: 3 });
p1.spawnProtectionMs = 0;
p1.maxBombs = 2;
p1.flameRange = 2;
game.placeBomb(p1, false);

setPlayerTile(p1, { x: 4, y: 3 });
game.placeBomb(p1, false);

const beforeBombIds = game.bombs.map((bomb) => bomb.id);
const secondBombTile = game.bombs[1] ? { ...game.bombs[1].tile } : null;

game.bombs[0].fuseMs = 0;
game.updateBombs(17);

const remainingBombIds = game.bombs.map((bomb) => bomb.id);
const secondBombTriggeredInstantly = secondBombTile
  ? game.flames.some((flame) => flame.tile.x === secondBombTile.x && flame.tile.y === secondBombTile.y)
  : false;
const bothBombsExplodedSameTick = remainingBombIds.length === 0;
const ownerBombCountReset = game.players[1].activeBombs === 0;

const report = {
  beforeBombIds,
  remainingBombIds,
  secondBombTile,
  secondBombTriggeredInstantly,
  bothBombsExplodedSameTick,
  ownerBombCountReset,
  pass: beforeBombIds.length === 2
    && secondBombTriggeredInstantly
    && bothBombsExplodedSameTick
    && ownerBombCountReset,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
