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
    "short-fuse-up": null,
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
p1.position = { x: 2.5 * TILE_SIZE, y: 1.5 * TILE_SIZE };
p1.tile = { x: 2, y: 1 };
p1.spawnProtectionMs = 0;

game.arena.powerUps = [
  { type: "remote-up", tile: { x: 2, y: 1 }, revealed: true, collected: false },
  { type: "flame-up", tile: { x: 2, y: 1 }, revealed: true, collected: false },
  { type: "shield-up", tile: { x: 2, y: 1 }, revealed: true, collected: false },
  { type: "bomb-pass-up", tile: { x: 2, y: 1 }, revealed: true, collected: false },
  { type: "kick-up", tile: { x: 2, y: 1 }, revealed: true, collected: false },
  { type: "short-fuse-up", tile: { x: 2, y: 1 }, revealed: true, collected: false },
];
window.advanceTime(17);

const state = JSON.parse(window.render_game_to_text());
const player = state.players.find((entry) => entry.id === 1);
const skillSlots = player?.skillSlots ?? [];
const bombSlot = skillSlots.find((slot) => slot.type === "bomb-up") ?? null;
const flameSlot = skillSlots.find((slot) => slot.type === "flame-up") ?? null;
const remoteSlot = skillSlots.find((slot) => slot.type === "remote-up") ?? null;
const shieldSlot = skillSlots.find((slot) => slot.type === "shield-up") ?? null;
const bombPassSlot = skillSlots.find((slot) => slot.type === "bomb-pass-up") ?? null;
const kickSlot = skillSlots.find((slot) => slot.type === "kick-up") ?? null;
const shortFuseSlot = skillSlots.find((slot) => slot.type === "short-fuse-up") ?? null;
const recentPowerUpPickup = player?.recentPowerUpPickup ?? null;

window.advanceTime(2300);
const expiredState = JSON.parse(window.render_game_to_text());
const expiredPlayer = expiredState.players.find((entry) => entry.id === 1);
const expiredRecentPowerUpPickup = expiredPlayer?.recentPowerUpPickup ?? null;
const expiredRecentSlots = expiredPlayer?.skillSlots?.filter((slot) => slot.recentlyCollected) ?? [];

const report = {
  bombSlot,
  flameSlot,
  remoteSlot,
  shieldSlot,
  bombPassSlot,
  kickSlot,
  shortFuseSlot,
  recentPowerUpPickup,
  expiredRecentPowerUpPickup,
  expiredRecentSlotCount: expiredRecentSlots.length,
  pass: Boolean(
    bombSlot
      && bombSlot.acquired === false
      && bombSlot.level === 0
      && bombSlot.value === "x0"
      && bombSlot.recentlyCollected === false
      && flameSlot
      && flameSlot.acquired === true
      && flameSlot.level === 1
      && flameSlot.value === "x1"
      && flameSlot.key === null
      && flameSlot.recentlyCollected === true
      && remoteSlot
      && remoteSlot.acquired === true
      && remoteSlot.level === 1
      && remoteSlot.value === "ON"
      && remoteSlot.key === "R"
      && remoteSlot.recentlyCollected === true
      && shieldSlot
      && shieldSlot.acquired === true
      && shieldSlot.level === 1
      && shieldSlot.value === "x1"
      && shieldSlot.recentlyCollected === true
      && bombPassSlot
      && bombPassSlot.acquired === true
      && bombPassSlot.level === 1
      && bombPassSlot.value === "x1"
      && bombPassSlot.recentlyCollected === true
      && kickSlot
      && kickSlot.acquired === true
      && kickSlot.level === 1
      && kickSlot.value === "x1"
      && kickSlot.recentlyCollected === true
      && shortFuseSlot
      && shortFuseSlot.acquired === true
      && shortFuseSlot.level === 1
      && shortFuseSlot.value === "x1"
      && shortFuseSlot.recentlyCollected === true
      && recentPowerUpPickup
      && recentPowerUpPickup.type === "short-fuse-up"
      && recentPowerUpPickup.value === "x1"
      && recentPowerUpPickup.remainingMs > 0
      && expiredRecentPowerUpPickup === null
      && expiredRecentSlots.length === 0
  ),
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) {
  process.exit(1);
}
