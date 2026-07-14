const { MAX_BOMB_PASS_LEVEL, MAX_KICK_LEVEL } = await import("../output/esm/PersonalConfig/config.js");
const { getPowerUpPriorityScore } = await import("../output/esm/Gameplay/powerups.js");

const bot = {
  maxBombs: 1,
  flameRange: 1,
  speedLevel: 0,
  remoteLevel: 0,
  shieldCharges: 0,
  bombPassLevel: 0,
  kickLevel: 0,
  shortFuseLevel: 0,
};

const kickWithoutBombPass = getPowerUpPriorityScore(bot, "kick-up");

bot.bombPassLevel = MAX_BOMB_PASS_LEVEL;
const kickWithBombPass = getPowerUpPriorityScore(bot, "kick-up");

bot.kickLevel = MAX_KICK_LEVEL;
const saturatedKick = getPowerUpPriorityScore(bot, "kick-up");

const report = {
  kickWithoutBombPass,
  kickWithBombPass,
  saturatedKick,
  gainsMinimumMarginWithoutBombPass: kickWithoutBombPass === kickWithBombPass + 1,
  reusesExistingPriorityWithBombPass: kickWithBombPass === 180,
  keepsSaturatedKickDiscarded: saturatedKick === 0,
};

console.log(JSON.stringify(report, null, 2));

if (!report.gainsMinimumMarginWithoutBombPass
  || !report.reusesExistingPriorityWithBombPass
  || !report.keepsSaturatedKickDiscarded) {
  process.exit(1);
}
