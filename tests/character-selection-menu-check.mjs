Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};
const listeners = new Map();
const fakeWindow = {
  innerWidth: 1280,
  innerHeight: 720,
  addEventListener: (event, handler) => {
    listeners.set(event, handler);
  },
  requestAnimationFrame: noop,
};

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

globalThis.window = fakeWindow;
globalThis.document = {
  fullscreenElement: null,
  createElement: () => fakeCanvas,
  exitFullscreen: async () => {},
};

const { GameApp } = await import("../output/esm/app/game-app.js");

const characterSprites = {
  up: null,
  down: null,
  left: null,
  right: null,
  walk: { up: [], down: [], left: [], right: [] },
};

const game = new GameApp(
  { appendChild: noop },
  {
    players: { 1: characterSprites, 2: characterSprites },
    characterRoster: [
      { id: "alpha", name: "Alpha", size: null, sprites: characterSprites, pinned: true, defaultSlot: 1, order: 0 },
      { id: "beta", name: "Beta", size: null, sprites: characterSprites, pinned: true, defaultSlot: 2, order: 1 },
      { id: "gamma", name: "Gamma", size: null, sprites: characterSprites, order: 2 },
    ],
    floor: { base: null, lane: null, spawn: null },
    props: { wall: null, crate: null, bomb: null, flame: null },
    powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null, "remote-up": null, "shield-up": null },
  },
);

game.mode = "menu";
const defaultsPinned = game.selectedCharacterIndex[1] === 0 && game.selectedCharacterIndex[2] === 1;

function press(code) {
  const keydown = listeners.get("keydown");
  const keyup = listeners.get("keyup");
  if (keydown) {
    keydown({ code, preventDefault: noop });
  }
  if (keyup) {
    keyup({ code });
  }
}

press("KeyG");
game.update(1000 / 60);
const opened = game.characterMenuOpen[1] === true;

press("KeyS");
game.update(1000 / 60);
const moved = game.pendingCharacterIndex[1] === 1;

press("KeyE");
game.update(1000 / 60);
const locked = game.characterMenuOpen[1] === false
  && game.selectedCharacterIndex[1] === 1
  && game.characterLocked[1] === true;

const pass = defaultsPinned && opened && moved && locked;
const report = {
  defaultsPinned,
  opened,
  moved,
  locked,
  selectedCharacterIndex: game.selectedCharacterIndex,
  pendingCharacterIndex: game.pendingCharacterIndex,
  pass,
};

console.log(JSON.stringify(report, null, 2));
if (!pass) {
  process.exit(1);
}
