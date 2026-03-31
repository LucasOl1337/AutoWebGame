Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

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
  addEventListener: noop,
  requestAnimationFrame: noop,
};

const { GameApp } = await import("../output/esm/Engine/game-app.js");

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null },
};

const game = new GameApp(root, assets);
game.startMatch();

const bot = game.players[2];
const p1 = game.players[1];
const FRAMES_10_SECONDS = 60 * 10;
let deadAtFrame = -1;

for (let frame = 0; frame < FRAMES_10_SECONDS; frame += 1) {
  p1.velocity = { x: 0, y: 0 };
  game.updateMatch(1000 / 60);
  if (!bot.alive) {
    deadAtFrame = frame;
    break;
  }
}

const pass = deadAtFrame === -1;
const report = {
  pass,
  deadAtFrame,
  botTile: { ...bot.tile },
  roundTimeMs: Math.round(game.roundTimeMs),
};

console.log(JSON.stringify(report, null, 2));

if (!pass) {
  process.exit(1);
}
