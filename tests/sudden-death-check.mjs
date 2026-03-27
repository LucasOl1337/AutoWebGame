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
game.roundTimeMs = 71_000;
game.updateSuddenDeath(900);

const suddenDeathStillWaiting = game.suddenDeathActive === false;

game.roundTimeMs = 70_000;
game.updateSuddenDeath(900);

const suddenDeathActive = game.suddenDeathActive === true;
const progressed = game.suddenDeathIndex > 0;
const flameAtFirst = game.flames.some((flame) => flame.tile.x === firstTile.x && flame.tile.y === firstTile.y);
const breakableCleared = !game.arena.breakable.has(firstKey);
const powerUpRevealed = injectedPowerUp.revealed === true;

const report = {
  pathReady,
  pathLength: path.length,
  firstTile,
  breakableBefore,
  suddenDeathStillWaiting,
  suddenDeathActive,
  progressed,
  flameAtFirst,
  breakableCleared,
  powerUpRevealed,
};

console.log(JSON.stringify(report, null, 2));

if (!pathReady || !breakableBefore || !suddenDeathStillWaiting || !suddenDeathActive || !progressed || !flameAtFirst || !breakableCleared || !powerUpRevealed) {
  process.exit(1);
}
