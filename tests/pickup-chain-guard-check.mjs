Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};
const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");
const {
  PICKUP_CHAIN_GUARD_MS,
  PICKUP_CHAIN_ROLLING_WINDOW_MS,
  PICKUP_CHAIN_WINDOW_MS,
  advancePickupChain,
  registerPickupForChain,
} = await import("../output/esm/Gameplay/pickup-chain.js");

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
  game.arena.powerUps = [];
  game.bombs = [];
  game.flames = [];
  const player = game.players[1];
  player.position = { x: 2.5 * TILE_SIZE, y: 1.5 * TILE_SIZE };
  player.tile = { x: 2, y: 1 };
  player.spawnProtectionMs = 0;
  player.flameGuardMs = 0;
  game.setServerPlayerInput(1, neutralInput);
  return game;
}

function collect(game, type) {
  game.arena.powerUps = [{
    type,
    tile: { x: 2, y: 1 },
    revealed: true,
    collected: false,
  }];
  game.advanceServerSimulation(17);
}

function getPlayerTextState(game) {
  return JSON.parse(game.renderGameToText()).players.find((player) => player.id === 1);
}

const chainGame = createOpenMatch();
collect(chainGame, "bomb-up");
const armedState = getPlayerTextState(chainGame);
chainGame.advanceServerSimulation(1_000);
collect(chainGame, "flame-up");
const firstGuardedState = getPlayerTextState(chainGame);
chainGame.advanceServerSimulation(100);
collect(chainGame, "speed-up");
const secondGuardedState = getPlayerTextState(chainGame);
const guardedPlayer = chainGame.players[1];
chainGame.flames = [{ tile: { x: 2, y: 1 }, remainingMs: 300 }];
chainGame.resolvePlayerDeathsFromFlames();
const survivedFlame = guardedPlayer.alive;

const repeatGame = createOpenMatch();
collect(repeatGame, "bomb-up");
repeatGame.advanceServerSimulation(500);
const duplicateWindowBeforePickup = getPlayerTextState(repeatGame).pickupChain.remainingMs;
collect(repeatGame, "bomb-up");
const repeatedState = getPlayerTextState(repeatGame);

const expiredGame = createOpenMatch();
collect(expiredGame, "bomb-up");
expiredGame.advanceServerSimulation(PICKUP_CHAIN_WINDOW_MS + 100);
collect(expiredGame, "flame-up");
const expiredState = getPlayerTextState(expiredGame);

const nonPositiveDeltaState = { previousType: "bomb-up", remainingMs: 2_000 };
advancePickupChain(nonPositiveDeltaState, 0);
const zeroDeltaState = { ...nonPositiveDeltaState };
advancePickupChain(nonPositiveDeltaState, -250);
const negativeDeltaState = { ...nonPositiveDeltaState };

const nonFiniteDeltaStates = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
  .map((deltaMs) => {
    const state = { previousType: "flame-up", remainingMs: 2_000 };
    advancePickupChain(state, deltaMs);
    return { deltaMs: String(deltaMs), ...state };
  });
const nonFiniteDeltaNoop = nonFiniteDeltaStates.every((state) => (
  state.previousType === "flame-up" && state.remainingMs === 2_000
));

const invalidRegistrationStates = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
  .map((remainingMs) => {
    const state = { previousType: "bomb-up", remainingMs };
    const completedChain = registerPickupForChain(state, "flame-up");
    return { initialRemainingMs: String(remainingMs), completedChain, ...state };
  });
const invalidRegistrationRecovers = invalidRegistrationStates.every((state) => (
  state.completedChain === false
  && state.previousType === "flame-up"
  && state.remainingMs === PICKUP_CHAIN_WINDOW_MS
));

const report = {
  constants: { PICKUP_CHAIN_WINDOW_MS, PICKUP_CHAIN_ROLLING_WINDOW_MS, PICKUP_CHAIN_GUARD_MS },
  armedState: {
    pickupChain: armedState.pickupChain,
    flameGuardMs: armedState.flameGuardMs,
  },
  firstGuardedState: {
    pickupChain: firstGuardedState.pickupChain,
    flameGuardMs: firstGuardedState.flameGuardMs,
    hudStatus: firstGuardedState.hudStatus,
    recentPowerUpPickup: firstGuardedState.recentPowerUpPickup,
  },
  secondGuardedState: {
    pickupChain: secondGuardedState.pickupChain,
    flameGuardMs: secondGuardedState.flameGuardMs,
    hudStatus: secondGuardedState.hudStatus,
    recentPowerUpPickup: secondGuardedState.recentPowerUpPickup,
  },
  survivedFlame,
  repeatedState: {
    duplicateWindowBeforePickup,
    pickupChain: repeatedState.pickupChain,
    flameGuardMs: repeatedState.flameGuardMs,
  },
  expiredState: {
    pickupChain: expiredState.pickupChain,
    flameGuardMs: expiredState.flameGuardMs,
  },
  negativeDeltaState,
  nonFiniteDeltaStates,
  nonFiniteDeltaNoop,
  invalidRegistrationStates,
  invalidRegistrationRecovers,
  nonPositiveDeltaNoop: zeroDeltaState.previousType === "bomb-up"
    && zeroDeltaState.remainingMs === 2_000
    && negativeDeltaState.previousType === "bomb-up"
    && negativeDeltaState.remainingMs === 2_000,
  pass: nonFiniteDeltaNoop
    && invalidRegistrationRecovers
    && zeroDeltaState.previousType === "bomb-up"
    && zeroDeltaState.remainingMs === 2_000
    && negativeDeltaState.previousType === "bomb-up"
    && negativeDeltaState.remainingMs === 2_000
    && armedState.pickupChain.previousType === "bomb-up"
    && armedState.pickupChain.remainingMs > 0
    && armedState.flameGuardMs === 0
    && firstGuardedState.pickupChain.previousType === "flame-up"
    && firstGuardedState.pickupChain.remainingMs > 0
    && firstGuardedState.pickupChain.remainingMs <= PICKUP_CHAIN_ROLLING_WINDOW_MS
    && firstGuardedState.flameGuardMs > 0
    && firstGuardedState.flameGuardMs <= PICKUP_CHAIN_GUARD_MS
    && firstGuardedState.hudStatus.label === `GUARD ${(firstGuardedState.flameGuardMs / 1000).toFixed(1)}s`
    && firstGuardedState.recentPowerUpPickup?.chainGuard === true
    && secondGuardedState.pickupChain.previousType === "speed-up"
    && secondGuardedState.pickupChain.remainingMs > 0
    && secondGuardedState.pickupChain.remainingMs <= PICKUP_CHAIN_ROLLING_WINDOW_MS
    && secondGuardedState.flameGuardMs === PICKUP_CHAIN_GUARD_MS
    && secondGuardedState.flameGuardMs >= firstGuardedState.flameGuardMs
    && secondGuardedState.hudStatus.label === `GUARD ${(secondGuardedState.flameGuardMs / 1000).toFixed(1)}s`
    && secondGuardedState.recentPowerUpPickup?.chainGuard === true
    && survivedFlame
    && repeatedState.flameGuardMs === 0
    && repeatedState.pickupChain.previousType === "bomb-up"
    && repeatedState.pickupChain.remainingMs > 0
    && repeatedState.pickupChain.remainingMs <= duplicateWindowBeforePickup
    && expiredState.flameGuardMs === 0
    && expiredState.pickupChain.previousType === "flame-up",
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) {
  process.exit(1);
}
