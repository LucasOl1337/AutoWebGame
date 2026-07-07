Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");

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
    "short-fuse-up": null,
  },
};

const neutralInput = {
  direction: null,
  bombPressed: false,
  detonatePressed: false,
  skillPressed: false,
  skillHeld: false,
};

function setPlayerTile(player, tile) {
  player.position = {
    x: tile.x * TILE_SIZE + TILE_SIZE * 0.5,
    y: tile.y * TILE_SIZE + TILE_SIZE * 0.5,
  };
  player.tile = { ...tile };
}

function createOpenMatch() {
  const game = new GameApp(root, assets);
  game.startServerAuthoritativeMatch([1, 2], { 1: 0, 2: 0, 3: 0, 4: 0 });
  game.arena.solid.clear();
  game.arena.breakable.clear();
  game.bombs = [];
  game.flames = [];
  for (const powerUp of game.arena.powerUps) {
    powerUp.revealed = false;
    powerUp.collected = true;
  }

  const p1 = game.players[1];
  setPlayerTile(p1, { x: 2, y: 1 });
  p1.direction = "right";
  p1.spawnProtectionMs = 0;
  p1.flameGuardMs = 0;
  p1.shieldCharges = 0;
  p1.perfectStartWindowMs = 0;
  p1.perfectStartBoostMs = 0;
  p1.breakawayBoostMs = 0;
  return game;
}

function advanceWithInput(game, input, ms) {
  game.setServerPlayerInput(1, input);
  game.advanceServerSimulation(ms);
}

const shieldGame = createOpenMatch();
const shieldPlayer = shieldGame.players[1];
shieldPlayer.shieldCharges = 1;
shieldGame.flames = [{ tile: { x: 2, y: 1 }, remainingMs: 400 }];
shieldGame.resolvePlayerDeathsFromFlames();

const survivedShieldHit = shieldPlayer.alive === true;
const shieldSpentOnHit = shieldPlayer.shieldCharges === 0;
const guardWindowActive = (shieldPlayer.flameGuardMs ?? 0) > 0;
const breakawayStarted = (shieldPlayer.breakawayBoostMs ?? 0) > 0;
shieldGame.flames = [];

const boostedStartX = shieldPlayer.position.x;
advanceWithInput(shieldGame, { ...neutralInput, direction: "right" }, 120);
const boostedDistance = shieldPlayer.position.x - boostedStartX;
const boostedState = shieldGame.exportOnlineSnapshot().players[1];

const baseGame = createOpenMatch();
const basePlayer = baseGame.players[1];
const baseStartX = basePlayer.position.x;
advanceWithInput(baseGame, { ...neutralInput, direction: "right" }, 120);
const baseDistance = basePlayer.position.x - baseStartX;

advanceWithInput(shieldGame, neutralInput, 600);
const breakawayExpires = shieldGame.exportOnlineSnapshot().players[1].breakawayBoostMs === 0;

const report = {
  survivedShieldHit,
  shieldSpentOnHit,
  guardWindowActive,
  breakawayStarted,
  boostedDistance,
  baseDistance,
  exportedBreakawayBoostMs: boostedState.breakawayBoostMs,
  breakawayExpires,
  pass: survivedShieldHit
    && shieldSpentOnHit
    && guardWindowActive
    && breakawayStarted
    && boostedDistance > baseDistance * 1.2
    && boostedState.breakawayBoostMs > 0
    && breakawayExpires,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
