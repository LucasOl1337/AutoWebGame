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
  player.speedLevel = 0;
}

function createOpenMatch({ fuseMs = null, protectedMs = 0 } = {}) {
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

  const player = game.players[1];
  setPlayerTile(player, { x: 3, y: 3 });
  player.direction = "right";
  resetMovementBoosts(player);
  player.spawnProtectionMs = protectedMs;

  if (fuseMs !== null) {
    game.bombs = [{
      id: 1,
      ownerId: 2,
      tile: { x: 3, y: 5 },
      fuseMs,
      ownerCanPass: false,
      flameRange: 2,
    }];
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

const baseDistance = measureRightStep(createOpenMatch());
const imminentDistance = measureRightStep(createOpenMatch({ fuseMs: 650 }));
const futureDistance = measureRightStep(createOpenMatch({ fuseMs: 1400 }));
const protectedDistance = measureRightStep(createOpenMatch({ fuseMs: 650, protectedMs: 500 }));

const report = {
  baseDistance,
  imminentDistance,
  futureDistance,
  protectedDistance,
  pass: baseDistance > 0
    && imminentDistance > baseDistance * 1.12
    && futureDistance <= baseDistance * 1.08
    && protectedDistance <= baseDistance * 1.08,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
