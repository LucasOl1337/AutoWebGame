Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

const noop = () => {};

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { CHARACTER_ROSTER_MANIFEST } = await import("../output/esm/Characters/Animations/character-roster-manifest.js");

const RANNI_ID = "03a976fb-7313-4064-a477-5bb9b0760034";
const KILLER_BEE_ID = "6ee8baa5-3277-413b-ae0e-2659b9cc52e9";

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

const assets = {
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
    "short-fuse-up": null,
  },
};

const characterIndexById = new Map(
  CHARACTER_ROSTER_MANIFEST.map((entry, index) => [entry.id, index]),
);
const ranniIndex = characterIndexById.get(RANNI_ID);
const killerBeeIndex = characterIndexById.get(KILLER_BEE_ID);
if (ranniIndex === undefined || killerBeeIndex === undefined) {
  throw new Error("Expected channeling characters are missing from the roster.");
}

const neutralInput = {
  direction: null,
  bombPressed: false,
  detonatePressed: false,
  skillPressed: false,
  skillHeld: false,
};

function createAuthoritativeGame(options = {}) {
  const game = new GameApp({ appendChild: noop }, assets);
  game.startServerAuthoritativeMatch(
    [1, 2],
    {
      1: ranniIndex,
      2: killerBeeIndex,
    },
    options,
  );
  game.arena.solid.clear();
  game.arena.breakable.clear();
  game.bombs = [];
  return game;
}

const simultaneousGame = createAuthoritativeGame();
simultaneousGame.setServerPlayerInput(1, {
  ...neutralInput,
  direction: "right",
  bombPressed: true,
  skillPressed: true,
  skillHeld: true,
});
simultaneousGame.advanceServerSimulation(17);

const channelGame = createAuthoritativeGame();
channelGame.setServerPlayerInput(1, {
  ...neutralInput,
  direction: "right",
  skillPressed: true,
  skillHeld: true,
});
channelGame.advanceServerSimulation(17);
const channelStartedBeforeBombPress = channelGame.players[1].skill.phase === "channeling";
channelGame.setServerPlayerInput(1, {
  ...neutralInput,
  direction: "right",
  bombPressed: true,
  skillHeld: true,
});
channelGame.advanceServerSimulation(17);

const predictionGame = createAuthoritativeGame();
predictionGame.applyPredictedInputStep(
  predictionGame.players[1],
  {
    ...neutralInput,
    direction: "right",
    bombPressed: true,
    skillPressed: true,
    skillHeld: true,
  },
  17,
);

const idleGame = createAuthoritativeGame();
idleGame.setServerPlayerInput(1, {
  ...neutralInput,
  bombPressed: true,
});
idleGame.advanceServerSimulation(17);

const botGame = createAuthoritativeGame({ botPlayerIds: [1] });
botGame.getBotDecision = () => ({
  direction: null,
  placeBomb: true,
  detonate: false,
});
botGame.advanceServerSimulation(17);

const checks = {
  simultaneousSkillStarted: simultaneousGame.players[1].skill.phase === "channeling",
  simultaneousBombBlocked: simultaneousGame.bombs.length === 0,
  channelStartedBeforeBombPress,
  existingChannelPreserved: channelGame.players[1].skill.phase === "channeling",
  existingChannelBombBlocked: channelGame.bombs.length === 0,
  predictionSkillStarted: predictionGame.players[1].skill.phase === "channeling",
  predictionBombBlocked: predictionGame.bombs.length === 0,
  idleBombStillPlaced: idleGame.bombs.length === 1 && idleGame.players[1].activeBombs === 1,
  botBombStillPlaced: botGame.bombs.length === 1 && botGame.players[1].activeBombs === 1,
  botCooldownStillArmed: botGame.botBombCooldownMs > 0,
};
const failedChecks = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const report = {
  simultaneous: {
    phase: simultaneousGame.players[1].skill.phase,
    bombs: simultaneousGame.bombs.length,
  },
  existingChannel: {
    phase: channelGame.players[1].skill.phase,
    bombs: channelGame.bombs.length,
  },
  prediction: {
    phase: predictionGame.players[1].skill.phase,
    bombs: predictionGame.bombs.length,
  },
  idle: {
    bombs: idleGame.bombs.length,
    activeBombs: idleGame.players[1].activeBombs,
  },
  bot: {
    bombs: botGame.bombs.length,
    activeBombs: botGame.players[1].activeBombs,
    cooldownMs: botGame.botBombCooldownMs,
  },
  checks,
  failedChecks,
  pass: failedChecks.length === 0,
};

console.log(JSON.stringify(report, null, 2));
console.log(`SKILL_CHANNEL_BOMB_GUARD ${Object.keys(checks).length - failedChecks.length}/${Object.keys(checks).length} pass=${report.pass}`);

if (!report.pass) {
  process.exit(1);
}
