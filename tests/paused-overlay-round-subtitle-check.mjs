Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });
globalThis.HTMLElement = class {
  constructor() {
    this.dataset = {};
  }
};

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
  setAttribute: noop,
  getContext: () => fakeCtx,
  closest: () => null,
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
const { SITE_COPY } = await import("../output/esm/UiLayouts/i18n.js");
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null },
};
const game = new GameApp({ appendChild: noop }, assets);
game.soundManager.playOneShot = noop;
game.start();
game.mode = "match";
game.paused = true;

function pausedOverlay(language) {
  game.setLanguage(language);
  return JSON.parse(window.render_game_to_text()).match.centerOverlay;
}

const pt = pausedOverlay("pt");
const en = pausedOverlay("en");
const report = {
  pt,
  en,
  pass:
    pt?.title === SITE_COPY.pt.canvas.pausedTitle
    && pt?.subtitle === SITE_COPY.pt.canvas.pausedSubtitle
    && pt?.footer === SITE_COPY.pt.canvas.roundStartSubtitle
    && en?.title === SITE_COPY.en.canvas.pausedTitle
    && en?.subtitle === SITE_COPY.en.canvas.pausedSubtitle
    && en?.footer === SITE_COPY.en.canvas.roundStartSubtitle,
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
