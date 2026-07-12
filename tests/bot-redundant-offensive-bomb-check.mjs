Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};
const fakeCtx = {
  imageSmoothingEnabled: false, clearRect: noop, fillRect: noop, strokeRect: noop,
  beginPath: noop, moveTo: noop, lineTo: noop, closePath: noop, fill: noop,
  stroke: noop, arc: noop, ellipse: noop, drawImage: noop, fillText: noop,
  strokeText: noop, save: noop, restore: noop, setTransform: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
};
const fakeCanvas = {
  width: 0, height: 0, style: {}, setAttribute: noop, getContext: () => fakeCtx,
  requestFullscreen: async () => {},
};
globalThis.document = {
  fullscreenElement: null, createElement: () => fakeCanvas, exitFullscreen: async () => {},
};
globalThis.window = {
  innerWidth: 1280, innerHeight: 720, addEventListener: noop, requestAnimationFrame: noop,
};

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");
const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "bomb-up": null, "flame-up": null, "speed-up": null, "remote-up": null },
};

function setPlayerTile(player, tile) {
  player.position = { x: tile.x * TILE_SIZE + TILE_SIZE * 0.5, y: tile.y * TILE_SIZE + TILE_SIZE * 0.5 };
  player.tile = { ...tile };
}

function setup({ remote = 0, crate = false } = {}) {
  const game = new GameApp(root, assets);
  game.startMatch();
  const bot = game.players[2];
  const enemy = game.players[1];
  bot.spawnProtectionMs = 0;
  enemy.spawnProtectionMs = 0;
  bot.maxBombs = 2;
  bot.activeBombs = 1;
  bot.flameRange = 2;
  bot.remoteLevel = remote;
  game.botBombCooldownMs = 0;
  game.flames = [];
  game.arena.solid = new Set();
  game.arena.breakable = crate ? new Set(["3,2"]) : new Set();
  setPlayerTile(bot, { x: 2, y: 2 });
  setPlayerTile(enemy, { x: 5, y: 2 });
  game.bombs = [{ id: 9101, ownerId: 2, tile: { x: 4, y: 2 }, fuseMs: 1600, ownerCanPass: false, flameRange: 2 }];
  return { game, bot };
}

const offensive = setup();
const redundantDecision = offensive.game.getBotDecision(offensive.bot);
const avoidsRedundantOffense = redundantDecision.placeBomb === false;

const opening = setup({ crate: true });
const openingDecision = opening.game.getBotDecision(opening.bot);
const preservesCrateOpening = openingDecision.placeBomb === true;

const remote = setup({ remote: 1 });
setPlayerTile(remote.bot, { x: 2, y: 3 });
const remoteDecision = remote.game.getBotDecision(remote.bot);
const preservesRemoteDetonation = remoteDecision.detonate === true && remoteDecision.placeBomb === false;

const escape = setup();
setPlayerTile(escape.bot, { x: 4, y: 2 });
const escapeDecision = escape.game.getBotDecision(escape.bot);
const preservesEscape = escapeDecision.placeBomb === false && escapeDecision.direction !== null;

const report = {
  redundantDecision, avoidsRedundantOffense,
  openingDecision, preservesCrateOpening,
  remoteDecision, preservesRemoteDetonation,
  escapeDecision, preservesEscape,
};
console.log(JSON.stringify(report, null, 2));
if (!avoidsRedundantOffense || !preservesCrateOpening || !preservesRemoteDetonation || !preservesEscape) {
  process.exit(1);
}
