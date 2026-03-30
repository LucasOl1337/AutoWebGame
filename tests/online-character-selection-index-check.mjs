Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};

const { GameApp } = await import("../output/esm/app/game-app.js");
const { TILE_SIZE } = await import("../output/esm/core/config.js");

const CROCODILO_SELECTION_INDEX = 20;
const NICO_SELECTION_INDEX = 57;

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
    {
      id: "03a976fb-7313-4064-a477-5bb9b0760034",
      name: "Ranni",
      selectionIndex: 0,
      size: null,
      sprites: emptyDirectionalSprites,
    },
    {
      id: "6ee8baa5-3277-413b-ae0e-2659b9cc52e9",
      name: "Killer Bee",
      selectionIndex: 1,
      size: null,
      sprites: emptyDirectionalSprites,
    },
    {
      id: "d083c3dc-7162-4391-8628-6adde0b8d8d6",
      name: "Crocodilo Arcano",
      selectionIndex: CROCODILO_SELECTION_INDEX,
      size: null,
      sprites: emptyDirectionalSprites,
    },
    {
      id: "5474c45c-2987-43e0-af2c-a6500c836881",
      name: "Nico",
      selectionIndex: NICO_SELECTION_INDEX,
      size: null,
      sprites: emptyDirectionalSprites,
    },
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
game.startServerAuthoritativeMatch(
  [1, 2],
  {
    1: CROCODILO_SELECTION_INDEX,
    2: NICO_SELECTION_INDEX,
    3: 0,
    4: 1,
  },
);
game.arena.solid.clear();
game.arena.breakable.clear();
game.bombs = [];

const crocodilo = game.players[1];
const nico = game.players[2];

crocodilo.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
crocodilo.tile = { x: 4, y: 4 };
crocodilo.spawnProtectionMs = 0;

nico.position = { x: 6 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
nico.tile = { x: 6, y: 4 };
nico.spawnProtectionMs = 0;

game.setServerPlayerInput(1, {
  direction: "right",
  bombPressed: false,
  detonatePressed: false,
  skillPressed: true,
  skillHeld: true,
});
game.setServerPlayerInput(2, {
  direction: "right",
  bombPressed: false,
  detonatePressed: false,
  skillPressed: true,
  skillHeld: true,
});
game.advanceServerSimulation(17);

const report = {
  crocodiloSkill: { ...crocodilo.skill },
  nicoSkill: { ...nico.skill },
  crocodiloMappedCorrectly: crocodilo.skill.id === "crocodilo-emerald-surge" && crocodilo.skill.phase === "channeling",
  nicoMappedCorrectly: nico.skill.id === "nico-arcane-beam" && nico.skill.phase === "channeling",
};

report.pass = report.crocodiloMappedCorrectly && report.nicoMappedCorrectly;

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
