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
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");

const emptySprites = {
  up: null,
  down: null,
  left: null,
  right: null,
  idle: { up: [], down: [], left: [], right: [] },
  walk: { up: [], down: [], left: [], right: [] },
};

const root = { appendChild: noop };
const assets = {
  players: { 1: emptySprites, 2: emptySprites, 3: emptySprites, 4: emptySprites },
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

function createOpenBotDuel() {
  const game = new GameApp(root, assets);
  game.startMatch();
  game.flames = [];
  game.bombs = [];
  game.arena.solid = new Set();
  game.arena.breakable = new Set();
  game.botBombCooldownMs = 0;
  for (const powerUp of game.arena.powerUps) {
    powerUp.revealed = false;
    powerUp.collected = true;
  }

  const bot = game.players[2];
  const enemy = game.players[1];
  setPlayerTile(bot, { x: 4, y: 4 });
  setPlayerTile(enemy, { x: 6, y: 5 });
  bot.spawnProtectionMs = 0;
  bot.flameGuardMs = 0;
  bot.breakawayBoostMs = 0;
  bot.activeBombs = 0;
  bot.maxBombs = 1;
  bot.flameRange = 2;
  bot.shieldCharges = 0;
  enemy.spawnProtectionMs = 0;
  enemy.alive = true;
  game.arena.powerUps.push({
    type: "shield-up",
    tile: { x: 4, y: 3 },
    revealed: true,
    collected: false,
  });

  return { game, bot, enemy };
}

const baseline = createOpenBotDuel();
const baselineDecision = baseline.game.getBotDecision(baseline.bot);
const prefersPowerUpNormally = baselineDecision.placeBomb === false && baselineDecision.direction === "up";

const revenge = createOpenBotDuel();
revenge.bot.flameGuardMs = 300;
revenge.bot.breakawayBoostMs = 220;
const revengeDecision = revenge.game.getBotDecision(revenge.bot);
const prioritizesCounterAttack = revengeDecision.placeBomb === false && revengeDecision.direction === "down";

const protectedEnemy = createOpenBotDuel();
protectedEnemy.bot.flameGuardMs = 300;
protectedEnemy.enemy.spawnProtectionMs = 900;
const protectedEnemyDecision = protectedEnemy.game.getBotDecision(protectedEnemy.bot);
const respectsEnemyProtection = protectedEnemyDecision.placeBomb === false && protectedEnemyDecision.direction === "up";

const report = {
  baselineDecision,
  revengeDecision,
  protectedEnemyDecision,
  prefersPowerUpNormally,
  prioritizesCounterAttack,
  respectsEnemyProtection,
};

console.log(JSON.stringify(report, null, 2));

if (!prefersPowerUpNormally || !prioritizesCounterAttack || !respectsEnemyProtection) {
  process.exit(1);
}
