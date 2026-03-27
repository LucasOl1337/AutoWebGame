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
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null },
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
];
window.advanceTime(17);

const collectedRemote = game.arena.powerUps[0]?.collected === true;
const remoteLevelAfterPickup = game.players[1].remoteLevel ?? 0;

emit("keydown", keyEvent("KeyQ"));
emit("keyup", keyEvent("KeyQ"));
window.advanceTime(17);

const plantedBomb = game.bombs.find((bomb) => bomb.ownerId === 1) ?? null;
const plantedBombId = plantedBomb?.id ?? null;
const plantedTile = plantedBomb ? { ...plantedBomb.tile } : null;

emit("keydown", keyEvent("KeyR"));
emit("keyup", keyEvent("KeyR"));
window.advanceTime(17);

const bombDetonated = plantedBombId !== null && !game.bombs.some((bomb) => bomb.id === plantedBombId);
const flameAtBombTile = Boolean(
  plantedTile && game.flames.some((flame) => flame.tile.x === plantedTile.x && flame.tile.y === plantedTile.y),
);
const activeBombsReset = game.players[1].activeBombs === 0;

const report = {
  collectedRemote,
  remoteLevelAfterPickup,
  plantedBombId,
  bombDetonated,
  flameAtBombTile,
  activeBombsReset,
  pass: collectedRemote
    && remoteLevelAfterPickup > 0
    && plantedBombId !== null
    && bombDetonated
    && flameAtBombTile
    && activeBombsReset,
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) {
  process.exit(1);
}
