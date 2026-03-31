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

const { GameApp } = await import("../output/esm/Engine/game-app.js");

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

game.setServerBotPlayers([3, 4]);
game.setServerCharacterSelections({ 1: 0, 2: 5, 3: 2, 4: 3 });
game.eliminateServerPlayer(2);

const snapshot = game.exportOnlineSnapshot();
const pass = snapshot.roomMode === "endless"
  && snapshot.botPlayerIds.length === 2
  && snapshot.botPlayerIds.includes(3)
  && snapshot.botPlayerIds.includes(4)
  && !snapshot.botPlayerIds.includes(2)
  && snapshot.players[2].alive === false
  && snapshot.players[2].active === true
  && snapshot.selectedCharacterIndex[2] === 5;

console.log(JSON.stringify({
  botPlayerIds: snapshot.botPlayerIds,
  player2: {
    alive: snapshot.players[2].alive,
    active: snapshot.players[2].active,
    selectedCharacterIndex: snapshot.selectedCharacterIndex[2],
  },
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
