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
  dataset: {},
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
const { MAX_BOMBS, MAX_SPEED_LEVEL, TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");
const { getPowerUpPriorityScore } = await import("../output/esm/Gameplay/powerups.js");

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
game.flames = [];
game.bombs = [];
game.arena.breakable = new Set();

const bot = game.players[2];
const enemy = game.players[1];

setPlayerTile(bot, { x: 4, y: 4 });
setPlayerTile(enemy, { x: 8, y: 7 });
bot.maxBombs = 1;
bot.flameRange = 1;
bot.speedLevel = 0;

for (const powerUp of game.arena.powerUps) {
  powerUp.collected = true;
  powerUp.revealed = false;
}
game.arena.powerUps.push(
  { type: "speed-up", tile: { x: 4, y: 3 }, revealed: true, collected: false },
  { type: "bomb-up", tile: { x: 4, y: 5 }, revealed: true, collected: false },
);
const preferSpeedDecision = game.getBotDecision(bot);
const prefersBaseMobility = preferSpeedDecision.placeBomb === false && preferSpeedDecision.direction === "up";

for (const powerUp of game.arena.powerUps) {
  powerUp.collected = true;
  powerUp.revealed = false;
}
game.arena.powerUps.push(
  { type: "shield-up", tile: { x: 4, y: 3 }, revealed: true, collected: false },
  { type: "bomb-up", tile: { x: 4, y: 5 }, revealed: true, collected: false },
);
bot.shieldCharges = 0;
setPlayerTile(bot, { x: 4, y: 4 });
const preferFirstShieldDecision = game.getBotDecision(bot);
const prefersFirstShield = preferFirstShieldDecision.placeBomb === false && preferFirstShieldDecision.direction === "up";

for (const powerUp of game.arena.powerUps) {
  powerUp.collected = true;
  powerUp.revealed = false;
}
game.arena.powerUps.push({ type: "speed-up", tile: { x: 4, y: 3 }, revealed: true, collected: false });
bot.speedLevel = MAX_SPEED_LEVEL;
setPlayerTile(bot, { x: 4, y: 4 });
setPlayerTile(enemy, { x: 4, y: 7 });
const skipUselessDecision = game.getBotDecision(bot);
const skipsUselessSpeedUp = skipUselessDecision.direction !== "up";

for (const powerUp of game.arena.powerUps) {
  powerUp.collected = true;
  powerUp.revealed = false;
}
game.arena.powerUps.push(
  { type: "bomb-up", tile: { x: 4, y: 3 }, revealed: true, collected: false },
  { type: "shield-up", tile: { x: 4, y: 5 }, revealed: true, collected: false },
);
bot.maxBombs = MAX_BOMBS;
bot.shieldCharges = 0;
setPlayerTile(bot, { x: 4, y: 4 });
const saturatedAttributeDecision = game.getBotDecision(bot);
const skipsSaturatedBombForSurvival = saturatedAttributeDecision.placeBomb === false
  && saturatedAttributeDecision.direction === "down";

const speedScores = Array.from({ length: MAX_SPEED_LEVEL + 1 }, (_, speedLevel) => {
  bot.speedLevel = speedLevel;
  return getPowerUpPriorityScore(bot, "speed-up");
});
const hasDiminishingSpeedReturns = speedScores[0] === 460
  && speedScores[MAX_SPEED_LEVEL] === 0
  && speedScores.slice(1, -1).every((score, index, scores) => index === 0 || score < scores[index - 1])
  && speedScores.slice(2, -1).every((score, index) => {
    const previousBonus = speedScores[index + 1] - 120;
    return score - 120 === previousBonus / 2;
  });

const report = {
  preferSpeedDecision,
  preferFirstShieldDecision,
  skipUselessDecision,
  saturatedAttributeDecision,
  prefersBaseMobility,
  prefersFirstShield,
  skipsUselessSpeedUp,
  skipsSaturatedBombForSurvival,
  speedScores,
  hasDiminishingSpeedReturns,
};

console.log(JSON.stringify(report, null, 2));

if (!prefersBaseMobility || !prefersFirstShield || !skipsUselessSpeedUp
  || !skipsSaturatedBombForSurvival || !hasDiminishingSpeedReturns) {
  process.exit(1);
}
