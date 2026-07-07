Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};

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
  return game;
}

function advanceWithInput(game, input, ms) {
  game.setServerPlayerInput(1, input);
  game.advanceServerSimulation(ms);
}

const immediateGame = createOpenMatch();
const immediatePlayer = immediateGame.players[1];
const immediateStartX = immediatePlayer.position.x;
advanceWithInput(immediateGame, { ...neutralInput, direction: "right" }, 120);
const immediateDistance = immediatePlayer.position.x - immediateStartX;

const delayedGame = createOpenMatch();
const delayedPlayer = delayedGame.players[1];
const delayedStartX = delayedPlayer.position.x;
advanceWithInput(delayedGame, neutralInput, 420);
advanceWithInput(delayedGame, { ...neutralInput, direction: "right" }, 120);
const delayedDistance = delayedPlayer.position.x - delayedStartX;

const immediateSnapshot = immediateGame.exportOnlineSnapshot();
const delayedSnapshot = delayedGame.exportOnlineSnapshot();
const immediateState = immediateSnapshot.players[1];
const delayedState = delayedSnapshot.players[1];

const report = {
  immediateDistance,
  delayedDistance,
  immediateBoostMs: immediateState.perfectStartBoostMs,
  immediateWindowMs: immediateState.perfectStartWindowMs,
  delayedBoostMs: delayedState.perfectStartBoostMs,
  delayedWindowMs: delayedState.perfectStartWindowMs,
  pass: immediateDistance > delayedDistance * 1.2
    && immediateState.perfectStartBoostMs > 0
    && immediateState.perfectStartWindowMs === 0
    && delayedState.perfectStartBoostMs === 0
    && delayedState.perfectStartWindowMs === 0,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
