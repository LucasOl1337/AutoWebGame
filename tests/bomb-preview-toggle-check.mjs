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

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");

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
p1.position = { x: 4.5 * TILE_SIZE, y: 4.5 * TILE_SIZE };
p1.tile = { x: 4, y: 4 };
p1.flameRange = 2;

const stateWithPreview = JSON.parse(window.render_game_to_text());
const previewInitiallyEnabled = stateWithPreview.match.bombPreview?.enabled === true;
const previewInitiallyDisabled = stateWithPreview.match.bombPreview?.enabled === false;
const previewTileCount = stateWithPreview.match.bombPreview?.tiles?.length ?? 0;
const includesCenterTile = (stateWithPreview.match.bombPreview?.tiles ?? []).some((tile) => tile.x === 4 && tile.y === 4);
const includesRange2Tile = (stateWithPreview.match.bombPreview?.tiles ?? []).some((tile) => tile.x === 6 && tile.y === 4);

emit("keydown", keyEvent("KeyC"));
emit("keyup", keyEvent("KeyC"));
window.advanceTime(17);

const stateAfterKeyPress = JSON.parse(window.render_game_to_text());
const previewStillDisabled = stateAfterKeyPress.match.bombPreview?.enabled === false;
const previewStillHidden = (stateAfterKeyPress.match.bombPreview?.tiles ?? []).length === 0;

const report = {
  previewInitiallyEnabled,
  previewInitiallyDisabled,
  previewTileCount,
  includesCenterTile,
  includesRange2Tile,
  previewStillDisabled,
  previewStillHidden,
  pass: !previewInitiallyEnabled
    && previewInitiallyDisabled
    && previewTileCount === 0
    && !includesCenterTile
    && !includesRange2Tile
    && previewStillDisabled
    && previewStillHidden,
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) {
  process.exit(1);
}
