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
const { MAX_BOMBS, MAX_BOMB_PASS_LEVEL, MAX_KICK_LEVEL, MAX_RANGE, MAX_SHIELD_CHARGES, MAX_SPEED_LEVEL, TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");
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
game.arena.powerUps.push(
  { type: "shield-up", tile: { x: 4, y: 3 }, revealed: true, collected: false },
  { type: "remote-up", tile: { x: 4, y: 5 }, revealed: true, collected: false },
);
bot.shieldCharges = 1;
bot.remoteLevel = 0;
setPlayerTile(bot, { x: 4, y: 4 });
const preferRemoteOverSecondShieldDecision = game.getBotDecision(bot);
const prefersRemoteOverSecondShield = preferRemoteOverSecondShieldDecision.placeBomb === false
  && preferRemoteOverSecondShieldDecision.direction === "down";

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

const bombScores = Array.from({ length: MAX_BOMBS }, (_, index) => {
  bot.maxBombs = index + 1;
  return getPowerUpPriorityScore(bot, "bomb-up");
});
const hasDiminishingBombReturns = bombScores[0] === 460
  && bombScores[MAX_BOMBS - 1] === 0
  && bombScores.slice(1, -1).every((score, index, scores) => index === 0 || score < scores[index - 1])
  && bombScores.slice(2, -1).every((score, index) => {
    const previousBonus = bombScores[index + 1] - 300;
    return score - 300 === previousBonus / 2;
  });

const speedScores = Array.from({ length: MAX_SPEED_LEVEL + 1 }, (_, speedLevel) => {
  bot.speedLevel = speedLevel;
  return getPowerUpPriorityScore(bot, "speed-up");
});
const hasDiminishingSpeedReturns = speedScores[0] === 461
  && speedScores[0] === bombScores[0] + 1
  && speedScores[MAX_SPEED_LEVEL] === 0
  && speedScores.slice(1, -1).every((score, index, scores) => index === 0 || score < scores[index - 1])
  && speedScores.slice(2, -1).every((score, index) => {
    const previousBonus = speedScores[index + 1] - 120;
    return score - 120 === previousBonus / 2;
  });

const flameScores = Array.from({ length: MAX_RANGE }, (_, index) => {
  bot.flameRange = index + 1;
  return getPowerUpPriorityScore(bot, "flame-up");
});
const hasDiminishingFlameReturns = flameScores[0] === 460
  && flameScores[1] === 340
  && flameScores[2] === 300
  && flameScores[MAX_RANGE - 1] === 0
  && flameScores.slice(1, -1).every((score, index, scores) => index === 0 || score < scores[index - 1])
  && flameScores.slice(3, -1).every((score, index) => {
    const previousBonus = flameScores[index + 2] - 260;
    return score - 260 === previousBonus / 2;
  });

const shortFuseScores = [0, 1, 2].map((shortFuseLevel) => {
  bot.shortFuseLevel = shortFuseLevel;
  return getPowerUpPriorityScore(bot, "short-fuse-up");
});
const hasDiminishingShortFuseReturns = JSON.stringify(shortFuseScores) === JSON.stringify([260, 150, 0]);

const shieldScores = Array.from({ length: MAX_SHIELD_CHARGES + 1 }, (_, shieldCharges) => {
  bot.shieldCharges = shieldCharges;
  return getPowerUpPriorityScore(bot, "shield-up");
});
const hasDiminishingShieldReturns = shieldScores[0] === 500
  && shieldScores[1] === 250
  && shieldScores[2] === 0;

const bombPassScores = Array.from({ length: MAX_BOMB_PASS_LEVEL + 1 }, (_, bombPassLevel) => {
  bot.bombPassLevel = bombPassLevel;
  return getPowerUpPriorityScore(bot, "bomb-pass-up");
});
bot.remoteLevel = 0;
const remoteScore = getPowerUpPriorityScore(bot, "remote-up");
bot.remoteLevel = 1;
const saturatedRemoteScore = getPowerUpPriorityScore(bot, "remote-up");
const hasExpectedRemotePriority = remoteScore === 251 && saturatedRemoteScore === 0;
const hasExpectedBombPassPriority = JSON.stringify(bombPassScores) === JSON.stringify([240, 0]);
const prefersRemoteOverSecondShieldByMinimumMargin = remoteScore === shieldScores[1] + 1;
const prefersRemoteOverBombPass = remoteScore > bombPassScores[0];
const keepsRemoteBelowShortFuse = remoteScore < shortFuseScores[0];
const preservesHigherPriorities = bombScores[0] > remoteScore
  && speedScores[0] > remoteScore
  && flameScores[0] > remoteScore
  && shieldScores[0] > remoteScore
  && shortFuseScores[0] > remoteScore;

const kickScores = Array.from({ length: MAX_KICK_LEVEL + 1 }, (_, kickLevel) => {
  bot.kickLevel = kickLevel;
  return getPowerUpPriorityScore(bot, "kick-up");
});
const hasExpectedKickPriority = JSON.stringify(kickScores) === JSON.stringify([180, 0]);
const preservesKickAsSituational = kickScores[0] < bombPassScores[0]
  && kickScores[0] < remoteScore
  && kickScores[0] < shortFuseScores[0];

const report = {
  preferSpeedDecision,
  preferFirstShieldDecision,
  preferRemoteOverSecondShieldDecision,
  skipUselessDecision,
  saturatedAttributeDecision,
  prefersBaseMobility,
  prefersFirstShield,
  prefersRemoteOverSecondShield,
  skipsUselessSpeedUp,
  skipsSaturatedBombForSurvival,
  bombScores,
  hasDiminishingBombReturns,
  speedScores,
  hasDiminishingSpeedReturns,
  flameScores,
  hasDiminishingFlameReturns,
  shortFuseScores,
  hasDiminishingShortFuseReturns,
  shieldScores,
  hasDiminishingShieldReturns,
  bombPassScores,
  remoteScore,
  saturatedRemoteScore,
  hasExpectedRemotePriority,
  hasExpectedBombPassPriority,
  prefersRemoteOverSecondShieldByMinimumMargin,
  prefersRemoteOverBombPass,
  keepsRemoteBelowShortFuse,
  preservesHigherPriorities,
  kickScores,
  hasExpectedKickPriority,
  preservesKickAsSituational,
};

console.log(JSON.stringify(report, null, 2));

if (!prefersBaseMobility || !prefersFirstShield || !prefersRemoteOverSecondShield
  || !skipsUselessSpeedUp
  || !skipsSaturatedBombForSurvival || !hasDiminishingBombReturns
  || !hasDiminishingSpeedReturns || !hasDiminishingFlameReturns
  || !hasDiminishingShortFuseReturns || !hasDiminishingShieldReturns
  || !hasExpectedRemotePriority || !hasExpectedBombPassPriority
  || !prefersRemoteOverSecondShieldByMinimumMargin || !prefersRemoteOverBombPass || !keepsRemoteBelowShortFuse
  || !preservesHigherPriorities || !hasExpectedKickPriority
  || !preservesKickAsSituational) {
  process.exit(1);
}
