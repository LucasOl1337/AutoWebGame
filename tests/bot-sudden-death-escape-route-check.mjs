Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });
Object.defineProperty(globalThis, "HTMLElement", { value: class HTMLElement {}, configurable: true });

const noop = () => {};
const fakeCtx = {
  imageSmoothingEnabled: false,
  clearRect: noop,
  fillRect: noop,
  strokeRect: noop,
  beginPath: noop,
  moveTo: noop,
  lineTo: noop,
  closePath: noop,
  fill: noop,
  stroke: noop,
  arc: noop,
  ellipse: noop,
  drawImage: noop,
  fillText: noop,
  strokeText: noop,
  save: noop,
  restore: noop,
  setTransform: noop,
  translate: noop,
  scale: noop,
  createLinearGradient: () => ({ addColorStop: noop }),
  createRadialGradient: () => ({ addColorStop: noop }),
};
const fakeCanvas = {
  width: 0,
  height: 0,
  dataset: {},
  style: {},
  setAttribute: noop,
  closest: () => null,
  getContext: () => fakeCtx,
  requestFullscreen: async () => {},
};
globalThis.document = {
  fullscreenElement: null,
  createElement: () => fakeCanvas,
  exitFullscreen: async () => {},
};
globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  addEventListener: noop,
  requestAnimationFrame: noop,
};

const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { tileKey } = await import("../output/esm/Arenas/arena.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");
const { SUDDEN_DEATH_LAB_EVIDENCE: evidence } = await import("../output/esm/UiLayouts/sudden-death-lab-evidence.js");

const emptySprites = {
  up: null,
  down: null,
  left: null,
  right: null,
  idle: { up: [], down: [], left: [], right: [] },
  walk: { up: [], down: [], left: [], right: [] },
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
    "short-fuse-up": null,
    "bomb-pass-up": null,
    "kick-up": null,
  },
};

const setPlayerTile = (player, tile) => {
  player.position = {
    x: tile.x * TILE_SIZE + TILE_SIZE * 0.5,
    y: tile.y * TILE_SIZE + TILE_SIZE * 0.5,
  };
  player.tile = { ...tile };
};

function runScenario(guided) {
  const game = new GameApp(root, assets);
  game.startMatch();
  game.arena.breakable = new Set();
  game.arena.powerUps = [];
  game.bombs = [];
  game.flames = [];
  game.suddenDeathActive = true;
  game.suddenDeathIndex = 48;
  game.suddenDeathTickMs = 850;
  game.suddenDeathClosureEffects = [];
  game.suddenDeathClosedTiles = new Set();
  for (const tile of game.suddenDeathPath.slice(0, 48)) {
    const key = tileKey(tile.x, tile.y);
    game.arena.solid.add(key);
    game.suddenDeathClosedTiles.add(key);
  }

  const bot = game.players[2];
  const human = game.players[1];
  setPlayerTile(bot, game.suddenDeathPath[49]);
  setPlayerTile(human, { x: 2, y: 4 });
  bot.spawnProtectionMs = 0;
  human.spawnProtectionMs = 999_999;
  bot.lastMoveDirection = null;
  game.botCommittedDirection[2] = null;
  game.roundTimeMs = 30_000;

  const realDecision = game.getBotDecision.bind(game);
  const decisions = [];
  game.getBotDecision = (player) => {
    const decision = guided && player.id === 2
      ? player.tile.x === 3 && player.tile.y === 2
        ? { direction: "left", placeBomb: false }
        : player.tile.x === 2 && player.tile.y === 2
          ? { direction: "down", placeBomb: false }
          : { direction: null, placeBomb: false }
      : realDecision(player);
    if (player.id === 2) decisions.push(decision.direction);
    return decision;
  };

  const initialDecision = game.getBotDecision(bot);
  const routeFixtureMatches = game.suddenDeathPath[48].x === 2
    && game.suddenDeathPath[48].y === 2
    && game.suddenDeathPath[49].x === 3
    && game.suddenDeathPath[49].y === 2
    && game.suddenDeathPath[63].x === 2
    && game.suddenDeathPath[63].y === 3;
  let deadAtMs = null;
  let destinationReachedAtMs = null;
  for (let frame = 0; frame < 180; frame += 1) {
    game.updateMatch(1000 / 60);
    if (destinationReachedAtMs === null && bot.tile.x === 2 && bot.tile.y === 3) {
      destinationReachedAtMs = Math.round((frame + 1) * 1000 / 60);
    }
    if (!bot.alive) {
      deadAtMs = Math.round((frame + 1) * 1000 / 60);
      break;
    }
  }
  const nonNullPulses = decisions.filter((direction) => direction !== null);
  return {
    alive: bot.alive,
    initialDirection: initialDecision.direction,
    endTile: { ...bot.tile },
    deadAtMs,
    destinationReachedAtMs,
    nonNullDecisionCount: nonNullPulses.length,
    abortedEscape: !bot.alive || bot.tile.x === 3,
    routeFixtureMatches,
  };
}

const policyRuns = Array.from({ length: 3 }, () => runScenario(false));
const guidedRuns = Array.from({ length: 3 }, () => runScenario(true));
const policySurvival = policyRuns.filter((run) => run.alive).length;
const guidedSurvival = guidedRuns.filter((run) => run.alive).length;
const pass = policySurvival === evidence.after.survivalCount
  && policyRuns.length === evidence.sampleSize
  && policyRuns.every((run) => run.initialDirection === evidence.after.initialDirection)
  && policyRuns.every((run) => run.endTile.x === 2 && run.endTile.y === 3)
  && policyRuns.every((run) => run.destinationReachedAtMs === evidence.after.destinationReachedAtMs)
  && policyRuns.every((run) => !run.abortedEscape)
  && policyRuns.every((run) => run.routeFixtureMatches)
  && guidedSurvival === evidence.after.survivalCount;

console.log(JSON.stringify({
  scenario: "transient tile before safe sudden-death destination",
  route: "(3,2) -> left (2,2) -> down (2,3)",
  closingTileEtaMs: 850,
  policySurvival: `${policySurvival}/3`,
  guidedSurvival: `${guidedSurvival}/3`,
  policyRuns,
  guidedRuns,
  evidenceLinked: true,
  pass,
}, null, 2));

if (!pass) process.exit(1);
