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

function keyEvent(code) {
  return { code, preventDefault: noop };
}

const { GameApp } = await import("../output/esm/app/game-app.js");

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

emit("keydown", keyEvent("KeyQ"));
emit("keyup", keyEvent("KeyQ"));
window.advanceTime(2_350);
const beforeEsc = JSON.parse(window.render_game_to_text());

emit("keydown", keyEvent("Escape"));
emit("keyup", keyEvent("Escape"));

window.advanceTime(2_200);
const afterEsc = JSON.parse(window.render_game_to_text());

const report = {
  before: {
    mode: beforeEsc.mode,
    paused: beforeEsc.match.paused,
    roundOutcome: beforeEsc.match.roundOutcome,
    round: beforeEsc.match.round,
  },
  after: {
    mode: afterEsc.mode,
    paused: afterEsc.match.paused,
    roundOutcome: afterEsc.match.roundOutcome,
    round: afterEsc.match.round,
  },
  pass:
    beforeEsc.match.roundOutcome !== null &&
    afterEsc.mode === "match" &&
    afterEsc.match.round === 2 &&
    !afterEsc.match.paused &&
    afterEsc.match.roundOutcome === null,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
