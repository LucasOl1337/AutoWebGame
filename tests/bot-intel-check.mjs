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

const { GameApp } = await import('../output/esm/app/game-app.js');
const { tileKey } = await import('../output/esm/game/arena.js');
const { BASE_MOVE_MS, MIN_MOVE_MS, SPEED_STEP_MS, TILE_SIZE } = await import('../output/esm/core/config.js');

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { 'bomb-up': null, 'flame-up': null, 'speed-up': null },
};

const game = new GameApp(root, assets);
game.startMatch();

const bot = game.players[2];
const enemy = game.players[1];
bot.spawnProtectionMs = 0;
enemy.spawnProtectionMs = 0;
const directionDelta = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function setPlayerTile(player, tile) {
  player.position = {
    x: tile.x * TILE_SIZE + TILE_SIZE * 0.5,
    y: tile.y * TILE_SIZE + TILE_SIZE * 0.5,
  };
  player.tile = { ...tile };
}

setPlayerTile(bot, { x: 5, y: 5 });
setPlayerTile(enemy, { x: 8, y: 5 });
game.flames = [];
game.bombs = [];
game.arena.breakable = new Set();
const decisionPressure = game.getBotDecision(bot);
const pressurePass = decisionPressure && (decisionPressure.direction !== null || decisionPressure.placeBomb === true);

game.flames = [{ tile: { x: 5, y: 5 }, remainingMs: 300 }];
const decisionDanger = game.getBotDecision(bot);
const dangerPass = decisionDanger.placeBomb === false && decisionDanger.direction !== null;

const customTile = { x: 8, y: 6 };
setPlayerTile(bot, customTile);
game.flames = [];
game.bombs = [];
game.botBombCooldownMs = 0;
for (const id of [1, 2]) {
  game.players[id].flameRange = 1;
}
const breakableTile = tileKey(customTile.x + 1, customTile.y);
const breakable = new Set([breakableTile]);
for (const item of game.arena.powerUps) {
  item.revealed = false;
  item.collected = false;
}
game.arena.breakable = breakable;
const decisionBomb = game.getBotDecision(bot);
const bombPass = decisionBomb.placeBomb === true;

setPlayerTile(bot, { x: 6, y: 6 });
setPlayerTile(enemy, { x: 8, y: 6 });
game.flames = [];
game.bombs = [];
game.botBombCooldownMs = 0;
game.arena.breakable = new Set();
bot.flameRange = 2;
const decisionLineBomb = game.getBotDecision(bot);
const lineBombPass = decisionLineBomb.placeBomb === true;

setPlayerTile(bot, { x: 5, y: 5 });
setPlayerTile(enemy, { x: 8, y: 5 });
game.flames = [];
game.bombs = [];
game.botBombCooldownMs = 0;
game.arena.breakable = new Set([
  tileKey(3, 5),
  tileKey(4, 4),
  tileKey(4, 6),
]);
bot.flameRange = 2;
const decisionAttackPosition = game.getBotDecision(bot);
const attackPositionPass = decisionAttackPosition.placeBomb === false && decisionAttackPosition.direction !== null;

setPlayerTile(bot, { x: 8, y: 5 });
setPlayerTile(enemy, { x: 1, y: 1 });
game.flames = [];
game.bombs = [
  { id: 9001, ownerId: 1, tile: { x: 4, y: 5 }, fuseMs: 450, ownerCanPass: false, flameRange: 2 },
  { id: 9002, ownerId: 1, tile: { x: 6, y: 5 }, fuseMs: 2200, ownerCanPass: false, flameRange: 2 },
];
game.botBombCooldownMs = 0;
game.arena.breakable = new Set();
bot.flameRange = 2;
const decisionChainDanger = game.getBotDecision(bot);
const chainDangerPass = decisionChainDanger.placeBomb === false && decisionChainDanger.direction !== null;

