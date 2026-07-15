Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: class HTMLElement {}, configurable: true });

const arcs = [];
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
const { tileKey } = await import("../output/esm/Arenas/arena.js");

const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: {
    "bomb-up": null, "flame-up": null, "speed-up": null, "remote-up": null,
    "shield-up": null, "bomb-pass-up": null, "kick-up": null,
  },
};
const game = new GameApp({ appendChild: noop }, assets);
for (const x of [3, 4, 5, 6]) {
  game.arena.breakable.delete(tileKey(x, 1));
  game.arena.solid.delete(tileKey(x, 1));
}
game.players[1].position = { x: 2.5 * 32, y: 1.5 * 32 };
game.players[2].position = { x: 8.5 * 32, y: 7.5 * 32 };
game.bombs = [{ id: 91, ownerId: 2, tile: { x: 3, y: 1 }, fuseMs: 1500, ownerCanPass: false, flameRange: 1 }];

const moved = game.tryPushBombAtTile({ x: 3, y: 1 }, "right", 3);
arcs.length = 0;
game.drawBomb(game.bombs[0]);
const impactIsRendered = arcs.some(([, , radius]) => radius >= 14);

game.updateVisualEffects(250);
arcs.length = 0;
game.drawBomb(game.bombs[0]);
const impactExpiresBriefly = !arcs.some(([, , radius]) => radius > 14);

console.log(JSON.stringify({ moved, impactIsRendered, impactExpiresBriefly }, null, 2));
if (!moved || !impactIsRendered || !impactExpiresBriefly) process.exit(1);
