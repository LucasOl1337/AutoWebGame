Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");

const CROCODILO_CHANNEL_MS = 1_600;
const CROCODILO_RELEASE_MS = 240;
const CROCODILO_COOLDOWN_MS = 6_000;

const emptyDirectionalSprites = {
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
  players: { 1: emptyDirectionalSprites, 2: emptyDirectionalSprites, 3: emptyDirectionalSprites, 4: emptyDirectionalSprites },
  characterRoster: [
    { id: "d083c3dc-7162-4391-8628-6adde0b8d8d6", name: "Crocodilo Arcano", size: null, sprites: emptyDirectionalSprites, defaultSlot: 1 },
    { id: "dummy-a", name: "Dummy A", size: null, sprites: emptyDirectionalSprites, defaultSlot: 2 },
    { id: "dummy-b", name: "Dummy B", size: null, sprites: emptyDirectionalSprites, defaultSlot: 3 },
  ],
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

function createServerMatch(characterSelections) {
  const game = new GameApp(root, assets);
  game.startServerAuthoritativeMatch([1, 2, 3], characterSelections);
  game.arena.solid.clear();
  game.arena.breakable.clear();
  game.bombs = [];
  game.flames = [];
  return game;
}

const neutralInput = {
  bombPressed: false,
  detonatePressed: false,
  skillPressed: false,
  skillHeld: false,
};

const game = createServerMatch({ 1: 0, 2: 1, 3: 2, 4: 0 });
const crocodilo = game.players[1];
const closeEnemy = game.players[2];
const farEnemy = game.players[3];

crocodilo.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
crocodilo.tile = { x: 4, y: 4 };
crocodilo.spawnProtectionMs = 0;

closeEnemy.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 6 * TILE_SIZE + TILE_SIZE * 0.5 };
closeEnemy.tile = { x: 4, y: 6 };
closeEnemy.spawnProtectionMs = 0;

farEnemy.position = { x: 8 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
farEnemy.tile = { x: 8, y: 4 };
farEnemy.spawnProtectionMs = 0;

game.arena.breakable.add("4,3");
game.bombs.push({
  id: 1,
  ownerId: 2,
  tile: { x: 6, y: 4 },
  fuseMs: 1_800,
  ownerCanPass: false,
  flameRange: 0,
});

game.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
  skillHeld: true,
});
game.advanceServerSimulation(17);

const channelStartX = crocodilo.position.x;
let midSnapshot = null;
let channelElapsedMs = 17;

for (; channelElapsedMs < 2_400 && crocodilo.skill.phase === "channeling"; channelElapsedMs += 17) {
  game.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
    skillHeld: true,
  });
  game.advanceServerSimulation(17);
  if (channelElapsedMs >= Math.floor(CROCODILO_CHANNEL_MS / 2) && !midSnapshot) {
    midSnapshot = {
      x: crocodilo.position.x,
      skill: { ...crocodilo.skill },
    };
  }
}

const afterFireSkill = { ...crocodilo.skill };
const toxicTileKeys = new Set(
  game.flames
    .filter((flame) => flame.style === "toxic")
    .map((flame) => `${flame.tile.x},${flame.tile.y}`),
);
const bombTriggered = game.bombs.some((bomb) => bomb.id === 1 && bomb.fuseMs === 0);

const immuneGame = createServerMatch({ 1: 0, 2: 1, 3: 2, 4: 0 });
const immuneCrocodilo = immuneGame.players[1];
immuneCrocodilo.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
immuneCrocodilo.tile = { x: 4, y: 4 };
immuneCrocodilo.spawnProtectionMs = 0;
immuneGame.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
  skillHeld: true,
});
immuneGame.advanceServerSimulation(17);
for (let elapsedMs = 17; elapsedMs < 600; elapsedMs += 17) {
  immuneGame.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
    skillHeld: true,
  });
  immuneGame.advanceServerSimulation(17);
}
immuneGame.flames.push({
  tile: { x: 4, y: 4 },
  remainingMs: 500,
  style: "normal",
});
immuneGame.resolvePlayerDeathsFromFlames();
const stayedImmuneDuringChannel = immuneCrocodilo.alive === true
  && immuneCrocodilo.skill.phase === "channeling";

for (let elapsedMs = 0; elapsedMs < 800 && crocodilo.skill.phase === "releasing"; elapsedMs += 17) {
  game.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
  });
  game.advanceServerSimulation(17);
}

const afterReleaseSkill = { ...crocodilo.skill };

const stayedFrozen = Math.abs((midSnapshot?.x ?? crocodilo.position.x) - channelStartX) < 1.5;
const channelingObserved = midSnapshot?.skill?.phase === "channeling";
const enteredReleaseOnFullHold = afterFireSkill.phase === "releasing"
  && afterFireSkill.channelRemainingMs > 0
  && afterFireSkill.cooldownRemainingMs === 0;
const finishedIntoCooldown = afterReleaseSkill.phase === "cooldown"
  && afterReleaseSkill.cooldownRemainingMs === CROCODILO_COOLDOWN_MS;
const toxicCrossSpawned = toxicTileKeys.has("5,4")
  && toxicTileKeys.has("3,4")
  && toxicTileKeys.has("2,4")
  && toxicTileKeys.has("4,5")
  && toxicTileKeys.has("4,6")
  && toxicTileKeys.has("4,3")
  && toxicTileKeys.has("4,2") === false
  && toxicTileKeys.has("4,4") === false;
