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
const { ROUND_DURATION_MS, TILE_SIZE } = await import("../output/esm/core/config.js");

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { 'bomb-up': null, 'flame-up': null, 'speed-up': null },
};

const game = new GameApp(root, assets);
game.startMatch();

const path = game.suddenDeathPath;
const pathReady = Array.isArray(path) && path.length > 40;
const firstTile = path[0];

const firstKey = tileKey(firstTile.x, firstTile.y);
game.arena.breakable.add(firstKey);
const injectedPowerUp = { type: 'speed-up', tile: { ...firstTile }, revealed: false, collected: false };
game.arena.powerUps.push(injectedPowerUp);

const breakableBefore = game.arena.breakable.has(firstKey);
const suddenDeathStartMs = ROUND_DURATION_MS - 40_000;
game.roundTimeMs = suddenDeathStartMs + 1_000;
game.updateSuddenDeath(900);

const suddenDeathStillWaiting = game.suddenDeathActive === false;

game.players[1].position = {
  x: firstTile.x * TILE_SIZE + TILE_SIZE / 2,
  y: firstTile.y * TILE_SIZE + TILE_SIZE / 2,
};
game.players[1].tile = { ...firstTile };
game.players[1].spawnProtectionMs = 0;

game.roundTimeMs = suddenDeathStartMs;
game.updateSuddenDeath(900);
game.updateVisualEffects(340);

const suddenDeathActive = game.suddenDeathActive === true;
const progressed = game.suddenDeathIndex > 0;
const closureQueued = game.suddenDeathClosureEffects.some((effect) => effect.tile.x === firstTile.x && effect.tile.y === firstTile.y);
const closedAtFirst = game.suddenDeathClosedTiles.has(firstKey) && game.arena.solid.has(firstKey);
const breakableCleared = !game.arena.breakable.has(firstKey);
const powerUpRevealed = injectedPowerUp.revealed === true;
const playerCrushed = game.players[1].alive === false;

const report = {
  pathReady,
  pathLength: path.length,
  firstTile,
  breakableBefore,
  suddenDeathStillWaiting,
  suddenDeathActive,
  progressed,
  closureQueued,
  closedAtFirst,
  breakableCleared,
  powerUpRevealed,
  playerCrushed,
};

console.log(JSON.stringify(report, null, 2));

if (
  !pathReady
  || !breakableBefore
  || !suddenDeathStillWaiting
  || !suddenDeathActive
  || !progressed
  || !closureQueued
  || !closedAtFirst
  || !breakableCleared
  || !powerUpRevealed
  || !playerCrushed
) {
  process.exit(1);
}
