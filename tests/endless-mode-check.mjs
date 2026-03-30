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
game.startServerAuthoritativeMatch(
  [1, 2, 3, 4],
  { 1: 0, 2: 1, 3: 2, 4: 3 },
  { roomMode: "endless", botPlayerIds: [2, 3, 4] },
);

game.players[2].spawnProtectionMs = 0;
game.players[3].spawnProtectionMs = 0;
game.players[4].spawnProtectionMs = 0;
game.tryAbsorbInstantHit(game.players[2], 1);
game.tryAbsorbInstantHit(game.players[3], 1);
game.tryAbsorbInstantHit(game.players[4], 1);
game.evaluateRoundState();

let advancedRound = false;
for (let step = 0; step < 180; step += 1) {
  game.advanceServerSimulation(1000 / 60);
  const snapshot = game.exportOnlineSnapshot();
  if (snapshot.roundNumber >= 2 && snapshot.mode === "match") {
    advancedRound = true;
    break;
  }
}

const snapshot = game.exportOnlineSnapshot();
const pass = snapshot.roomMode === "endless"
  && snapshot.matchWinner === null
  && snapshot.mode === "match"
  && advancedRound
  && snapshot.endlessStats?.kills[1] === 3
  && snapshot.endlessStats?.roundWins[1] === 1
  && snapshot.score[1] === 1
  && snapshot.botPlayerIds.length === 3;

console.log(JSON.stringify({
  roomMode: snapshot.roomMode,
  roundNumber: snapshot.roundNumber,
  score: snapshot.score,
  endlessStats: snapshot.endlessStats,
  botPlayerIds: snapshot.botPlayerIds,
  matchWinner: snapshot.matchWinner,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
