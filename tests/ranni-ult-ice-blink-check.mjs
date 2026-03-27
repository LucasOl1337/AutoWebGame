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

const game = new GameApp(root, assets);
game.startServerAuthoritativeMatch([1, 2], { 1: 0, 2: 1, 3: 0, 4: 1 });
game.arena.solid.clear();
game.arena.breakable.clear();
game.bombs = [];

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

for (let elapsed = 0; elapsed < 1900; elapsed += 17) {
  game.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
  });
  game.advanceServerSimulation(17);
}

const midX = p1.position.x;
const midSkill = { ...p1.skill };

for (let elapsed = 0; elapsed < 250; elapsed += 17) {
  game.setServerPlayerInput(1, {
    direction: "right",
    ...neutralInput,
  });
  game.advanceServerSimulation(17);
}

const afterX = p1.position.x;
const afterSkill = { ...p1.skill };

const frozenInPlace = Math.abs(midX - beforeX) < 1.5;
const projectedMovedDuringChannel = Boolean(midSkill.projectedPosition)
  && Math.abs(midSkill.projectedPosition.x - beforeX) > 30;
const teleportedAfterChannel = Math.abs(afterX - beforeX) > 30;
const channelingPhaseObserved = midSkill.phase === "channeling";
const cooldownPhaseObserved = afterSkill.phase === "cooldown";

const report = {
  beforeX,
  midX,
  afterX,
  beforeSkill,
  midSkill,
  afterSkill,
  frozenInPlace,
  projectedMovedDuringChannel,
  teleportedAfterChannel,
  channelingPhaseObserved,
  cooldownPhaseObserved,
  pass: frozenInPlace
    && projectedMovedDuringChannel
    && teleportedAfterChannel
    && channelingPhaseObserved
    && cooldownPhaseObserved,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
