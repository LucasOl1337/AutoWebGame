Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: class HTMLElement {}, configurable: true });

const noop = () => {};
const gradient = () => ({ addColorStop: noop });
const fakeCtx = new Proxy(
  { imageSmoothingEnabled: false, createLinearGradient: gradient, createRadialGradient: gradient },
  { get: (target, key) => target[key] ?? noop },
);
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
globalThis.document = { fullscreenElement: null, createElement: () => fakeCanvas, exitFullscreen: async () => {} };
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  addEventListener: noop,
  removeEventListener: noop,
  requestAnimationFrame: noop,
};

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");
const { formatBombFuseSeconds } = await import("../output/esm/Gameplay/powerups.js");
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null, "remote-up": null, "shield-up": null, "bomb-pass-up": null, "kick-up": null, "short-fuse-up": null },
};
const game = new GameApp({ appendChild: noop }, assets);
game.start();
const player = game.players[1];
player.position = { x: 2.5 * TILE_SIZE, y: 1.5 * TILE_SIZE };
player.tile = { x: 2, y: 1 };

const collectShortFuse = () => {
  const powerUp = { type: "short-fuse-up", tile: { x: 2, y: 1 }, revealed: true, collected: false };
  game.arena.powerUps = [powerUp];
  game.collectPowerUps();
  const notice = game.getLatestPowerUpPickupNotice(1);
  return {
    collected: powerUp.collected,
    value: notice?.valueLabel,
    compact: notice ? game.formatPowerUpPickupNotice(notice, 8) : null,
    expanded: notice ? game.formatPowerUpPickupNotice(notice, 20) : null,
    expectedFuse: formatBombFuseSeconds(player),
  };
};

const first = collectShortFuse();
const second = collectShortFuse();
const pass = first.collected
  && first.value === "1.60s"
  && first.expectedFuse === "1.60s"
  && first.compact === "SF 1.60s"
  && first.expanded === "SF 1.60s"
  && second.collected
  && second.value === "1.20s"
  && second.expectedFuse === "1.20s"
  && second.compact === "SF 1.20s"
  && second.expanded === "SF 1.20s";

console.log(JSON.stringify({ first, second, pass }, null, 2));
if (!pass) process.exit(1);
