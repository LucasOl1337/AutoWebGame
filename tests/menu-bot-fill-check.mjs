Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });
globalThis.HTMLElement = class {};

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
  closest: () => null,
  getContext: () => fakeCtx,
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
const {
  BOT_MATCH_FILL_OPTIONS,
  parseStoredBotMatchFill,
} = await import("../output/esm/NetCode/session-client.js");

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
  players: { 1: emptySprites, 2: emptySprites },
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

function createGame() {
  return new GameApp(root, assets);
}

const fillStates = BOT_MATCH_FILL_OPTIONS.map((fill) => {
  const game = createGame();
  game.startOfflineBotMatch(fill);
  return {
    fill,
    state: JSON.parse(game["renderGameToText"]()),
  };
});

const fillChecks = fillStates.map(({ fill, state }) => {
  const expectedActiveIds = Array.from({ length: fill + 1 }, (_, index) => index + 1);
  return {
    fill,
    activeCount: state.activePlayerIds.length === fill + 1,
    activeIdsMatch: expectedActiveIds.every((playerId) => state.activePlayerIds.includes(playerId)),
    fillMatches: state.match.localBotFill === fill,
    p1IsHuman: state.players.some((player) => player.id === 1 && !player.botControlled),
    botsPresent: expectedActiveIds
      .filter((playerId) => playerId !== 1)
      .every((playerId) => state.players.some((player) => player.id === playerId && player.botControlled)),
  };
});

const helperChecks = {
  exposesThreeOptions: BOT_MATCH_FILL_OPTIONS.join(",") === "1,2,3",
  parsesValidFill: parseStoredBotMatchFill("2") === 2,
  defaultsInvalidFill: parseStoredBotMatchFill("9") === 3,
  defaultsMissingFill: parseStoredBotMatchFill(null) === 3,
};

const pass = fillChecks.every((checks) => Object.values(checks).every(Boolean))
  && Object.values(helperChecks).every(Boolean);

console.log(JSON.stringify({
  fillChecks,
  helperChecks,
  fillStates: fillStates.map(({ fill, state }) => ({
    fill,
    activePlayerIds: state.activePlayerIds,
    localBotFill: state.match.localBotFill,
    players: state.players.map((player) => ({ id: player.id, botControlled: player.botControlled })),
  })),
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
