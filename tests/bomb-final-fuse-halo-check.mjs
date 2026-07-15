Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: class HTMLElement {}, configurable: true });

const noop = () => {};
const arcs = [];
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
  arc: (...args) => arcs.push(args),
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
  addEventListener: noop,
  requestAnimationFrame: noop,
};

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: {},
};
const game = new GameApp(root, assets);
const bomb = { id: 1, ownerId: 1, tile: { x: 2, y: 3 }, fuseMs: 900, ownerCanPass: false, flameRange: 2 };

arcs.length = 0;
game.drawBomb(bomb);
const calmArcCount = arcs.length;

arcs.length = 0;
game.drawBomb({ ...bomb, fuseMs: 220 });
const criticalArcs = [...arcs];
const criticalArcCount = criticalArcs.length;
const segmentedArcs = criticalArcs.filter(([, , , start, end]) => end - start < Math.PI).length;

const report = {
  calmArcCount,
  criticalArcCount,
  segmentedArcs,
  pass: calmArcCount === 2 && criticalArcCount === 11 && segmentedArcs === 8,
};
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
