const noop = () => {};

const emptySprites = {
  up: null,
  down: null,
  left: null,
  right: null,
  idle: { up: [], down: [], left: [], right: [] },
  walk: { up: [], down: [], left: [], right: [] },
  run: { up: [], down: [], left: [], right: [] },
  cast: { up: [], down: [], left: [], right: [] },
  attack: { up: [], down: [], left: [], right: [] },
  death: { up: [], down: [], left: [], right: [] },
};

const assets = {
  players: { 1: emptySprites, 2: emptySprites, 3: emptySprites, 4: emptySprites },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: {},
};

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { TARGET_WINS } = await import("../output/esm/PersonalConfig/config.js");

const game = new GameApp({ appendChild: noop }, assets);
game.startOfflineBotMatch(1);
game.score[1] = TARGET_WINS - 1;
game.players[2].alive = false;
game.evaluateRoundState();

let sawMatchResult = false;
for (let step = 0; step < 180; step += 1) {
  game.advanceServerSimulation(1000 / 60);
  if (game.exportOnlineSnapshot().mode === "match-result") {
    sawMatchResult = true;
    break;
  }
}

const fallbackWindowMs = 1_200;
for (let elapsedMs = 0; elapsedMs < fallbackWindowMs; elapsedMs += 1000 / 60) {
  game.advanceServerSimulation(1000 / 60);
}

const finalSnapshot = game.exportOnlineSnapshot();
const pass = sawMatchResult
  && finalSnapshot.mode === "match"
  && finalSnapshot.matchWinner === null
  && finalSnapshot.roundNumber === 1
  && finalSnapshot.score[1] === 0;

console.log(JSON.stringify({
  sawMatchResult,
  fallbackWindowMs,
  final: {
    mode: finalSnapshot.mode,
    matchWinner: finalSnapshot.matchWinner,
    roundNumber: finalSnapshot.roundNumber,
    score: finalSnapshot.score,
  },
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
