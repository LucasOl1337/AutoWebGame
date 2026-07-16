Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: class HTMLElement {}, configurable: true });

const noop = () => {};
const translateCalls = [];
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
  translate: (x, y) => {
    translateCalls.push({ x, y });
  },
  scale: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
};

const fakeCanvas = {
  width: 0,
  height: 0,
  style: {},
  dataset: {},
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

function armAndExplodeAt(game, player, tile) {
  setPlayerTile(player, tile);
  player.alive = true;
  player.spawnProtectionMs = 999999;
  player.activeBombs = 0;
  const placed = game.placeBomb(player, false);
  if (!placed || game.bombs.length === 0) {
    throw new Error(`failed to place bomb at ${tile.x},${tile.y}`);
  }
  // Step off the bomb tile so the explosion does not kill the planter.
  setPlayerTile(player, { x: tile.x + 2, y: tile.y });
  player.spawnProtectionMs = 999999;
  game.bombs[game.bombs.length - 1].fuseMs = 0;
  game.updateBombs(0);
}

const game = new GameApp(root, assets);
game.startMatch();
game.arena.solid.clear();
game.arena.breakable.clear();
game.paused = false;
game.roundStartCueMs = 0;
// Non-zero animation clock so sin/cos offset is measurable in most phases.
game.animationClockMs = 1000;

const p1 = game.players[1];
p1.maxBombs = 3;
p1.flameRange = 1;
p1.alive = true;
p1.spawnProtectionMs = 999999;

const beforeText = JSON.parse(game.renderGameToText());
const beforeShake = beforeText.screenShake ?? null;

armAndExplodeAt(game, p1, { x: 3, y: 3 });

const afterExplodeText = JSON.parse(game.renderGameToText());
const afterShake = afterExplodeText.screenShake;
const remainingAfterExplode = afterShake?.remainingMs ?? 0;
const amplitudeAfterExplode = afterShake?.amplitudePx ?? 0;
const offsetAfterExplode = afterShake?.offset ?? { x: 0, y: 0 };
const offsetMagnitude = Math.hypot(offsetAfterExplode.x, offsetAfterExplode.y);

// Second bomb while shake is still active should stack amplitude slightly.
armAndExplodeAt(game, p1, { x: 5, y: 3 });
const stackedText = JSON.parse(game.renderGameToText());
const stackedAmplitude = stackedText.screenShake?.amplitudePx ?? 0;

// Decay through presentation update path.
game.updateVisualEffects(80);
const midText = JSON.parse(game.renderGameToText());
const remainingMid = midText.screenShake?.remainingMs ?? -1;

game.updateVisualEffects(500);
const doneText = JSON.parse(game.renderGameToText());
const remainingDone = doneText.screenShake?.remainingMs ?? -1;
const amplitudeDone = doneText.screenShake?.amplitudePx ?? -1;

// Render should apply a non-zero translate while active again.
armAndExplodeAt(game, p1, { x: 6, y: 3 });
translateCalls.length = 0;
game.render();
const shakeTranslate = translateCalls.find((entry) => Math.hypot(entry.x, entry.y) > 0.01) ?? null;

const snapshot = game.exportOnlineSnapshot();
const snapshotHasScreenShake = Object.prototype.hasOwnProperty.call(snapshot, "screenShake")
  || JSON.stringify(snapshot).includes("screenShake");

const report = {
  beforeShake,
  remainingAfterExplode,
  amplitudeAfterExplode,
  offsetAfterExplode,
  offsetMagnitude,
  stackedAmplitude,
  remainingMid,
  remainingDone,
  amplitudeDone,
  shakeTranslate,
  snapshotHasScreenShake,
  pass: remainingAfterExplode >= 120
    && remainingAfterExplode <= 220
    && amplitudeAfterExplode >= 2
    && amplitudeAfterExplode <= 6
    && offsetMagnitude > 0
    && stackedAmplitude > amplitudeAfterExplode
    && remainingMid > 0
    && remainingMid < remainingAfterExplode + 80
    && remainingDone === 0
    && amplitudeDone === 0
    && shakeTranslate !== null
    && snapshotHasScreenShake === false,
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) {
  process.exit(1);
}
