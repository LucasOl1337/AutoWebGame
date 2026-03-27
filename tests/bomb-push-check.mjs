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
const { TILE_SIZE } = await import("../output/esm/core/config.js");
const { tileKey } = await import("../output/esm/game/arena.js");

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
const p2 = game.players[2];

function resetPlayers() {
  p1.position = { x: 2.5 * TILE_SIZE, y: 1.5 * TILE_SIZE };
  p2.position = { x: 8.5 * TILE_SIZE, y: 7.5 * TILE_SIZE };
  p1.tile = { x: 2, y: 1 };
  p2.tile = { x: 8, y: 7 };
  p1.direction = "right";
  p2.direction = "left";
  p1.spawnProtectionMs = 0;
  p2.spawnProtectionMs = 0;
  p1.kickLevel = 0;
  p1.bombPassLevel = 0;
}

function clearLane() {
  game.arena.breakable.delete(tileKey(3, 1));
  game.arena.breakable.delete(tileKey(4, 1));
  game.arena.solid.delete(tileKey(3, 1));
  game.arena.solid.delete(tileKey(4, 1));
}

function pressRight(framesMs = 140) {
  emit("keydown", keyEvent("KeyD"));
  window.advanceTime(framesMs);
  emit("keyup", keyEvent("KeyD"));
  window.advanceTime(34);
}

resetPlayers();
clearLane();
game.bombs = [
  { id: 1, ownerId: 2, tile: { x: 3, y: 1 }, fuseMs: 1500, ownerCanPass: false, flameRange: 1 },
];
pressRight();

const blockedByDefault = p1.position.x < 3 * TILE_SIZE;
const bombStayedStill = game.bombs[0]?.tile.x === 3 && game.bombs[0]?.tile.y === 1;

resetPlayers();
clearLane();
p1.kickLevel = 1;
game.bombs = [
  { id: 2, ownerId: 2, tile: { x: 3, y: 1 }, fuseMs: 1500, ownerCanPass: false, flameRange: 1 },
];
pressRight();

const kickPushesBomb = game.bombs[0]?.tile.x === 4 && game.bombs[0]?.tile.y === 1;

resetPlayers();
clearLane();
p1.bombPassLevel = 1;
game.bombs = [
  { id: 3, ownerId: 2, tile: { x: 3, y: 1 }, fuseMs: 1500, ownerCanPass: false, flameRange: 1 },
];
pressRight(260);

const bombPassTraverses = p1.position.x > 3 * TILE_SIZE;
const passDoesNotPushBomb = game.bombs[0]?.tile.x === 3 && game.bombs[0]?.tile.y === 1;

const report = {
  blockedByDefault,
  bombStayedStill,
  kickPushesBomb,
  bombPassTraverses,
  passDoesNotPushBomb,
  playerX: p1.position.x,
  bombTile: game.bombs[0]?.tile ?? null,
};

console.log(JSON.stringify(report, null, 2));

if (!blockedByDefault || !bombStayedStill || !kickPushesBomb || !bombPassTraverses || !passDoesNotPushBomb) {
  process.exit(1);
}
