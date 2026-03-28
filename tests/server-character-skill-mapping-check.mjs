Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};

const { GameApp } = await import("../output/esm/app/game-app.js");
const { CHARACTER_ROSTER_MANIFEST } = await import("../output/esm/core/character-roster-manifest.js");
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
  death: { up: [], down: [], left: [], right: [] },
};

const root = { appendChild: noop };

function createWorkerStyleAssets() {
  return {
    players: {
      1: emptyDirectionalSprites,
      2: emptyDirectionalSprites,
      3: emptyDirectionalSprites,
      4: emptyDirectionalSprites,
    },
    characterRoster: CHARACTER_ROSTER_MANIFEST.map((entry) => ({
      ...entry,
      size: null,
      sprites: emptyDirectionalSprites,
    })),
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
}

function createServerGame() {
  const game = new GameApp(root, createWorkerStyleAssets());
  game.startServerAuthoritativeMatch([1, 2, 3], { 1: 0, 2: 1, 3: 56, 4: 0 });
  game.arena.solid.clear();
  game.arena.breakable.clear();
  game.bombs = [];
  return game;
}

const neutralInput = {
  bombPressed: false,
  detonatePressed: false,
  skillPressed: false,
  skillHeld: false,
};

const game = createServerGame();
const ranni = game.players[1];
const bee = game.players[2];
const nico = game.players[3];

ranni.position = { x: 4 * TILE_SIZE + TILE_SIZE * 0.5, y: 4 * TILE_SIZE + TILE_SIZE * 0.5 };
ranni.tile = { x: 4, y: 4 };
ranni.spawnProtectionMs = 0;

bee.position = { x: 5 * TILE_SIZE + TILE_SIZE * 0.5, y: 5 * TILE_SIZE + TILE_SIZE * 0.5 };
bee.tile = { x: 5, y: 5 };
bee.spawnProtectionMs = 0;

nico.position = { x: 6 * TILE_SIZE + TILE_SIZE * 0.5, y: 6 * TILE_SIZE + TILE_SIZE * 0.5 };
nico.tile = { x: 6, y: 6 };
nico.spawnProtectionMs = 0;

game.setServerPlayerInput(1, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
});
game.setServerPlayerInput(2, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
});
game.setServerPlayerInput(3, {
  direction: "right",
  ...neutralInput,
  skillPressed: true,
  skillHeld: true,
});
game.advanceServerSimulation(17);

const report = {
  ranniSkill: { ...ranni.skill },
  beeSkill: { ...bee.skill },
  nicoSkill: { ...nico.skill },
  ranniStarted: ranni.skill.id === "ranni-ice-blink" && ranni.skill.phase === "channeling",
  beeStarted: bee.skill.id === "killer-bee-wing-dash" && bee.skill.phase === "channeling",
  nicoStarted: nico.skill.id === "nico-arcane-beam" && nico.skill.phase === "channeling",
};

report.pass = report.ranniStarted && report.beeStarted && report.nicoStarted;

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
