Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });
globalThis.HTMLElement = class {
  constructor() {
    this.dataset = {};
  }
};

const noop = () => {};
const listeners = new Map();

function on(type, handler) {
  const list = listeners.get(type) ?? [];
  list.push(handler);
  listeners.set(type, list);
}

function emit(type, event) {
  const list = listeners.get(type) ?? [];
  for (const handler of list) {
    handler(event);
  }
}

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
  translate: noop,
  scale: noop,
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
  closest: () => null,
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
  addEventListener: on,
  requestAnimationFrame: noop,
};

function keyEvent(code) {
  return { code, preventDefault: noop };
}

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { ROUND_END_DELAY_MS, TARGET_WINS } = await import("../output/esm/PersonalConfig/config.js");

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

function createFinishedLocalMatch() {
  const root = { appendChild: noop };
  const game = new GameApp(root, assets);
  const sounds = [];
  game.soundManager.playOneShot = (key) => {
    sounds.push(key);
  };
  game.start();
  game.startOfflineBotMatch(1);
  game.score[1] = TARGET_WINS - 1;
  game.players[2].alive = false;
  game.evaluateRoundState();
  window.advanceTime(ROUND_END_DELAY_MS + 100);
  return { game, sounds, snapshot: JSON.parse(window.render_game_to_text()) };
}

const rematchSetup = createFinishedLocalMatch();
window.advanceTime(4_000);
const heldResult = JSON.parse(window.render_game_to_text());
emit("keydown", keyEvent("Enter"));
emit("keyup", keyEvent("Enter"));
window.advanceTime(34);
const afterEnter = JSON.parse(window.render_game_to_text());

const replaySetup = createFinishedLocalMatch();
emit("keydown", keyEvent("Space"));
emit("keyup", keyEvent("Space"));
window.advanceTime(34);
const afterSpace = JSON.parse(window.render_game_to_text());

const menuSetup = createFinishedLocalMatch();
emit("keydown", keyEvent("Escape"));
emit("keyup", keyEvent("Escape"));
window.advanceTime(34);
const afterEscape = JSON.parse(window.render_game_to_text());
const heldOverlay = heldResult.match.centerOverlay;

const pass =
  rematchSetup.snapshot.mode === "match-result" &&
  heldResult.mode === "match-result" &&
  heldResult.match.score[1] === TARGET_WINS &&
  heldOverlay?.subtitle === "Enter/Espaco: jogar novamente | Esc: voltar ao menu" &&
  heldOverlay?.footer === `Placar: P1 ${TARGET_WINS} - P2 0` &&
  afterEnter.mode === "match" &&
  afterEnter.match.round === 1 &&
  afterEnter.match.score[1] === 0 &&
  afterEnter.match.score[2] === 0 &&
  replaySetup.snapshot.mode === "match-result" &&
  afterSpace.mode === "match" &&
  afterSpace.match.round === 1 &&
  afterSpace.match.score[1] === 0 &&
  afterSpace.match.score[2] === 0 &&
  menuSetup.snapshot.mode === "match-result" &&
  afterEscape.mode === "menu";

console.log(JSON.stringify({
  beforeEnter: {
    mode: rematchSetup.snapshot.mode,
    matchWinner: rematchSetup.snapshot.matchWinner,
    sounds: rematchSetup.sounds,
  },
  heldResult: {
    mode: heldResult.mode,
    score: heldResult.match.score,
    centerOverlay: heldOverlay,
  },
  afterEnter: {
    mode: afterEnter.mode,
    round: afterEnter.match.round,
    score: afterEnter.match.score,
    sounds: rematchSetup.sounds,
  },
  beforeSpace: {
    mode: replaySetup.snapshot.mode,
    matchWinner: replaySetup.snapshot.matchWinner,
  },
  afterSpace: {
    mode: afterSpace.mode,
    round: afterSpace.match.round,
    score: afterSpace.match.score,
  },
  beforeEscape: {
    mode: menuSetup.snapshot.mode,
    matchWinner: menuSetup.snapshot.matchWinner,
    sounds: menuSetup.sounds,
  },
  afterEscape: {
    mode: afterEscape.mode,
  },
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
