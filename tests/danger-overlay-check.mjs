Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });

const noop = () => {};
const listeners = new Map();

function on(type, handler) {
  const list = listeners.get(type) ?? [];
  list.push(handler);
  listeners.set(type, list);
}

function emit(type, event) {
  const list = listeners.get(type) ?? [];
  for (const handler of list) {
    handler(event);
  }
}

function keyEvent(code) {
  return { code, preventDefault: noop };
}

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
  addEventListener: on,
  requestAnimationFrame: noop,
};

const { GameApp } = await import("../output/esm/app/game-app.js");
const { BOMB_FUSE_MS, TILE_SIZE } = await import("../output/esm/core/config.js");

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null },
};

const game = new GameApp(root, assets);
game.start();
emit("keydown", keyEvent("KeyE"));
emit("keyup", keyEvent("KeyE"));
emit("keydown", keyEvent("KeyP"));
emit("keyup", keyEvent("KeyP"));
window.advanceTime(34);

const p1 = game.players[1];
p1.position = { x: 2.5 * TILE_SIZE, y: 3.5 * TILE_SIZE };
p1.tile = { x: 2, y: 3 };
p1.flameRange = 2;
game.placeBomb(p1);
const placedBomb = game.bombs[0];

const stateWithOverlay = JSON.parse(window.render_game_to_text());
const overlayEnabledInitially = stateWithOverlay.match.dangerOverlay.enabled === true;
const overlayDisabledInitially = stateWithOverlay.match.dangerOverlay.enabled === false;
const dangerTilesInitially = stateWithOverlay.match.dangerOverlay.tiles ?? [];
const hasBombCenterTile = placedBomb
  ? dangerTilesInitially.some((item) => (
    item.x === placedBomb.tile.x
    && item.y === placedBomb.tile.y
    && item.etaMs <= BOMB_FUSE_MS
  ))
  : false;

emit("keydown", keyEvent("KeyV"));
emit("keyup", keyEvent("KeyV"));
window.advanceTime(17);

const stateAfterKeyPress = JSON.parse(window.render_game_to_text());
const overlayStillDisabled = stateAfterKeyPress.match.dangerOverlay.enabled === false;
const tilesStillHidden = (stateAfterKeyPress.match.dangerOverlay.tiles ?? []).length === 0;

const report = {
  overlayEnabledInitially,
  overlayDisabledInitially,
  dangerousTileCount: dangerTilesInitially.length,
  hasBombCenterTile,
  overlayStillDisabled,
  tilesStillHidden,
  pass: !overlayEnabledInitially
    && overlayDisabledInitially
    && !hasBombCenterTile
    && overlayStillDisabled
    && tilesStillHidden,
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) {
  process.exit(1);
}
