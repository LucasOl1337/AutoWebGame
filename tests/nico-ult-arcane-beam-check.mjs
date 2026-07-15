Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { updateNicoArcaneBeamChannel } = await import("../output/esm/Characters/CustomMechanics/nico-skill.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");

const NICO_CHANNEL_MS = 2_000;
const NICO_RELEASE_MS = 260;
const NICO_COOLDOWN_MS = 8_000;
const NICO_VOLUNTARY_CANCEL_COOLDOWN_MS = 600;

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
    { id: "5474c45c-2987-43e0-af2c-a6500c836881", name: "Nico", size: null, sprites: emptyDirectionalSprites, defaultSlot: 1 },
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
  game.startServerAuthoritativeMatch([1, 2, 3, 4], characterSelections);
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
const nico = game.players[1];
const frontEnemy = game.players[2];
const diagonalEnemy = game.players[3];
const farEnemy = game.players[4];

nico.position = { x: 2 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
nico.tile = { x: 2, y: 4 };
nico.spawnProtectionMs = 0;

frontEnemy.position = { x: 7 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
frontEnemy.tile = { x: 7, y: 4 };
frontEnemy.spawnProtectionMs = 0;

diagonalEnemy.position = { x: 5 * TILE_SIZE + TILE_SIZE * 0.5, y: 5 * TILE_SIZE + TILE_SIZE * 0.5 };
diagonalEnemy.tile = { x: 5, y: 5 };
diagonalEnemy.spawnProtectionMs = 0;

farEnemy.position = { x: 10 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
farEnemy.tile = { x: 10, y: 4 };
farEnemy.spawnProtectionMs = 0;

game.arena.breakable.add("5,4");
game.bombs.push({
  id: 1,
  ownerId: 2,
  tile: { x: 8, y: 4 },
  fuseMs: 9000,
  ownerCanPass: false,
  flameRange: 1,
});

game.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
  skillHeld: true,
});
game.advanceServerSimulation(17);

const channelStartX = nico.position.x;
let midSnapshot = null;
let channelElapsedMs = 17;

for (; channelElapsedMs < 2600 && nico.skill.phase === "channeling"; channelElapsedMs += 17) {
  game.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
    skillHeld: true,
  });
  game.advanceServerSimulation(17);
  if (channelElapsedMs >= Math.floor(NICO_CHANNEL_MS / 2) && !midSnapshot) {
    midSnapshot = {
      x: nico.position.x,
      skill: { ...nico.skill },
    };
  }
}

const afterFireSkill = { ...nico.skill };
const activeBlast = game.magicBeams[0] ?? null;
const blastTileKeys = new Set((activeBlast?.tiles ?? []).map((tile) => `${tile.x},${tile.y}`));
const blastBomb = game.bombs[0] ?? null;

for (let elapsedMs = 0; elapsedMs < 800 && nico.skill.phase === "releasing"; elapsedMs += 17) {
  game.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
  });
  game.advanceServerSimulation(17);
}

const afterReleaseSkill = { ...nico.skill };

const stayedFrozen = Math.abs((midSnapshot?.x ?? nico.position.x) - channelStartX) < 1.5;
const channelingObserved = midSnapshot?.skill?.phase === "channeling";
const enteredReleaseOnFullHold = afterFireSkill.phase === "releasing"
  && afterFireSkill.channelRemainingMs > 0
  && afterFireSkill.cooldownRemainingMs === 0;
const finishedIntoCooldown = afterReleaseSkill.phase === "cooldown"
  && afterReleaseSkill.cooldownRemainingMs === NICO_COOLDOWN_MS;
const blastSpawned = Boolean(activeBlast) && activeBlast.direction === "right";
const blastFrontEnemy = frontEnemy.alive === false;
const blastDiagonalEnemy = diagonalEnemy.alive === true;
const blastMissedFarEnemy = farEnemy.alive === true;
const blastBrokeCrate = game.arena.breakable.has("5,4") === false;
const blastTriggeredBomb = blastBomb?.fuseMs === 0 || game.bombs.length === 0;
const blastMatchesFootprint = [
  "3,4",
  "4,4",
  "5,4",
  "6,4",
  "7,4",
  "8,4",
].every((key) => blastTileKeys.has(key))
  && blastTileKeys.has("5,5") === false
  && blastTileKeys.has("9,4") === false;

