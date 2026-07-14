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
const { SITE_COPY } = await import("../output/esm/UiLayouts/i18n.js");

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null },
};

const game = new GameApp(root, assets);
game.soundManager.playOneShot = noop;
game.start();

emit("keydown", keyEvent("KeyE"));
emit("keyup", keyEvent("KeyE"));
emit("keydown", keyEvent("KeyP"));
emit("keyup", keyEvent("KeyP"));
window.advanceTime(34);

const firstRound = JSON.parse(window.render_game_to_text());

game.players[2].alive = false;
window.advanceTime(34);
window.advanceTime(2_200);
const secondRound = JSON.parse(window.render_game_to_text());

window.advanceTime(1_400);
const expiredCue = JSON.parse(window.render_game_to_text());

const firstCue = firstRound.match.roundStartCue;
const secondCue = secondRound.match.roundStartCue;
const expired = expiredCue.match.roundStartCue;
const firstOverlay = firstRound.match.centerOverlay;
const secondOverlay = secondRound.match.centerOverlay;

const report = {
  firstRound: {
    mode: firstRound.mode,
    round: firstRound.match.round,
    cue: firstCue,
    overlay: firstOverlay,
  },
  secondRound: {
    mode: secondRound.mode,
    round: secondRound.match.round,
    cue: secondCue,
    overlay: secondOverlay,
  },
  expiredCue: {
    mode: expiredCue.mode,
    round: expiredCue.match.round,
    cue: expired,
  },
  pass:
    firstRound.mode === "match"
    && firstRound.match.round === 1
    && firstCue.active === true
    && firstCue.title === "RODADA 1"
    && firstCue.subtitle === "Objetivo: seja o ultimo bomber vivo. Partida classica: primeiro a 2 vitorias."
    && firstOverlay?.footer === "Placar: P1 0 - P2 0"
    && secondRound.mode === "match"
    && secondRound.match.round === 2
    && secondCue.active === true
    && secondCue.title === "RODADA 2"
    && secondCue.subtitle === "Objetivo: seja o ultimo bomber vivo. Partida classica: primeiro a 2 vitorias."
    && secondOverlay?.footer === "Placar: P1 1 - P2 0"
    && SITE_COPY.en.canvas.roundStartSubtitle === "Objective: be the last bomber alive. Classic match: first to 2 wins."
    && expiredCue.mode === "match"
    && expired.active === false
    && expired.remainingMs === 0,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
