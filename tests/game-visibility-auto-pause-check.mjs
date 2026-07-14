Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });
globalThis.HTMLElement = class {
  constructor() {
    this.dataset = {};
  }
};

const noop = () => {};
const windowListeners = new Map();
const documentListeners = new Map();

function on(map, type, handler) {
  const list = map.get(type) ?? [];
  list.push(handler);
  map.set(type, list);
}

function emit(map, type, event) {
  const list = map.get(type) ?? [];
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
  translate: noop,
  scale: noop,
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
  closest: () => null,
  requestFullscreen: async () => {},
};

globalThis.document = {
  body: {},
  fullscreenElement: null,
  visibilityState: "visible",
  addEventListener: (type, handler) => on(documentListeners, type, handler),
  createElement: () => fakeCanvas,
  exitFullscreen: async () => {},
};

globalThis.window = {
  document: globalThis.document,
  location: { search: "" },
  innerWidth: 1280,
  innerHeight: 720,
  addEventListener: (type, handler) => on(windowListeners, type, handler),
  requestAnimationFrame: noop,
};

function keyEvent(code) {
  return { code, preventDefault: noop, target: null };
}

function emitWindow(type, event) {
  emit(windowListeners, type, event);
}

function emitDocument(type) {
  emit(documentListeners, type);
}

function press(code) {
  emitWindow("keydown", keyEvent(code));
  emitWindow("keyup", keyEvent(code));
}

function readState() {
  return JSON.parse(window.render_game_to_text());
}

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { createDefaultArenaDefinition } = await import("../output/esm/Arenas/arena.js");

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null },
};

const localGame = new GameApp(root, assets);
localGame.start();

press("KeyE");
press("KeyP");
window.advanceTime(34);

const beforeBlur = readState();
emitWindow("blur");
const afterBlur = readState();
window.advanceTime(1_000);
const afterBlurAdvance = readState();

press("Escape");
window.advanceTime(34);
const afterResume = readState();

document.visibilityState = "hidden";
emitDocument("visibilitychange");
const afterHidden = readState();
window.advanceTime(1_000);
const afterHiddenAdvance = readState();

document.visibilityState = "visible";

const onlineHost = new GameApp(root, assets);
onlineHost.start();
onlineHost.startServerAuthoritativeMatch([1, 2], { 1: 0, 2: 1, 3: 0, 4: 1 }, {
  arena: createDefaultArenaDefinition(),
});
const onlineBeforeBlur = readState();
emitWindow("blur");
const onlineAfterBlur = readState();

window.location.search = "?airi=1";
document.visibilityState = "visible";
const airiGame = new GameApp(root, assets);
airiGame.start();
airiGame.startServerAuthoritativeMatch([1, 2], { 1: 0, 2: 1, 3: 0, 4: 1 }, {
  arena: createDefaultArenaDefinition(),
  botPlayerIds: [2],
});
window.advanceTime(34);
const airiBeforeBlur = readState();
emitWindow("blur");
const airiAfterBlur = readState();
window.advanceTime(1_000);
const airiAfterBlurAdvance = readState();

const localPass = beforeBlur.mode === "match"
  && beforeBlur.match.paused === false
  && afterBlur.match.paused === true
  && afterBlur.match.autoPausedForHiddenTab === true
  && afterBlurAdvance.match.remainingMs === afterBlur.match.remainingMs
  && afterResume.match.paused === false
  && afterResume.match.autoPausedForHiddenTab === false
  && afterResume.match.remainingMs < afterBlurAdvance.match.remainingMs
  && afterHidden.match.paused === true
  && afterHidden.match.autoPausedForHiddenTab === true
  && afterHiddenAdvance.match.remainingMs === afterHidden.match.remainingMs;

const onlinePass = onlineBeforeBlur.mode === "match"
  && onlineBeforeBlur.match.paused === false
  && onlineAfterBlur.match.paused === false
  && onlineAfterBlur.match.autoPausedForHiddenTab === false;

const airiPass = airiBeforeBlur.mode === "match"
  && airiBeforeBlur.match.paused === false
  && airiAfterBlur.match.paused === false
  && airiAfterBlur.match.autoPausedForHiddenTab === false
  && airiAfterBlurAdvance.match.remainingMs < airiAfterBlur.match.remainingMs;

const report = {
  local: {
    beforeBlur: {
      paused: beforeBlur.match.paused,
      remainingMs: beforeBlur.match.remainingMs,
    },
    afterBlur: {
      paused: afterBlur.match.paused,
      autoPausedForHiddenTab: afterBlur.match.autoPausedForHiddenTab,
      remainingMs: afterBlur.match.remainingMs,
    },
    afterBlurAdvance: {
      paused: afterBlurAdvance.match.paused,
      remainingMs: afterBlurAdvance.match.remainingMs,
    },
    afterResume: {
      paused: afterResume.match.paused,
      autoPausedForHiddenTab: afterResume.match.autoPausedForHiddenTab,
      remainingMs: afterResume.match.remainingMs,
    },
    afterHidden: {
      paused: afterHidden.match.paused,
      autoPausedForHiddenTab: afterHidden.match.autoPausedForHiddenTab,
      remainingMs: afterHidden.match.remainingMs,
    },
    afterHiddenAdvance: {
      paused: afterHiddenAdvance.match.paused,
      remainingMs: afterHiddenAdvance.match.remainingMs,
    },
  },
  online: {
    beforeBlurPaused: onlineBeforeBlur.match.paused,
    afterBlurPaused: onlineAfterBlur.match.paused,
    autoPausedForHiddenTab: onlineAfterBlur.match.autoPausedForHiddenTab,
  },
  airi: {
    beforeBlurPaused: airiBeforeBlur.match.paused,
    afterBlurPaused: airiAfterBlur.match.paused,
    autoPausedForHiddenTab: airiAfterBlur.match.autoPausedForHiddenTab,
    remainingMsAdvanced: airiAfterBlurAdvance.match.remainingMs < airiAfterBlur.match.remainingMs,
  },
  pass: localPass && onlinePass && airiPass,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
