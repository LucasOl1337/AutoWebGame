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
  translate: noop,
  scale: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
};

const fakeCanvas = {
  width: 0,
  height: 0,
  style: {},
  dataset: {},
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
const { tileKey } = await import("../output/esm/Arenas/arena.js");
const { SKILL_POWER_UP_TYPES } = await import("../output/esm/Gameplay/powerups.js");

const root = { appendChild: noop };
const emptySprites = { up: null, down: null, left: null, right: null };
const assets = {
  players: { 1: emptySprites, 2: emptySprites },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: {
    "bomb-up": null,
    "flame-up": null,
    "speed-up": null,
    "remote-up": null,
    "shield-up": null,
    "bomb-pass-up": null,
    "kick-up": null,
    "short-fuse-up": null,
  },
};

function setPlayerTile(player, tile) {
  player.position = {
    x: tile.x * TILE_SIZE + TILE_SIZE * 0.5,
    y: tile.y * TILE_SIZE + TILE_SIZE * 0.5,
  };
  player.tile = { ...tile };
}

function runCrateExplosion(crateTiles, animationClockMs = 0, powerUps = []) {
  const game = new GameApp(root, assets);
  game.startMatch();
  game.animationClockMs = animationClockMs;
  game.arena.solid.clear();
  game.arena.breakable.clear();
  game.arena.powerUps = powerUps.map((powerUp) => ({
    ...powerUp,
    tile: { ...powerUp.tile },
  }));

  const p1 = game.players[1];
  setPlayerTile(p1, { x: 5, y: 5 });
  p1.spawnProtectionMs = 0;
  p1.flameRange = 2;

  for (const tile of crateTiles) {
    game.arena.breakable.add(tileKey(tile.x, tile.y));
  }

  game.placeBomb(p1, false);
  setPlayerTile(p1, { x: 1, y: 1 });
  game.bombs[0].fuseMs = 0;
  game.updateBombs(BOMB_FUSE_MS + 1);

  return game;
}

const comboCrates = [
  { x: 4, y: 5 },
  { x: 6, y: 5 },
];
const occupiedNormalDropTile = comboCrates[0];
const normalDrop = {
  tile: { ...occupiedNormalDropTile },
  type: "bomb-up",
  revealed: false,
  collected: false,
};
const comboRevealStartedAtMs = 1234;
const comboGame = runCrateExplosion(comboCrates, comboRevealStartedAtMs, [normalDrop]);
const revealedNormalDrop = comboGame.arena.powerUps.find((powerUp) => powerUp.type === normalDrop.type) ?? null;
const comboDrop = comboGame.arena.powerUps.find((powerUp) => powerUp !== revealedNormalDrop) ?? null;
const comboCrateKeys = new Set(comboCrates.map((tile) => tileKey(tile.x, tile.y)));
const comboBreaksBothCrates = comboCrates.every((tile) => (
  !comboGame.arena.breakable.has(tileKey(tile.x, tile.y))
));
const comboCreatesSingleBonus = comboGame.arena.powerUps.length === 2 && comboDrop !== null;
const normalDropIsRevealed = revealedNormalDrop?.revealed === true;
const comboDropIsRevealed = comboDrop?.revealed === true && comboDrop?.collected === false;
const comboDropUsesExistingType = comboDrop ? SKILL_POWER_UP_TYPES.includes(comboDrop.type) : false;
const comboDropUsesFreeBrokenCrate = comboDrop
  ? comboCrateKeys.has(tileKey(comboDrop.tile.x, comboDrop.tile.y))
    && tileKey(comboDrop.tile.x, comboDrop.tile.y) !== tileKey(occupiedNormalDropTile.x, occupiedNormalDropTile.y)
  : false;
const comboDropRevealTimestamp = comboDrop
  ? comboGame.powerUpRevealStartedAtMs.get(comboDrop)
  : undefined;
const comboDropStartsRevealAnimation = comboDropRevealTimestamp === comboRevealStartedAtMs;

const singleGame = runCrateExplosion([{ x: 6, y: 5 }]);
const singleCrateKeepsNormalDropRule = singleGame.arena.powerUps.length === 0;

const report = {
  comboPowerUps: comboGame.arena.powerUps,
  singlePowerUps: singleGame.arena.powerUps,
  comboBreaksBothCrates,
  comboCreatesSingleBonus,
  normalDropIsRevealed,
  comboDropIsRevealed,
  comboDropUsesExistingType,
  comboDropUsesFreeBrokenCrate,
  comboDropRevealTimestamp,
  comboDropStartsRevealAnimation,
  singleCrateKeepsNormalDropRule,
  pass: (
    comboBreaksBothCrates
    && comboCreatesSingleBonus
    && normalDropIsRevealed
    && comboDropIsRevealed
    && comboDropUsesExistingType
    && comboDropUsesFreeBrokenCrate
    && comboDropStartsRevealAnimation
    && singleCrateKeepsNormalDropRule
  ),
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