const surgeHitCloseEnemy = closeEnemy.alive === false;
const surgeMissedFarEnemy = farEnemy.alive === true;
const surgeBrokeCrate = game.arena.breakable.has("4,3") === false;
const surgeTriggeredBomb = bombTriggered || game.bombs.every((bomb) => bomb.id !== 1);
const surgeKeptCasterSafe = crocodilo.alive === true;

const cancelGame = createServerMatch({ 1: 0, 2: 1, 3: 2, 4: 0 });
const cancelCrocodilo = cancelGame.players[1];
const cancelEnemy = cancelGame.players[2];
cancelCrocodilo.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
cancelCrocodilo.tile = { x: 4, y: 4 };
cancelCrocodilo.spawnProtectionMs = 0;
cancelEnemy.position = { x: 6 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
cancelEnemy.tile = { x: 6, y: 4 };
cancelEnemy.spawnProtectionMs = 0;

cancelGame.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
  skillHeld: true,
});
cancelGame.advanceServerSimulation(17);

for (let elapsedMs = 17; elapsedMs < 600; elapsedMs += 17) {
  cancelGame.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
    skillHeld: true,
  });
  cancelGame.advanceServerSimulation(17);
}

cancelGame.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillHeld: false,
});
cancelGame.advanceServerSimulation(17);

const canceledBeforeFire = cancelCrocodilo.skill.phase === "idle"
  && cancelCrocodilo.skill.cooldownRemainingMs === 0
  && cancelGame.flames.length === 0
  && cancelEnemy.alive === true;

const castMarkerA = { id: "cast-a" };
const castMarkerB = { id: "cast-b" };
const castMarkerC = { id: "cast-c" };
const castMarkerD = { id: "cast-d" };
const animationSprites = {
  ...emptyDirectionalSprites,
  cast: { up: [], down: [], left: [], right: [castMarkerA, castMarkerB, castMarkerC, castMarkerD] },
};
const animationAssets = {
  ...assets,
  characterRoster: [
    { id: "d083c3dc-7162-4391-8628-6adde0b8d8d6", name: "Crocodilo Arcano", size: null, sprites: animationSprites, defaultSlot: 1 },
    { id: "dummy-a", name: "Dummy A", size: null, sprites: emptyDirectionalSprites, defaultSlot: 2 },
    { id: "dummy-b", name: "Dummy B", size: null, sprites: emptyDirectionalSprites, defaultSlot: 3 },
  ],
};
const animationGame = new GameApp(root, animationAssets);
animationGame.startServerAuthoritativeMatch([1, 2], { 1: 0, 2: 1, 3: 2, 4: 0 });
const animationCrocodilo = animationGame.players[1];
animationCrocodilo.skill = {
  id: "crocodilo-emerald-surge",
  phase: "channeling",
  channelRemainingMs: 1_000,
  cooldownRemainingMs: 0,
  castElapsedMs: 600,
  projectedPosition: null,
  projectedLastMoveDirection: "right",
};
const animationChoice = animationGame.getActiveSkillAnimationFrames(
  animationCrocodilo,
  "right",
  [castMarkerA, castMarkerB, castMarkerC, castMarkerD],
  [],
  [],
);
const usesChannelCastTiming = animationChoice?.frames?.length === 3
  && animationChoice?.frames?.[0] === castMarkerA
  && animationChoice?.frames?.[2] === castMarkerC
  && animationChoice?.frameMs === Math.floor(CROCODILO_CHANNEL_MS / 3)
  && animationChoice?.playback === "hold";

animationCrocodilo.skill = {
  id: "crocodilo-emerald-surge",
  phase: "releasing",
  channelRemainingMs: 160,
  cooldownRemainingMs: 0,
  castElapsedMs: 80,
  projectedPosition: null,
  projectedLastMoveDirection: "right",
};
const releaseChoice = animationGame.getActiveSkillAnimationFrames(
  animationCrocodilo,
  "right",
  [castMarkerA, castMarkerB, castMarkerC, castMarkerD],
  [],
  [],
);
const usesReleaseCastTiming = releaseChoice?.frames?.length === 2
  && releaseChoice?.frames?.[0] === castMarkerC
  && releaseChoice?.frames?.[1] === castMarkerD
  && releaseChoice?.frameMs === Math.floor(CROCODILO_RELEASE_MS / 2)
  && releaseChoice?.playback === "hold";

const report = {
  channelElapsedMs,
  stayedFrozen,
  channelingObserved,
  enteredReleaseOnFullHold,
  finishedIntoCooldown,
  toxicTileKeys: [...toxicTileKeys],
  toxicCrossSpawned,
  surgeHitCloseEnemy,
  surgeMissedFarEnemy,
  surgeBrokeCrate,
  surgeTriggeredBomb,
  surgeKeptCasterSafe,
  stayedImmuneDuringChannel,
  canceledBeforeFire,
  usesChannelCastTiming,
  usesReleaseCastTiming,
  pass: stayedFrozen
    && channelingObserved
    && enteredReleaseOnFullHold
    && finishedIntoCooldown
    && toxicCrossSpawned
    && surgeHitCloseEnemy
    && surgeMissedFarEnemy
    && surgeBrokeCrate
    && surgeTriggeredBomb
    && surgeKeptCasterSafe
    && stayedImmuneDuringChannel
    && canceledBeforeFire
    && usesChannelCastTiming
    && usesReleaseCastTiming,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
