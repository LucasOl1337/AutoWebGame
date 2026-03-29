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

const { GameApp } = await import("../output/esm/app/game-app.js");
const { BOMB_FUSE_MS, TILE_SIZE } = await import("../output/esm/core/config.js");

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null },
};

function setPlayerTile(player, tile) {
  player.position = {
    x: tile.x * TILE_SIZE + TILE_SIZE * 0.5,
    y: tile.y * TILE_SIZE + TILE_SIZE * 0.5,
  };
  player.tile = { ...tile };
}

const game = new GameApp(root, assets);
game.startMatch();

const p1 = game.players[1];
setPlayerTile(p1, { x: 5, y: 4 });
p1.spawnProtectionMs = 0;

game.placeBomb(p1);
const plantedBomb = game.bombs[0];
const blastCenter = { ...plantedBomb.tile };

setPlayerTile(p1, { x: 5, y: 6 });
game.bombs[0].fuseMs = 0;
game.updateBombs(BOMB_FUSE_MS + 1);

const survivedExplosionAwayFromBlast = p1.alive === true;
const visualFlameStillPresent = game.flames.some((flame) => flame.tile.x === blastCenter.x && flame.tile.y === blastCenter.y);

setPlayerTile(p1, blastCenter);
game.updatePlayers(17);

const survivedWalkingOntoSpentBlast = p1.alive === true;

const report = {
  blastCenter,
  survivedExplosionAwayFromBlast,
  visualFlameStillPresent,
  survivedWalkingOntoSpentBlast,
  pass: survivedExplosionAwayFromBlast
    && visualFlameStillPresent
    && survivedWalkingOntoSpentBlast,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