const cancelGame = createServerMatch({ 1: 0, 2: 1, 3: 2, 4: 0 });
const cancelNico = cancelGame.players[1];
const cancelEnemy = cancelGame.players[2];
cancelNico.position = { x: 2 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
cancelNico.tile = { x: 2, y: 4 };
cancelNico.spawnProtectionMs = 0;
cancelEnemy.position = { x: 7 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
cancelEnemy.tile = { x: 7, y: 4 };
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

const canceledBeforeFire = cancelNico.skill.phase === "cooldown"
  && cancelNico.skill.cooldownRemainingMs === NICO_VOLUNTARY_CANCEL_COOLDOWN_MS
  && cancelNico.skill.channelRemainingMs === 0
  && cancelNico.skill.castElapsedMs === 0
  && cancelGame.magicBeams.length === 0
  && cancelEnemy.alive === true;

const largeArenaGame = createServerMatch({ 1: 0, 2: 1, 3: 2, 4: 0 });
largeArenaGame.arena.config.grid = { width: 15, height: 13 };
largeArenaGame.arena.solid.add("14,10");
const largeArenaNico = largeArenaGame.players[1];
const largeArenaEnemy = largeArenaGame.players[2];

largeArenaNico.position = { x: 12 * TILE_SIZE + TILE_SIZE * 0.5, y: 10 * TILE_SIZE + TILE_SIZE * 0.5 };
largeArenaNico.tile = { x: 12, y: 10 };
largeArenaNico.spawnProtectionMs = 0;
largeArenaEnemy.position = { x: 13 * TILE_SIZE + TILE_SIZE * 0.5, y: 10 * TILE_SIZE + TILE_SIZE * 0.5 };
largeArenaEnemy.tile = { x: 13, y: 10 };
largeArenaEnemy.spawnProtectionMs = 0;

largeArenaGame.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
  skillHeld: true,
});
largeArenaGame.advanceServerSimulation(17);
for (let elapsedMs = 17; elapsedMs < 2_600 && largeArenaNico.skill.phase === "channeling"; elapsedMs += 17) {
  largeArenaGame.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
    skillHeld: true,
  });
  largeArenaGame.advanceServerSimulation(17);
}

const largeArenaBeam = largeArenaGame.magicBeams[0] ?? null;
const largeArenaBeamTileKeys = new Set(
  (largeArenaBeam?.tiles ?? []).map((tile) => `${tile.x},${tile.y}`),
);
const largeArenaBeamUsesRuntimeBounds = largeArenaBeamTileKeys.has("13,10")
  && largeArenaBeamTileKeys.size === 1
  && largeArenaEnemy.alive === false;

const tallArenaGame = createServerMatch({ 1: 0, 2: 1, 3: 2, 4: 0 });
tallArenaGame.arena.config.grid = { width: 15, height: 13 };
tallArenaGame.arena.solid.add("12,12");
const tallArenaNico = tallArenaGame.players[1];
const tallArenaEnemy = tallArenaGame.players[2];

tallArenaNico.position = { x: 12 * TILE_SIZE + TILE_SIZE * 0.5, y: 10 * TILE_SIZE + TILE_SIZE * 0.5 };
tallArenaNico.tile = { x: 12, y: 10 };
tallArenaNico.spawnProtectionMs = 0;
tallArenaEnemy.position = { x: 12 * TILE_SIZE + TILE_SIZE * 0.5, y: 11 * TILE_SIZE + TILE_SIZE * 0.5 };
tallArenaEnemy.tile = { x: 12, y: 11 };
tallArenaEnemy.spawnProtectionMs = 0;

tallArenaGame.setServerPlayerInput(1, {
  direction: "down",
  ...neutralInput,
  skillPressed: true,
  skillHeld: true,
});
tallArenaGame.advanceServerSimulation(17);
for (let elapsedMs = 17; elapsedMs < 2_600 && tallArenaNico.skill.phase === "channeling"; elapsedMs += 17) {
  tallArenaGame.setServerPlayerInput(1, {
    direction: "down",
    ...neutralInput,
    skillHeld: true,
  });
  tallArenaGame.advanceServerSimulation(17);
}

const tallArenaBeam = tallArenaGame.magicBeams[0] ?? null;
const tallArenaBeamTileKeys = new Set(
  (tallArenaBeam?.tiles ?? []).map((tile) => `${tile.x},${tile.y}`),
);
const tallArenaBeamUsesRuntimeBounds = tallArenaBeamTileKeys.has("12,11")
  && tallArenaBeamTileKeys.size === 1
  && tallArenaEnemy.alive === false;

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
    { id: "5474c45c-2987-43e0-af2c-a6500c836881", name: "Nico", size: null, sprites: animationSprites, defaultSlot: 1 },
    { id: "dummy-a", name: "Dummy A", size: null, sprites: emptyDirectionalSprites, defaultSlot: 2 },
    { id: "dummy-b", name: "Dummy B", size: null, sprites: emptyDirectionalSprites, defaultSlot: 3 },
  ],
};
const animationGame = new GameApp(root, animationAssets);
animationGame.startServerAuthoritativeMatch([1, 2], { 1: 0, 2: 1, 3: 2, 4: 0 });
const animationNico = animationGame.players[1];
animationNico.skill = {
  id: "nico-arcane-beam",
  phase: "channeling",
  channelRemainingMs: 1_400,
  cooldownRemainingMs: 0,
  castElapsedMs: 600,
  projectedPosition: null,
  projectedLastMoveDirection: "right",
};
const animationChoice = animationGame.getActiveSkillAnimationFrames(
  animationNico,
  "right",
  [castMarkerA, castMarkerB, castMarkerC, castMarkerD],
  [],
  [],
);
const usesChannelCastTiming = animationChoice?.frames?.length === 3
  && animationChoice?.frames?.[0] === castMarkerA
  && animationChoice?.frames?.[2] === castMarkerC
  && animationChoice?.frameMs === Math.floor(NICO_CHANNEL_MS / 3)
  && animationChoice?.playback === "hold";

