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

function resetMovementBoosts(player) {
  player.spawnProtectionMs = 0;
  player.flameGuardMs = 0;
  player.perfectStartWindowMs = 0;
  player.perfectStartBoostMs = 0;
  player.breakawayBoostMs = 0;
  player.pickupSprintMs = 0;
  player.speedLevel = 0;
}

function createOpenMatch({ withPickup = false } = {}) {
  const game = new GameApp(root, assets);
  game.startServerAuthoritativeMatch([1, 2], { 1: 0, 2: 0, 3: 0, 4: 0 });
  game.arena.solid.clear();
  game.arena.breakable.clear();
  game.bombs = [];
  game.flames = [];
  game.arena.powerUps = [];

  const player = game.players[1];
  setPlayerTile(player, { x: 2, y: 1 });
  player.direction = "right";
  resetMovementBoosts(player);

  if (withPickup) {
    game.arena.powerUps = [{
      type: "shield-up",
      tile: { x: 2, y: 1 },
      revealed: true,
      collected: false,
    }];
    game.setServerPlayerInput(1, neutralInput);
    game.advanceServerSimulation(17);
  }

  return game;
}

function advanceWithInput(game, input, ms) {
  game.setServerPlayerInput(1, input);
  game.advanceServerSimulation(ms);
}

function measureRightStep(game) {
  const player = game.players[1];
  const startX = player.position.x;
  advanceWithInput(game, { ...neutralInput, direction: "right" }, 120);
  return player.position.x - startX;
}

const baseGame = createOpenMatch();
const baseDistance = measureRightStep(baseGame);

const pickupGame = createOpenMatch({ withPickup: true });
const pickupPlayer = pickupGame.players[1];
const pickupCollected = pickupGame.arena.powerUps[0]?.collected === true;
const shieldGranted = pickupPlayer.shieldCharges === 1;
const pickupSprintStarted = (pickupPlayer.pickupSprintMs ?? 0) > 0;
const pickupDistance = measureRightStep(pickupGame);
const exportedDuringSprint = pickupGame.exportOnlineSnapshot().players[1].pickupSprintMs ?? 0;

advanceWithInput(pickupGame, neutralInput, 500);
const pickupSprintExpires = pickupGame.exportOnlineSnapshot().players[1].pickupSprintMs === 0;

const report = {
  baseDistance,
  pickupDistance,
  pickupCollected,
  shieldGranted,
  pickupSprintStarted,
  exportedDuringSprint,
  pickupSprintExpires,
  pass: baseDistance > 0
    && pickupCollected
    && shieldGranted
    && pickupSprintStarted
    && pickupDistance > baseDistance * 1.2
    && exportedDuringSprint > 0
    && pickupSprintExpires,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
