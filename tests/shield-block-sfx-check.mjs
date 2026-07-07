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
const played = [];
game.soundManager.playOneShot = (key) => {
  played.push(key);
};

game.start();
emit("keydown", keyEvent("KeyE"));
emit("keyup", keyEvent("KeyE"));
emit("keydown", keyEvent("KeyP"));
emit("keyup", keyEvent("KeyP"));
window.advanceTime(34);
played.length = 0;

const p1 = game.players[1];
p1.position = { x: 2.5 * TILE_SIZE, y: 1.5 * TILE_SIZE };
p1.tile = { x: 2, y: 1 };
p1.spawnProtectionMs = 0;
p1.shieldCharges = 1;
p1.flameGuardMs = 0;

game.flames = [{ tile: { x: 2, y: 1 }, remainingMs: 400 }];
game.resolvePlayerDeathsFromFlames();
window.advanceTime(17);

const shieldBlockCalls = played.filter((key) => key === "shieldBlock");
const survivedFirstFlame = game.players[1].alive === true;
const shieldSpentOnHit = game.players[1].shieldCharges === 0;
const guardWindowActive = (game.players[1].flameGuardMs ?? 0) > 0;

played.length = 0;
game.flames = [{ tile: { x: 2, y: 1 }, remainingMs: 400 }];
game.resolvePlayerDeathsFromFlames();
window.advanceTime(17);
const noReplayDuringGuard = !played.includes("shieldBlock");

game.players[1].flameGuardMs = 0;
game.flames = [{ tile: { x: 2, y: 1 }, remainingMs: 400 }];
game.resolvePlayerDeathsFromFlames();
window.advanceTime(17);
const diesWithoutShieldOrGuard = game.players[1].alive === false;
const noReplayOnDeath = !played.includes("shieldBlock");

const pass = shieldBlockCalls.length === 1
  && survivedFirstFlame
  && shieldSpentOnHit
  && guardWindowActive
  && noReplayDuringGuard
  && diesWithoutShieldOrGuard
  && noReplayOnDeath;

console.log(JSON.stringify({
  shieldBlockCalls,
  survivedFirstFlame,
  shieldSpentOnHit,
  guardWindowActive,
  noReplayDuringGuard,
  diesWithoutShieldOrGuard,
  noReplayOnDeath,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
