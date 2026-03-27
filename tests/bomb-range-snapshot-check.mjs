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
const { tileKey } = await import("../output/esm/game/arena.js");
const { BOMB_FUSE_MS, FLAME_DURATION_MS, TILE_SIZE } = await import("../output/esm/core/config.js");

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
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

const p1 = game.players[1];
setPlayerTile(p1, { x: 5, y: 4 });
p1.flameRange = 1;

game.placeBomb(p1);
const plantedBomb = game.bombs[0];
const bombTile = { ...plantedBomb.tile };

// Upgrade after planting should not affect this already planted bomb.
p1.flameRange = 4;

const dangerMap = game.getDangerMap();
const right1 = dangerMap.get(tileKey(bombTile.x + 1, bombTile.y));
const right2 = dangerMap.get(tileKey(bombTile.x + 2, bombTile.y));

// Force bomb explosion now and inspect resulting flames.
game.bombs[0].fuseMs = 0;
game.updateBombs(BOMB_FUSE_MS + 1);

const flamesOnRight1 = game.flames.some((flame) => flame.tile.x === bombTile.x + 1 && flame.tile.y === bombTile.y);
const flamesOnRight2 = game.flames.some((flame) => flame.tile.x === bombTile.x + 2 && flame.tile.y === bombTile.y);
const expectedFlameDuration = game.flames.every((flame) => flame.remainingMs === FLAME_DURATION_MS);

const report = {
  bombTile,
  bombFlameRangeSnapshot: plantedBomb.flameRange,
  playerFlameRangeAfterPickup: p1.flameRange,
  dangerAtRange1: right1,
  dangerAtRange2: right2 ?? null,
  flamesOnRight1,
  flamesOnRight2,
  expectedFlameDuration,
  pass: plantedBomb.flameRange === 1
    && right1 === BOMB_FUSE_MS
    && right2 === undefined
    && flamesOnRight1
    && !flamesOnRight2
    && expectedFlameDuration,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
