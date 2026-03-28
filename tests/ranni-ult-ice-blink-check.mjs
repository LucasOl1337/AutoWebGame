Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};

const { GameApp } = await import("../output/esm/app/game-app.js");
const { TILE_SIZE } = await import("../output/esm/core/config.js");

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
};

const root = { appendChild: noop };
const assets = {
  players: { 1: emptyDirectionalSprites, 2: emptyDirectionalSprites },
  characterRoster: [
    { id: "03a976fb-7313-4064-a477-5bb9b0760034", name: "Ranni", size: null, sprites: emptyDirectionalSprites, defaultSlot: 1 },
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

const game = createServerMatch({ 1: 0, 2: 1, 3: 0, 4: 1 });

const p1 = game.players[1];
p1.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
p1.tile = { x: 4, y: 4 };
p1.spawnProtectionMs = 0;

const neutralInput = {
  bombPressed: false,
  detonatePressed: false,
  skillPressed: false,
};

const beforeX = p1.position.x;
const beforeSkill = { ...p1.skill };

game.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
});
game.advanceServerSimulation(17);

let channelElapsedMs = 17;
let midSnapshot = null;
for (; channelElapsedMs < 2500 && p1.skill.phase === "channeling"; channelElapsedMs += 17) {
  game.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
  });
  game.advanceServerSimulation(17);
  if (channelElapsedMs >= Math.floor(2000 / 2) && !midSnapshot) {
    midSnapshot = {
      midX: p1.position.x,
      midSkill: {
        ...p1.skill,
        projectedPosition: p1.skill.projectedPosition ? { ...p1.skill.projectedPosition } : null,
      },
    };
  }
}

const midX = midSnapshot?.midX ?? p1.position.x;
const midSkill = midSnapshot?.midSkill ?? {
  ...p1.skill,
  projectedPosition: p1.skill.projectedPosition ? { ...p1.skill.projectedPosition } : null,
};
const finishX = p1.position.x;
const finishSkill = {
  ...p1.skill,
  projectedPosition: p1.skill.projectedPosition ? { ...p1.skill.projectedPosition } : null,
};

const runnerGame = createServerMatch({ 1: 1, 2: 1, 3: 1, 4: 1 });
const runner = runnerGame.players[1];
runner.position = { x: beforeX, y: p1.position.y };
runner.tile = { x: 4, y: 4 };
runner.spawnProtectionMs = 0;
for (let elapsed = 0; elapsed < channelElapsedMs; elapsed += 17) {
  runnerGame.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
  });
  runnerGame.advanceServerSimulation(17);
}
const expectedFinishX = runner.position.x;

const frozenInPlace = Math.abs(midX - beforeX) < 1.5;
const projectedMovedDuringChannel = Boolean(midSkill.projectedPosition)
  && Math.abs(midSkill.projectedPosition.x - beforeX) > 30;
const teleportedAfterChannel = Math.abs(finishX - beforeX) > 30;
const teleportedToProjectedTrack = Math.abs(finishX - expectedFinishX) < 1.5;
const channelingPhaseObserved = midSkill.phase === "channeling";
const cooldownPhaseObserved = finishSkill.phase === "cooldown";

const immunityGame = createServerMatch({ 1: 0, 2: 1, 3: 0, 4: 1 });
const immuneRanni = immunityGame.players[1];
immuneRanni.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
immuneRanni.tile = { x: 4, y: 4 };
immuneRanni.spawnProtectionMs = 0;
immunityGame.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
});
immunityGame.advanceServerSimulation(17);
immunityGame.flames = [{ tile: { x: 4, y: 4 }, remainingMs: 2_000 }];
for (let elapsed = 0; elapsed < 500; elapsed += 17) {
  immunityGame.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
  });
  immunityGame.advanceServerSimulation(17);
}
const immuneDuringChannel = immuneRanni.alive && immuneRanni.skill.phase === "channeling";

const report = {
  beforeX,
  midX,
  finishX,
  expectedFinishX,
  channelElapsedMs,
  beforeSkill,
  midSkill,
  finishSkill,
  frozenInPlace,
  projectedMovedDuringChannel,
  teleportedAfterChannel,
  teleportedToProjectedTrack,
  channelingPhaseObserved,
  cooldownPhaseObserved,
  immuneDuringChannel,
  pass: frozenInPlace
    && projectedMovedDuringChannel
    && teleportedAfterChannel
    && teleportedToProjectedTrack
    && channelingPhaseObserved
    && cooldownPhaseObserved
    && immuneDuringChannel
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
