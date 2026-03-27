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
const { TILE_SIZE } = await import("../output/esm/core/config.js");

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null, "remote-up": null, "shield-up": null },
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
  { type: "shield-up", tile: { x: 2, y: 1 }, revealed: true, collected: false },
];
window.advanceTime(17);

const state = JSON.parse(window.render_game_to_text());
const player = state.players.find((entry) => entry.id === 1);
const skillSlots = player?.skillSlots ?? [];
const remoteSlot = skillSlots.find((slot) => slot.type === "remote-up") ?? null;
const shieldSlot = skillSlots.find((slot) => slot.type === "shield-up") ?? null;

const report = {
  remoteSlot,
  shieldSlot,
  pass: Boolean(
    remoteSlot
      && remoteSlot.acquired === true
      && remoteSlot.level === 1
      && remoteSlot.value === "ON"
      && remoteSlot.key === "R"
      && shieldSlot
      && shieldSlot.acquired === true
      && shieldSlot.level === 1
      && shieldSlot.value === "x1"
  ),
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) {
  process.exit(1);
}