setPlayerTile(bot, { x: 8, y: 7 });
setPlayerTile(enemy, { x: 1, y: 1 });
game.flames = [];
game.bombs = [];
game.arena.breakable = new Set();
game.suddenDeathActive = true;
game.suddenDeathTickMs = 180;
game.suddenDeathIndex = 0;
game.suddenDeathPath = [
  { x: 8, y: 7 },
  { x: 8, y: 6 },
  { x: 7, y: 6 },
  { x: 7, y: 5 },
];
const suddenDangerMap = game.getDangerMap();
const decisionSuddenDeath = game.getBotDecision(bot);
const currentDangerMs = suddenDangerMap.get(tileKey(8, 7));
let suddenDeathPass = false;
if (decisionSuddenDeath.direction) {
  const delta = directionDelta[decisionSuddenDeath.direction];
  const nextTile = { x: 8 + delta.x, y: 7 + delta.y };
  const nextDangerMs = suddenDangerMap.get(tileKey(nextTile.x, nextTile.y));
  const moveDuration = Math.max(MIN_MOVE_MS, BASE_MOVE_MS - bot.speedLevel * SPEED_STEP_MS);
  suddenDeathPass = currentDangerMs === 180
    && (nextDangerMs === undefined || nextDangerMs > moveDuration + 140)
    && decisionSuddenDeath.placeBomb === false;
}
game.suddenDeathActive = false;

setPlayerTile(bot, { x: 4, y: 3 });
setPlayerTile(enemy, { x: 7, y: 6 });
game.flames = [];
game.bombs = [
  { id: 9100, ownerId: 1, tile: { x: 2, y: 3 }, fuseMs: 1932, ownerCanPass: false, flameRange: 2 },
  { id: 9101, ownerId: 1, tile: { x: 3, y: 4 }, fuseMs: 570, ownerCanPass: false, flameRange: 2 },
  { id: 9102, ownerId: 1, tile: { x: 9, y: 6 }, fuseMs: 967, ownerCanPass: false, flameRange: 2 },
];
game.arena.breakable = new Set();
game.botBombCooldownMs = 0;
bot.flameRange = 2;
const strategicAvoidDecision = game.getBotDecision(bot);
const strategicAvoidPass = strategicAvoidDecision.placeBomb === false
  && strategicAvoidDecision.direction !== null
  && strategicAvoidDecision.direction !== "down";

const freshRoundGame = new GameApp(root, assets);
freshRoundGame.startMatch();
const trapTile = { x: 8, y: 6 };
let enteredTrapFrame = -1;
for (let frame = 0; frame < 260; frame += 1) {
  freshRoundGame.updateMatch(1000 / 60);
  const botTile = freshRoundGame.players[2].tile;
  if (botTile.x === trapTile.x && botTile.y === trapTile.y) {
    enteredTrapFrame = frame;
    break;
  }
}
const freshRoundSafetyPass = enteredTrapFrame === -1 && freshRoundGame.players[2].alive;

const report = {
  botEnabled: game.botEnabled,
  botName: game.players[2].name,
  pressureDecision: decisionPressure,
  dangerDecision: decisionDanger,
  bombDecision: decisionBomb,
  lineBombDecision: decisionLineBomb,
  attackPositionDecision: decisionAttackPosition,
  chainDangerDecision: decisionChainDanger,
  suddenDeathDecision: decisionSuddenDeath,
  strategicAvoidDecision,
  trapTile,
  enteredTrapFrame,
  pressurePass,
  dangerPass,
  bombPass,
  lineBombPass,
  attackPositionPass,
  chainDangerPass,
  suddenDeathPass,
  strategicAvoidPass,
  freshRoundSafetyPass,
};

console.log(JSON.stringify(report, null, 2));
if (
  !pressurePass
  || !dangerPass
  || !bombPass
  || !lineBombPass
  || !attackPositionPass
  || !chainDangerPass
  || !suddenDeathPass
  || !strategicAvoidPass
  || !freshRoundSafetyPass
) {
  process.exit(1);
}
