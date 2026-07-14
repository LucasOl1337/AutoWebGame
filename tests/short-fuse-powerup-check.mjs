Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: class HTMLElement {}, configurable: true });

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
const { BOMB_FUSE_MS, TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null, "short-fuse-up": null },
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
game.flames = [];
game.bombs = [];

const player = game.players[1];
setPlayerTile(player, { x: 2, y: 1 });
player.spawnProtectionMs = 0;

game.placeBomb(player);
const defaultFuseMs = game.bombs[0]?.fuseMs ?? null;
game.bombs = [];
player.activeBombs = 0;

game.arena.powerUps = [
  { type: "short-fuse-up", tile: { x: 2, y: 1 }, revealed: true, collected: false },
  { type: "short-fuse-up", tile: { x: 2, y: 1 }, revealed: true, collected: false },
];
game.collectPowerUps();

const collectedCount = game.arena.powerUps.filter((powerUp) => powerUp.collected).length;
const levelAfterPickup = player.shortFuseLevel;

game.placeBomb(player);
const quickFuseMs = game.bombs[0]?.fuseMs ?? null;
const shortenedByMs = defaultFuseMs !== null && quickFuseMs !== null
  ? defaultFuseMs - quickFuseMs
  : null;
game.updateBombs(Math.max(0, quickFuseMs - 1));
const stillTickingBeforeFuse = game.bombs.length === 1;
game.updateBombs(2);
const detonatedAtQuickFuse = game.bombs.length === 0;

const state = JSON.parse(game.renderGameToText());
const p1State = state.players.find((entry) => entry.id === 1);

const report = {
  defaultFuseMs,
  quickFuseMs,
  shortenedByMs,
  collectedCount,
  levelAfterPickup,
  renderedShortFuseLevel: p1State?.shortFuseLevel ?? null,
  stillTickingBeforeFuse,
  detonatedAtQuickFuse,
  pass: (
    defaultFuseMs === BOMB_FUSE_MS
    && quickFuseMs !== null
    && quickFuseMs < BOMB_FUSE_MS
    && shortenedByMs === 800
    && collectedCount === 2
    && levelAfterPickup === 2
    && p1State?.shortFuseLevel === 2
    && stillTickingBeforeFuse
    && detonatedAtQuickFuse
  ),
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
