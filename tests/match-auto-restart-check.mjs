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
const { TARGET_WINS } = await import("../output/esm/core/config.js");

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
  },
};

const game = new GameApp(root, assets);
game.startOfflineBotMatch(1);
game.score[1] = TARGET_WINS - 1;
game.players[2].alive = false;
game.evaluateRoundState();

let sawMatchResult = false;

let restarted = false;
for (let step = 0; step < 180; step += 1) {
  game.advanceServerSimulation(1000 / 60);
  const snapshot = game.exportOnlineSnapshot();
  if (snapshot.mode === "match-result" && snapshot.matchWinner === 1) {
    sawMatchResult = true;
  }
  if (
    snapshot.mode === "match"
    && snapshot.matchWinner === null
    && snapshot.roundNumber === 1
    && snapshot.score[1] === 0
    && snapshot.score[2] === 0
  ) {
    restarted = true;
    break;
  }
}

const finalSnapshot = game.exportOnlineSnapshot();
const pass = sawMatchResult
  && restarted
  && finalSnapshot.mode === "match"
  && finalSnapshot.matchWinner === null
  && finalSnapshot.roundNumber === 1;

console.log(JSON.stringify({
  targetWins: TARGET_WINS,
  sawMatchResult,
  restarted,
  final: {
    mode: finalSnapshot.mode,
    roundNumber: finalSnapshot.roundNumber,
    score: finalSnapshot.score,
    matchWinner: finalSnapshot.matchWinner,
  },
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
