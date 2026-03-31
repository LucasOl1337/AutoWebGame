Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};
const listeners = new Map();
const mainDrawCalls = [];
const mainFillCalls = [];

const fakeMainCtx = {
  imageSmoothingEnabled: false,
  fillStyle: "#000000",
  globalAlpha: 1,
  clearRect: noop,
  fillRect: (...args) => {
    mainFillCalls.push({ args, fillStyle: fakeMainCtx.fillStyle });
  },
  strokeRect: noop,
  beginPath: noop,
  moveTo: noop,
  lineTo: noop,
  closePath: noop,
  fill: noop,
  stroke: noop,
  arc: noop,
  ellipse: noop,
  drawImage: (...args) => {
    mainDrawCalls.push(args);
  },
  fillText: noop,
  strokeText: noop,
  save: noop,
  restore: noop,
  setTransform: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
};

const trimWidth = 124;
const trimHeight = 124;
const trimData = new Uint8ClampedArray(trimWidth * trimHeight * 4);
for (let y = 22; y <= 111; y += 1) {
  for (let x = 46; x <= 77; x += 1) {
    trimData[(y * trimWidth + x) * 4 + 3] = 255;
  }
}

const fakeTrimCtx = {
  clearRect: noop,
  drawImage: noop,
  getImageData: () => ({ data: trimData }),
};

const makeCanvas = (ctx) => ({
  width: 0,
  height: 0,
  dataset: {},
  style: {},
  setAttribute: noop,
  getContext: () => ctx,
  requestFullscreen: async () => {},
});

let createCount = 0;
globalThis.document = {
  fullscreenElement: null,
  createElement: () => {
    createCount += 1;
    return createCount === 1 ? makeCanvas(fakeMainCtx) : makeCanvas(fakeTrimCtx);
  },
  exitFullscreen: async () => {},
};

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  addEventListener: (event, handler) => {
    listeners.set(event, handler);
  },
  requestAnimationFrame: noop,
};

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");

const fakeSprite = {
  naturalWidth: trimWidth,
  naturalHeight: trimHeight,
  width: trimWidth,
  height: trimHeight,
};

const directionalSprites = {
  up: fakeSprite,
  down: fakeSprite,
  left: fakeSprite,
  right: fakeSprite,
  walk: { up: [], down: [], left: [], right: [] },
};

const game = new GameApp(
  { appendChild: noop },
  {
    players: { 1: directionalSprites, 2: directionalSprites },
    floor: { base: null, lane: null, spawn: null },
    props: { wall: null, crate: null, bomb: null, flame: null },
    powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null, "remote-up": null },
  },
);

const player = game.players[1];
game.drawPlayer(player);

const spriteDraw = mainDrawCalls.at(-1);
const usesTrimmedSource = spriteDraw?.[3] === 32 && spriteDraw?.[4] === 90;
const largerThanOldScale = Number(spriteDraw?.[8] ?? 0) > TILE_SIZE * 1.3;
const hitboxVisible = mainFillCalls.length > 0;
const pass = Boolean(spriteDraw) && usesTrimmedSource && largerThanOldScale && !hitboxVisible;

console.log(
  JSON.stringify(
    {
      drawCalls: mainDrawCalls.length,
      fillCalls: mainFillCalls.length,
      srcRect: spriteDraw ? { width: spriteDraw[3], height: spriteDraw[4] } : null,
      dstHeight: spriteDraw?.[8] ?? null,
      usesTrimmedSource,
      largerThanOldScale,
      hitboxVisible,
      pass,
    },
    null,
    2,
  ),
);

if (!pass) {
  process.exit(1);
}
