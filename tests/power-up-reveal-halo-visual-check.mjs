Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: class HTMLElement {}, configurable: true });

const noop = () => {};
const arcs = [];
const fakeCtx = {
  imageSmoothingEnabled: false,
  globalAlpha: 1,
  strokeStyle: "",
  lineWidth: 1,
  clearRect: noop,
  fillRect: noop,
  strokeRect: noop,
  beginPath: noop,
  moveTo: noop,
  lineTo: noop,
  closePath: noop,
  fill: noop,
  stroke: noop,
  arc: (...args) => arcs.push({ args, strokeStyle: fakeCtx.strokeStyle, globalAlpha: fakeCtx.globalAlpha }),
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

const emptySprites = { up: null, down: null, left: null, right: null };
const assets = {
  players: { 1: emptySprites, 2: emptySprites },
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

const game = new GameApp({ appendChild: noop }, assets);
const powerUp = {
  type: "speed-up",
  tile: { x: 4, y: 3 },
  revealed: true,
  collected: false,
};
game.powerUpRevealStartedAtMs.set(powerUp, 1000);

game.animationClockMs = 1000;
arcs.length = 0;
game.drawPowerUp(powerUp);
const initialHalo = [...arcs];
const initialOuterRadius = initialHalo[0]?.args[2] ?? 0;

game.animationClockMs = 1130;
arcs.length = 0;
game.drawPowerUp(powerUp);
const midHalo = [...arcs];
const midHaloUsesPowerUpTint = midHalo.some((entry) => entry.strokeStyle === "#7cffb2");
const midHaloExpanded = (midHalo[0]?.args[2] ?? 0) > initialOuterRadius;

game.animationClockMs = 1300;
arcs.length = 0;
game.drawPowerUp(powerUp);
const haloAfterReveal = arcs.filter((entry) => entry.args[2] >= 12);

const report = {
  initialArcCount: initialHalo.length,
  midArcCount: midHalo.length,
  midHaloUsesPowerUpTint,
  midHaloExpanded,
  haloAfterRevealCount: haloAfterReveal.length,
  pass: initialHalo.length === 2
    && midHalo.length === 2
    && midHaloUsesPowerUpTint
    && midHaloExpanded
    && haloAfterReveal.length === 0,
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
