const { getBotDecision } = await import("../output/esm/Engine/bot-ai.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");
const { tileKey } = await import("../output/esm/Arenas/arena.js");

const tilePosition = (x, y) => ({ x: x * TILE_SIZE + TILE_SIZE / 2, y: y * TILE_SIZE + TILE_SIZE / 2 });
const makePlayer = (id, x, y) => ({
  id,
  active: true,
  alive: true,
  tile: { x, y },
  position: tilePosition(x, y),
  direction: "down",
  lastMoveDirection: null,
  spawnProtectionMs: 0,
  flameGuardMs: 0,
  speedLevel: 0,
  flameRange: 1,
  activeBombs: 0,
  maxBombs: 1,
  remoteLevel: 0,
  bombPassLevel: 0,
  kickLevel: 0,
  shortFuseLevel: 0,
  shieldCharges: 0,
});

const bot = makePlayer(2, 3, 3);
const enemy = makePlayer(1, 3, 6);
const context = {
  players: { 1: enemy, 2: bot },
  activePlayerIds: [1, 2],
  bombs: [],
  flames: [],
  arena: {
    config: { grid: { width: 7, height: 7 } },
    solid: new Set(),
    breakable: new Set([tileKey(1, 3), tileKey(5, 3)]),
    powerUps: [{
      type: "speed-up",
      tile: { x: 1, y: 3 },
      revealed: false,
      collected: false,
    }, {
      type: "shield-up",
      tile: { x: 5, y: 3 },
      revealed: false,
      collected: false,
    }],
  },
  suddenDeathActive: false,
  suddenDeathTickMs: 0,
  suddenDeathIndex: 0,
  suddenDeathPath: [],
  suddenDeathClosureEffects: [],
  botBombCooldownMs: 0,
  botCommittedDirection: { 2: null },
  botPendingReverseDirection: { 2: null },
  botPendingReverseFrames: { 2: 0 },
  canOccupyPosition: () => true,
  evaluateMovementOption: () => ({}),
  canMovementOptionAdvance: () => true,
  areOppositeDirections: () => false,
  isPlayerOverlappingTile: () => false,
};

enemy.spawnProtectionMs = 1000;
const usefulHiddenDropDecision = getBotDecision(bot, context);
const usefulHiddenDropPass = usefulHiddenDropDecision.direction === "left"
  && usefulHiddenDropDecision.placeBomb === false;

bot.speedLevel = 4;
const saturatedHiddenDropDecision = getBotDecision(bot, context);
const saturatedHiddenDropPass = saturatedHiddenDropDecision.direction === "right"
  && saturatedHiddenDropDecision.placeBomb === false;
bot.speedLevel = 0;

enemy.spawnProtectionMs = 0;
enemy.tile = { x: 3, y: 5 };
enemy.position = tilePosition(3, 5);
const vulnerableTargetDecision = getBotDecision(bot, context);
const vulnerableTargetPass = vulnerableTargetDecision.direction === "down"
  && vulnerableTargetDecision.placeBomb === false;

const report = {
  usefulHiddenDropDecision,
  saturatedHiddenDropDecision,
  vulnerableTargetDecision,
  usefulHiddenDropPass,
  saturatedHiddenDropPass,
  vulnerableTargetPass,
};
console.log(JSON.stringify(report, null, 2));
if (!usefulHiddenDropPass || !saturatedHiddenDropPass || !vulnerableTargetPass) process.exit(1);
