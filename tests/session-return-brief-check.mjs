import { SITE_COPY } from "../output/esm/UiLayouts/i18n.js";
import {
  SESSION_RETURN_BRIEF_MAX_AGE_MS,
  formatSessionReturnBrief,
  parseStoredSessionReturnBrief,
} from "../output/esm/NetCode/session-client.js";

const nowMs = Date.UTC(2026, 0, 2, 12, 0, 0);

const entryBrief = {
  version: 1,
  type: "entry",
  mode: "bot-match",
  characterName: "Ranni",
  savedAtMs: nowMs,
};

const parsedEntry = parseStoredSessionReturnBrief(JSON.stringify(entryBrief), nowMs);
const entryView = parsedEntry ? formatSessionReturnBrief(SITE_COPY.pt, parsedEntry, nowMs) : null;

const resultBrief = {
  version: 1,
  type: "match-result",
  roomCode: "ABCD",
  winner: 2,
  winnerLabel: "P2",
  selfSeat: 1,
  localWon: false,
  roundNumber: 3,
  characterName: "Nico",
  savedAtMs: nowMs,
};

const parsedResult = parseStoredSessionReturnBrief(JSON.stringify(resultBrief), nowMs);
const resultView = parsedResult ? formatSessionReturnBrief(SITE_COPY.en, parsedResult, nowMs) : null;

const expiredBrief = {
  ...entryBrief,
  savedAtMs: nowMs - SESSION_RETURN_BRIEF_MAX_AGE_MS - 1,
};

const checks = {
  parsesEntry: parsedEntry?.type === "entry" && parsedEntry.mode === "bot-match",
  formatsPortugueseEntry: entryView?.title.includes("partida contra bots") === true
    && entryView.body.includes("Ranni"),
  parsesResult: parsedResult?.type === "match-result" && parsedResult.roundNumber === 3,
  formatsEnglishResult: resultView?.title.includes("P2") === true
    && resultView.body.includes("Round 3")
    && resultView.body.includes("room ABCD"),
  rejectsExpired: parseStoredSessionReturnBrief(JSON.stringify(expiredBrief), nowMs) === null,
  rejectsInvalidJson: parseStoredSessionReturnBrief("{", nowMs) === null,
};

Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });
globalThis.HTMLElement = class {
  constructor() {
    this.dataset = {};
  }
};

const noop = () => {};
const listeners = new Map();
const storage = new Map();
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
  dataset: {},
  setAttribute: noop,
  getContext: () => fakeCtx,
  closest: () => null,
  requestFullscreen: async () => {},
};

globalThis.document = {
  fullscreenElement: null,
  visibilityState: "visible",
  createElement: () => fakeCanvas,
  addEventListener: (type, handler) => {
    const list = listeners.get(type) ?? [];
    list.push(handler);
    listeners.set(type, list);
  },
  exitFullscreen: async () => {},
};

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  document: globalThis.document,
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, String(value));
    },
    removeItem: (key) => {
      storage.delete(key);
    },
  },
  addEventListener: (type, handler) => {
    const list = listeners.get(type) ?? [];
    list.push(handler);
    listeners.set(type, list);
  },
  requestAnimationFrame: noop,
};

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { TARGET_WINS } = await import("../output/esm/PersonalConfig/config.js");

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

const localGame = new GameApp(root, assets);
localGame.startOfflineBotMatch(1);
localGame.score[1] = TARGET_WINS - 1;
localGame.players[2].alive = false;
localGame.evaluateRoundState();

const localBrief = localGame.getLocalSessionReturnBrief();
const reloadedBrief = new GameApp(root, assets).getLocalSessionReturnBrief();

const localChecks = {
  storesLocalWinner: localBrief?.winner === 1 && localBrief.matchComplete === true,
  storesLocalScore: localBrief?.scoreLine.includes("P1 2") === true
    && localBrief.scoreLine.includes("BOT P2 0") === true,
  reloadReadsLocalBrief: reloadedBrief?.winnerName === "P1"
    && reloadedBrief?.scoreLine === localBrief?.scoreLine,
};

const pass = Object.values(checks).every(Boolean) && Object.values(localChecks).every(Boolean);

console.log(JSON.stringify({ checks, localChecks, entryView, resultView, localBrief, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
