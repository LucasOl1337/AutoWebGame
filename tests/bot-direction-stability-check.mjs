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
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null },
};

const game = new GameApp(root, assets);
game.startMatch();
game.botEnabled = true;
game.arena.solid = new Set();
game.arena.breakable = new Set();
game.bombs = [];
game.flames = [];

const bot = game.players[2];
bot.spawnProtectionMs = 0;
bot.position = { x: 5 * TILE_SIZE + TILE_SIZE * 0.5, y: 5 * TILE_SIZE + TILE_SIZE * 0.75 };
bot.tile = { x: 5, y: 5 };
bot.direction = "down";
bot.lastMoveDirection = "down";

let decisionCalls = 0;
game.getBotDecision = () => ({
  direction: decisionCalls++ % 2 === 0 ? "up" : "down",
  placeBomb: false,
});

let reversedMidTile = false;
let previousY = bot.position.y;
for (let frame = 0; frame < 4; frame += 1) {
  game.updatePlayers(1000 / 60);
  if (bot.direction !== "down" || bot.lastMoveDirection !== "down") {
    reversedMidTile = true;
    break;
  }
  if (bot.position.y <= previousY) {
    reversedMidTile = true;
    break;
  }
  previousY = bot.position.y;
}

const report = {
  decisionCalls,
  botDirection: bot.direction,
  lastMoveDirection: bot.lastMoveDirection,
  botPosition: bot.position,
  reversedMidTile,
  pass: !reversedMidTile,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
