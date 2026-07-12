Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};
const fakeCtx = {
  imageSmoothingEnabled: false,
  clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop, moveTo: noop,
  lineTo: noop, closePath: noop, fill: noop, stroke: noop, arc: noop, ellipse: noop,
  drawImage: noop, fillText: noop, strokeText: noop, save: noop, restore: noop,
  setTransform: noop, createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
};
const fakeCanvas = {
  width: 0, height: 0, dataset: {}, style: {}, setAttribute: noop,
  getContext: () => fakeCtx, requestFullscreen: async () => {},
};
globalThis.document = {
  fullscreenElement: null, createElement: () => fakeCanvas, exitFullscreen: async () => {},
};
globalThis.window = {
  innerWidth: 1280, innerHeight: 720, addEventListener: noop, requestAnimationFrame: noop,
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

function setPlayerTile(player, tile) {
  player.position = { x: tile.x * TILE_SIZE + TILE_SIZE * 0.5, y: tile.y * TILE_SIZE + TILE_SIZE * 0.5 };
  player.tile = { ...tile };
}

const game = new GameApp(root, assets);
game.startMatch();
game.flames = [];
game.bombs = [];
game.arena.breakable = new Set();
for (const powerUp of game.arena.powerUps) {
  powerUp.collected = true;
  powerUp.revealed = false;
}

const bot = game.players[2];
const enemy = game.players[1];
setPlayerTile(bot, { x: 4, y: 4 });
setPlayerTile(enemy, { x: 8, y: 7 });
bot.maxBombs = 1;
bot.flameRange = 1;
bot.speedLevel = 0;
game.arena.powerUps.push(
  { type: "bomb-up", tile: { x: 4, y: 3 }, revealed: true, collected: false },
  { type: "bomb-up", tile: { x: 4, y: 5 }, revealed: true, collected: false },
);

game.botCommittedDirection[bot.id] = "down";
const keepsDirection = game.getBotDecision(bot);
game.botCommittedDirection[bot.id] = null;
const fixedOrderFallback = game.getBotDecision(bot);

const report = { keepsDirection, fixedOrderFallback };
console.log(JSON.stringify(report, null, 2));
if (keepsDirection.direction !== "down" || fixedOrderFallback.direction !== "up") {
  process.exit(1);
}
