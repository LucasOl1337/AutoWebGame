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
  },
};

const game = new GameApp(root, assets);
game.start();
emit("keydown", keyEvent("KeyE"));
emit("keyup", keyEvent("KeyE"));
emit("keydown", keyEvent("KeyP"));
emit("keyup", keyEvent("KeyP"));
window.advanceTime(34);

const breakableCount = game.arena.breakable.size;
const dropCount = game.arena.powerUps.length;
const dropRatio = breakableCount > 0 ? dropCount / breakableCount : 0;
const roundedDropRatio = Math.round(dropRatio * 1000) / 1000;
const speedDropCount = game.arena.powerUps.filter((powerUp) => powerUp.type === "speed-up").length;
const remoteDropCount = game.arena.powerUps.filter((powerUp) => powerUp.type === "remote-up").length;
const expectedRemoteToSpeedDistribution = { remote: 2, speed: 8 };
const hasExpectedRemoteToSpeedDistribution = (
  remoteDropCount === expectedRemoteToSpeedDistribution.remote
  && speedDropCount === expectedRemoteToSpeedDistribution.speed
);
const utilityDropTypes = ["shield-up", "bomb-pass-up", "kick-up"];
const tacticalDropTypes = ["short-fuse-up"];
const utilityDropCounts = Object.fromEntries(
  [...utilityDropTypes, ...tacticalDropTypes].map((type) => [
    type,
    game.arena.powerUps.filter((powerUp) => powerUp.type === type).length,
  ]),
);
const hasTacticalDrops = tacticalDropTypes.every((type) => utilityDropCounts[type] > 0);
const specialDropCount = [...utilityDropTypes, ...tacticalDropTypes]
  .reduce((total, type) => total + utilityDropCounts[type], 0);
const hasDenseBreakables = breakableCount >= 24;
const expectedDropCount = 22;
const expectedDropRatio = 0.611;
const expectedDropTypeCounts = {
  "bomb-up": 0,
  "flame-up": 2,
  "speed-up": 8,
  "remote-up": 2,
  "shield-up": 4,
  "short-fuse-up": 2,
  "bomb-pass-up": 4,
  "kick-up": 0,
};
const actualDropTypeCounts = Object.fromEntries(
  Object.keys(expectedDropTypeCounts).map((type) => [
    type,
    game.arena.powerUps.filter((powerUp) => powerUp.type === type).length,
  ]),
);
const hasExpectedDeterministicDistribution = Object.entries(expectedDropTypeCounts)
  .every(([type, count]) => actualDropTypeCounts[type] === count);

const report = {
  breakableCount,
  dropCount,
  expectedDropCount,
  dropRatio: roundedDropRatio,
  expectedDropRatio,
  speedDropCount,
  remoteDropCount,
  expectedRemoteToSpeedDistribution,
  hasExpectedRemoteToSpeedDistribution,
  utilityDropCounts,
  actualDropTypeCounts,
  expectedDropTypeCounts,
  hasExpectedDeterministicDistribution,
  hasTacticalDrops,
  specialDropCount,
  hasDenseBreakables,
  pass: (
    hasDenseBreakables
    && dropCount === expectedDropCount
    && roundedDropRatio === expectedDropRatio
    && hasExpectedDeterministicDistribution
    && hasExpectedRemoteToSpeedDistribution
    && speedDropCount > 0
    && specialDropCount >= 8
    && hasTacticalDrops
  ),
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) {
  process.exit(1);
}
