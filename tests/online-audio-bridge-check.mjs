Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });

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
};

const root = { appendChild: noop };
const assets = {
  players: { 1: emptySprites, 2: emptySprites },
  characterRoster: [
    { id: "alpha", name: "Alpha", size: null, sprites: emptySprites, pinned: true, defaultSlot: 1, order: 0 },
    { id: "beta", name: "Beta", size: null, sprites: emptySprites, pinned: true, defaultSlot: 2, order: 1 },
  ],
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
game.attachOnlineSession({
  role: "guest",
  roomCode: "TEST",
  sendGuestInput: noop,
  sendHostSnapshot: noop,
  sendMatchResultChoice: noop,
});
game.startOnlineMatch({
  role: "guest",
  roomCode: "TEST",
  localPlayerId: 1,
  activePlayerIds: [1, 2],
  characterSelections: { 1: 0, 2: 1, 3: 0, 4: 0 },
});

const calls = [];
game.soundManager.playOneShot = (key) => {
  calls.push(key);
};

const basePlayers = {
  1: {
    id: 1,
    name: "P1",
    active: true,
    alive: true,
    tile: { x: 2, y: 1 },
    position: { x: 60, y: 30 },
    velocity: { x: 0, y: 0 },
    direction: "down",
    color: "#fff",
    bombsAvailable: 1,
    activeBombs: 0,
    flameRange: 1,
    moveMs: 320,
    remoteLevel: 0,
    shieldCharges: 1,
    flameGuardMs: 0,
    bombPassLevel: 0,
    kickLevel: 0,
    activeSkill: null,
    skillCooldownMs: 0,
    spawnProtectionMs: 0,
  },
  2: {
    id: 2,
    name: "P2",
    active: true,
    alive: true,
    tile: { x: 8, y: 7 },
    position: { x: 240, y: 210 },
    velocity: { x: 0, y: 0 },
    direction: "up",
    color: "#fff",
    bombsAvailable: 1,
    activeBombs: 0,
    flameRange: 1,
    moveMs: 320,
    remoteLevel: 0,
    shieldCharges: 0,
    flameGuardMs: 0,
    bombPassLevel: 0,
    kickLevel: 0,
    activeSkill: null,
    skillCooldownMs: 0,
    spawnProtectionMs: 0,
  },
  3: {
    id: 3,
    name: "P3",
    active: false,
    alive: false,
    tile: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    direction: "down",
    color: "#fff",
    bombsAvailable: 1,
    activeBombs: 0,
    flameRange: 1,
    moveMs: 320,
    remoteLevel: 0,
    shieldCharges: 0,
    flameGuardMs: 0,
    bombPassLevel: 0,
    kickLevel: 0,
    activeSkill: null,
    skillCooldownMs: 0,
    spawnProtectionMs: 0,
  },
  4: {
    id: 4,
    name: "P4",
    active: false,
    alive: false,
    tile: { x: 0, y: 0 },
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    direction: "down",
    color: "#fff",
    bombsAvailable: 1,
    activeBombs: 0,
    flameRange: 1,
    moveMs: 320,
    remoteLevel: 0,
    shieldCharges: 0,
    flameGuardMs: 0,
    bombPassLevel: 0,
    kickLevel: 0,
    activeSkill: null,
    skillCooldownMs: 0,
    spawnProtectionMs: 0,
  },
};

game.applyOnlineSnapshot({
  serverTimeMs: 0,
  serverTick: 0,
  frameId: 0,
  ackedInputSeq: { 1: 0, 2: 0, 3: 0, 4: 0 },
  mode: "match",
  breakableTiles: ["4,4"],
  powerUps: [{
    type: "bomb-up",
    tile: { x: 4, y: 4 },
    revealed: true,
    collected: false,
  }],
  players: basePlayers,
  bombs: [],
  flames: [],
  nextBombId: 1,
  score: { 1: 0, 2: 0, 3: 0, 4: 0 },
  roundNumber: 1,
  roundTimeMs: 60000,
  paused: false,
  roundOutcome: null,
  matchWinner: null,
  animationClockMs: 0,
  suddenDeathActive: false,
  suddenDeathTickMs: 800,
  suddenDeathIndex: 0,
  showDangerOverlay: false,
  showBombPreview: false,
  selectedCharacterIndex: { 1: 0, 2: 1, 3: 0, 4: 0 },
  activePlayerIds: [1, 2],
});

game.applyOnlineFrame({
  serverTimeMs: 50,
  serverTick: 1,
  frameId: 1,
  ackedInputSeq: { 1: 0, 2: 0, 3: 0, 4: 0 },
  mode: "match",
  players: basePlayers,
  bombs: [{
    id: 1,
    ownerId: 1,
    tile: { x: 2, y: 2 },
    fuseMs: 900,
    ownerCanPass: false,
    flameRange: 1,
  }],
  flames: [],
  nextBombId: 2,
  score: { 1: 0, 2: 0, 3: 0, 4: 0 },
  roundNumber: 1,
  roundTimeMs: 59950,
  paused: false,
  roundOutcome: null,
  matchWinner: null,
  animationClockMs: 50,
  suddenDeathActive: false,
  suddenDeathTickMs: 750,
  suddenDeathIndex: 0,
  selectedCharacterIndex: { 1: 0, 2: 1, 3: 0, 4: 0 },
  activePlayerIds: [1, 2],
});

const placementCalls = [...calls];

game.applyOnlineSnapshot({
  serverTimeMs: 100,
  serverTick: 2,
  frameId: 2,
  ackedInputSeq: { 1: 0, 2: 0, 3: 0, 4: 0 },
  mode: "match-result",
  breakableTiles: [],
  powerUps: [{
    type: "bomb-up",
    tile: { x: 4, y: 4 },
    revealed: true,
    collected: true,
  }],
  players: {
    ...basePlayers,
    1: {
      ...basePlayers[1],
      shieldCharges: 0,
      flameGuardMs: 400,
    },
    2: {
      ...basePlayers[2],
      alive: false,
    },
  },
  bombs: [],
  flames: [{
    tile: { x: 2, y: 2 },
    remainingMs: 400,
  }],
  nextBombId: 2,
  score: { 1: 1, 2: 0, 3: 0, 4: 0 },
  roundNumber: 1,
  roundTimeMs: 59800,
  paused: false,
  roundOutcome: { winner: 1, reason: "elimination" },
  matchWinner: null,
  animationClockMs: 100,
  suddenDeathActive: true,
  suddenDeathTickMs: 700,
  suddenDeathIndex: 1,
  showDangerOverlay: false,
  showBombPreview: false,
  selectedCharacterIndex: { 1: 0, 2: 1, 3: 0, 4: 0 },
  activePlayerIds: [1, 2],
});

const expected = [
  "bombPlace",
  "suddenDeath",
  "bombExplode",
  "flameIgnite",
  "crateBreak",
  "powerupCollect",
  "shieldBlock",
  "playerDeath",
  "roundWin",
];

const pass = placementCalls.length === 1
  && placementCalls[0] === "bombPlace"
  && expected.every((key) => calls.includes(key));

console.log(JSON.stringify({ placementCalls, calls, expected, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
