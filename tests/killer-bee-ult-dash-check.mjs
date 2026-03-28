Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};

const { GameApp } = await import("../output/esm/app/game-app.js");
const { TILE_SIZE } = await import("../output/esm/core/config.js");

const KILLER_BEE_DASH_DISTANCE_PX = TILE_SIZE * 3;

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
  players: { 1: emptyDirectionalSprites, 2: emptyDirectionalSprites },
  characterRoster: [
    { id: "6ee8baa5-3277-413b-ae0e-2659b9cc52e9", name: "Killer Bee", size: null, sprites: emptyDirectionalSprites, defaultSlot: 1 },
    { id: "dummy", name: "Dummy", size: null, sprites: emptyDirectionalSprites, defaultSlot: 2 },
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
  game.startServerAuthoritativeMatch([1, 2], characterSelections);
  game.arena.solid.clear();
  game.arena.breakable.clear();
  game.bombs = [];
  return game;
}

const neutralInput = {
  bombPressed: false,
  detonatePressed: false,
  skillPressed: false,
};

const game = createServerMatch({ 1: 0, 2: 1, 3: 0, 4: 1 });
const bee = game.players[1];
bee.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
bee.tile = { x: 4, y: 4 };
bee.spawnProtectionMs = 0;

const beforeX = bee.position.x;
game.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
});
game.advanceServerSimulation(17);

const firstStepX = bee.position.x;
const firstSkill = {
  ...bee.skill,
  projectedPosition: bee.skill.projectedPosition ? { ...bee.skill.projectedPosition } : null,
};

for (let elapsedMs = 17; elapsedMs < 1000 && bee.skill.phase === "channeling"; elapsedMs += 17) {
  game.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
  });
  game.advanceServerSimulation(17);
}

const finishX = bee.position.x;
const finishSkill = {
  ...bee.skill,
  projectedPosition: bee.skill.projectedPosition ? { ...bee.skill.projectedPosition } : null,
};

const blockedGame = createServerMatch({ 1: 0, 2: 1, 3: 0, 4: 1 });
const blockedBee = blockedGame.players[1];
blockedBee.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
blockedBee.tile = { x: 4, y: 4 };
blockedBee.spawnProtectionMs = 0;
blockedGame.arena.solid.add("6,4");
blockedGame.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
});
blockedGame.advanceServerSimulation(17);

for (let elapsedMs = 17; elapsedMs < 1000 && blockedBee.skill.phase === "channeling"; elapsedMs += 17) {
  blockedGame.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
  });
  blockedGame.advanceServerSimulation(17);
}

const blockedFinishX = blockedBee.position.x;
const blockedTile = { ...blockedBee.tile };

const dashStarted = firstSkill.phase === "channeling";
const dashMovedOnFirstFrame = firstStepX > beforeX + 1 && firstStepX < beforeX + KILLER_BEE_DASH_DISTANCE_PX - 1;
const dashReachedFullDistance = Math.abs(finishX - (beforeX + KILLER_BEE_DASH_DISTANCE_PX)) < 1.5;
const dashEndedInCooldown = finishSkill.phase === "cooldown";
const dashCooldownApplied = finishSkill.cooldownRemainingMs === 10_000;
const blockedByWall = blockedTile.x === 5 && blockedTile.y === 4 && blockedFinishX < beforeX + KILLER_BEE_DASH_DISTANCE_PX - 20;

const castMarker = { id: "bee-cast" };
const runMarker = { id: "bee-run" };
const animationSprites = {
  up: null,
  down: null,
  left: null,
  right: null,
  idle: { up: [], down: [], left: [], right: [] },
  walk: { up: [], down: [], left: [], right: [] },
  run: { up: [], down: [], left: [], right: [runMarker] },
  cast: { up: [], down: [], left: [], right: [castMarker] },
  attack: { up: [], down: [], left: [], right: [] },
  death: { up: [], down: [], left: [], right: [] },
};
const animationAssets = {
  ...assets,
  characterRoster: [
    { id: "6ee8baa5-3277-413b-ae0e-2659b9cc52e9", name: "Killer Bee", size: null, sprites: animationSprites, defaultSlot: 1 },
    { id: "dummy", name: "Dummy", size: null, sprites: emptyDirectionalSprites, defaultSlot: 2 },
  ],
};
const animationGame = new GameApp(root, animationAssets);
animationGame.startServerAuthoritativeMatch([1, 2], { 1: 0, 2: 1, 3: 0, 4: 1 });
const animationBee = animationGame.players[1];
animationBee.skill = {
  id: "killer-bee-wing-dash",
  phase: "channeling",
  channelRemainingMs: 100,
  cooldownRemainingMs: 0,
  castElapsedMs: 17,
  projectedPosition: null,
  projectedLastMoveDirection: "right",
};
const animationChoice = animationGame.getActiveSkillAnimationFrames(
  animationBee,
  "right",
  [castMarker],
  [runMarker],
  [],
);
const usesCustomDashAnimation = animationChoice?.frames?.[0] === castMarker
  && animationChoice?.frameMs === 60
  && animationChoice?.playback === "loop";

const report = {
  beforeX,
  firstStepX,
  finishX,
  finishSkill,
  blockedFinishX,
  blockedTile,
  dashStarted,
  dashMovedOnFirstFrame,
  dashReachedFullDistance,
  dashEndedInCooldown,
  dashCooldownApplied,
  blockedByWall,
  usesCustomDashAnimation,
  pass: dashStarted
    && dashMovedOnFirstFrame
    && dashReachedFullDistance
    && dashEndedInCooldown
    && dashCooldownApplied
    && blockedByWall
    && usesCustomDashAnimation,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
