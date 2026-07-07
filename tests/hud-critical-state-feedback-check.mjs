Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: class HTMLElement {}, configurable: true });

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
  translate: noop,
  scale: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
};

const fakeCanvas = {
  width: 0,
  height: 0,
  dataset: {},
  style: {},
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
  powerUps: {
    "bomb-up": null,
    "flame-up": null,
    "speed-up": null,
    "remote-up": null,
    "shield-up": null,
    "bomb-pass-up": null,
    "kick-up": null,
  },
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
p1.spawnProtectionMs = 0;
game.placeBomb(p1);

const beforeCritical = JSON.parse(window.render_game_to_text());
window.advanceTime(850);
const duringCritical = JSON.parse(window.render_game_to_text());
p1.flameGuardMs = 500;
const guardedCritical = JSON.parse(window.render_game_to_text());

const p1Before = beforeCritical.players.find((entry) => entry.id === 1);
const p1During = duringCritical.players.find((entry) => entry.id === 1);
const p1Guarded = guardedCritical.players.find((entry) => entry.id === 1);

const report = {
  before: p1Before?.hudStatus ?? null,
  during: p1During?.hudStatus ?? null,
  guarded: p1Guarded?.hudStatus ?? null,
  pass: p1Before?.hudStatus?.label === "LIVE"
    && p1Before?.hudStatus?.critical === false
    && p1During?.hudStatus?.label === "DANGER"
    && p1During?.hudStatus?.tone === "danger"
    && p1During?.hudStatus?.critical === true
    && typeof p1During?.hudStatus?.dangerEtaMs === "number"
    && p1During.hudStatus.dangerEtaMs > 0
    && p1During.hudStatus.dangerEtaMs <= 1_200
    && p1Guarded?.hudStatus?.label === "GUARD"
    && p1Guarded?.hudStatus?.critical === false,
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) {
  process.exit(1);
}