animationNico.skill = {
  id: "nico-arcane-beam",
  phase: "releasing",
  channelRemainingMs: 180,
  cooldownRemainingMs: 0,
  castElapsedMs: 80,
  projectedPosition: null,
  projectedLastMoveDirection: "right",
};
const releaseChoice = animationGame.getActiveSkillAnimationFrames(
  animationNico,
  "right",
  [castMarkerA, castMarkerB, castMarkerC, castMarkerD],
  [],
  [],
);
const usesReleaseCastTiming = releaseChoice?.frames?.length === 2
  && releaseChoice?.frames?.[0] === castMarkerC
  && releaseChoice?.frames?.[1] === castMarkerD
  && releaseChoice?.frameMs === Math.floor(NICO_RELEASE_MS / 2)
  && releaseChoice?.playback === "hold";

const invalidDeltaValues = [0, -17, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
const invalidDeltaSnapshots = [];
let invalidDeltaNoop = true;

for (const phase of ["channeling", "releasing"]) {
  for (const deltaMs of invalidDeltaValues) {
    const invalidDeltaGame = createServerMatch({ 1: 0, 2: 1, 3: 2, 4: 0 });
    const invalidDeltaNico = invalidDeltaGame.players[1];
    invalidDeltaNico.velocity = { x: 37, y: -19 };
    invalidDeltaNico.skill = {
      id: "nico-arcane-beam",
      phase,
      channelRemainingMs: phase === "channeling" ? 1_400 : 180,
      cooldownRemainingMs: 0,
      castElapsedMs: phase === "channeling" ? 600 : 80,
      projectedPosition: null,
      projectedLastMoveDirection: "right",
    };
    const beforeSkill = { ...invalidDeltaNico.skill };
    const beforeVelocity = { ...invalidDeltaNico.velocity };
    const handled = updateNicoArcaneBeamChannel(
      invalidDeltaNico,
      null,
      true,
      deltaMs,
      invalidDeltaGame.createSkillContext(),
    );
    const scenarioPass = handled
      && invalidDeltaNico.skill.phase === beforeSkill.phase
      && invalidDeltaNico.skill.channelRemainingMs === beforeSkill.channelRemainingMs
      && invalidDeltaNico.skill.cooldownRemainingMs === beforeSkill.cooldownRemainingMs
      && invalidDeltaNico.skill.castElapsedMs === beforeSkill.castElapsedMs
      && invalidDeltaGame.magicBeams.length === 0
      && invalidDeltaNico.velocity.x === beforeVelocity.x
      && invalidDeltaNico.velocity.y === beforeVelocity.y;
    invalidDeltaNoop = invalidDeltaNoop && scenarioPass;
    invalidDeltaSnapshots.push({
      phase,
      deltaMs: String(deltaMs),
      handled,
      scenarioPass,
      skill: { ...invalidDeltaNico.skill },
      beamCount: invalidDeltaGame.magicBeams.length,
      velocity: { ...invalidDeltaNico.velocity },
    });
  }
}

const report = {
  channelElapsedMs,
  stayedFrozen,
  channelingObserved,
  enteredReleaseOnFullHold,
  finishedIntoCooldown,
  blastSpawned,
  blastTileKeys: [...blastTileKeys],
  blastFrontEnemy,
  blastDiagonalEnemy,
  blastMissedFarEnemy,
  blastBrokeCrate,
  blastTriggeredBomb,
  blastMatchesFootprint,
  largeArenaBeamTileKeys: [...largeArenaBeamTileKeys],
  largeArenaBeamUsesRuntimeBounds,
  tallArenaBeamTileKeys: [...tallArenaBeamTileKeys],
  tallArenaBeamUsesRuntimeBounds,
  canceledBeforeFire,
  invalidDeltaNoop,
  invalidDeltaSnapshots,
  usesChannelCastTiming,
  usesReleaseCastTiming,
  pass: stayedFrozen
    && channelingObserved
    && enteredReleaseOnFullHold
    && finishedIntoCooldown
    && blastSpawned
    && blastFrontEnemy
    && blastDiagonalEnemy
    && blastMissedFarEnemy
    && blastBrokeCrate
    && blastTriggeredBomb
    && blastMatchesFootprint
    && largeArenaBeamUsesRuntimeBounds
    && tallArenaBeamUsesRuntimeBounds
    && canceledBeforeFire
    && invalidDeltaNoop
    && usesChannelCastTiming
    && usesReleaseCastTiming,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
