Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });

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
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null, "remote-up": null },
};

const game = new GameApp(root, assets);
game.botEnabled = true;
game.startMatch();

let firstBotBombFrame = -1;
let spawnProtectionAtBomb = null;
let bombPlacedDuringSpawnProtection = false;

for (let frame = 0; frame < 180; frame += 1) {
  game.updateMatch(1000 / 60);
  const bomb = game.bombs.find((item) => item.ownerId === 2);
  if (bomb) {
    firstBotBombFrame = frame;
    spawnProtectionAtBomb = game.players[2].spawnProtectionMs;
    bombPlacedDuringSpawnProtection = game.players[2].spawnProtectionMs > 0;
    break;
  }
}

const pass = !bombPlacedDuringSpawnProtection;
const report = {
  pass,
  firstBotBombFrame,
  spawnProtectionAtBomb,
  bombPlacedDuringSpawnProtection,
  botTile: { ...game.players[2].tile },
  botAlive: game.players[2].alive,
};

console.log(JSON.stringify(report, null, 2));

if (!pass) {
  process.exit(1);
}
