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
  dataset: {},
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

const game = new GameApp(root, assets);
game.startServerAuthoritativeMatch([1, 2, 3, 4], { 1: 0, 2: 1, 3: 0, 4: 1 });

const snapshot = game.exportOnlineSnapshot();
const expectedTiles = snapshot.arena.spawnMap;

const players = snapshot.activePlayerIds.map((playerId) => ({
  id: playerId,
  active: snapshot.players[playerId].active,
  alive: snapshot.players[playerId].alive,
  tile: snapshot.players[playerId].tile,
}));

const pass = snapshot.activePlayerIds.length === 4
  && Boolean(snapshot.arena)
  && snapshot.activePlayerIds.every((playerId) => (
    snapshot.players[playerId].active
    && snapshot.players[playerId].alive
    && snapshot.players[playerId].tile.x === expectedTiles[playerId].tile.x
    && snapshot.players[playerId].tile.y === expectedTiles[playerId].tile.y
  ));

console.log(JSON.stringify({
  activePlayerIds: snapshot.activePlayerIds,
  players,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
