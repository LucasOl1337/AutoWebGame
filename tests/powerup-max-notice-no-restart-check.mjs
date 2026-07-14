Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: class HTMLElement {}, configurable: true });

const noop = () => {};
const gradient = () => ({ addColorStop: noop });
const fakeCtx = new Proxy({ imageSmoothingEnabled: false, createLinearGradient: gradient, createRadialGradient: gradient }, { get: (target, key) => target[key] ?? noop });
const fakeCanvas = { width: 0, height: 0, dataset: {}, style: {}, setAttribute: noop, closest: () => null, getContext: () => fakeCtx, requestFullscreen: async () => {} };
globalThis.document = { fullscreenElement: null, createElement: () => fakeCanvas, exitFullscreen: async () => {} };
globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener: noop, requestAnimationFrame: noop };

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { TILE_SIZE, MAX_BOMBS } = await import("../output/esm/PersonalConfig/config.js");
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null }, props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null, "remote-up": null, "shield-up": null, "bomb-pass-up": null, "kick-up": null, "short-fuse-up": null },
};
const game = new GameApp({ appendChild: noop }, assets);
game.start();
const powerUp = { type: "bomb-up", tile: { x: 2, y: 1 }, revealed: true, collected: false };
game.arena.powerUps = [powerUp];
const player = game.players[1];
player.maxBombs = MAX_BOMBS;
player.position = { x: 2.5 * TILE_SIZE, y: 1.5 * TILE_SIZE };
player.tile = { x: 2, y: 1 };

game.collectPowerUps();
const initialNotice = game.getPowerUpPickupNotice(1, "bomb-up");
game.updateVisualEffects(250);
const remainingAfterAdvance = initialNotice?.remainingMs;
game.collectPowerUps();
const noticeAfterNextTick = game.getPowerUpPickupNotice(1, "bomb-up");

const maxNoticeKept = initialNotice?.valueLabel === "MAX" && noticeAfterNextTick === initialNotice;
const timerNotRestarted = remainingAfterAdvance === noticeAfterNextTick?.remainingMs && remainingAfterAdvance === 1950;
const pickupPreserved = !powerUp.collected;
const rulesPreserved = player.maxBombs === MAX_BOMBS;
const report = { maxNoticeKept, timerNotRestarted, pickupPreserved, rulesPreserved, pass: maxNoticeKept && timerNotRestarted && pickupPreserved && rulesPreserved };
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
