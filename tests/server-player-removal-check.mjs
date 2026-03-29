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
game.startServerAuthoritativeMatch([1, 2], { 1: 0, 2: 1, 3: 0, 4: 0 });
game.removeServerPlayer(2);

const afterLeave = game.exportOnlineSnapshot();

function stepUntil(predicate, maxSteps = 240) {
  for (let step = 0; step < maxSteps; step += 1) {
    if (predicate()) {
      return true;
    }
    game.advanceServerSimulation(1000 / 60);
  }
  return predicate();
}

const reachedRoundTwo = stepUntil(() => {
  const snapshot = game.exportOnlineSnapshot();
  return snapshot.roundNumber >= 2 && snapshot.roundOutcome === null;
});

const championResolved = stepUntil(() => game.exportOnlineSnapshot().matchWinner === 1);
const finalSnapshot = game.exportOnlineSnapshot();

const pass = TARGET_WINS === 2
  && afterLeave.roundOutcome?.winner === 1
  && afterLeave.score[1] === 1
  && afterLeave.players[2].alive === false
  && afterLeave.players[2].active === false
  && afterLeave.activePlayerIds.length === 1
  && afterLeave.activePlayerIds[0] === 1
  && reachedRoundTwo
  && championResolved
  && finalSnapshot.matchWinner === 1
  && finalSnapshot.score[1] === 2;

console.log(JSON.stringify({
  targetWins: TARGET_WINS,
  afterLeave: {
    roundOutcome: afterLeave.roundOutcome,
    score: afterLeave.score,
    activePlayerIds: afterLeave.activePlayerIds,
    player2: {
      active: afterLeave.players[2].active,
      alive: afterLeave.players[2].alive,
    },
  },
  final: {
    matchWinner: finalSnapshot.matchWinner,
    score: finalSnapshot.score,
    roundNumber: finalSnapshot.roundNumber,
  },
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
