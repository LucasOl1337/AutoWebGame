Object.defineProperty(globalThis, "navigator", { value: { webdriver: true }, configurable: true });

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

const { performance } = await import("node:perf_hooks");
const { GameApp } = await import("../output/esm/Engine/game-app.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");
const { getPowerUpPriorityScore } = await import("../output/esm/Gameplay/powerups.js");

const root = { appendChild: noop };
const assets = {
  players: { 1: { up: null, down: null, left: null, right: null }, 2: { up: null, down: null, left: null, right: null } },
  floor: { base: null, lane: null, spawn: null },
  props: { wall: null, crate: null, bomb: null, flame: null },
  powerUps: { "remote-up": null, "short-fuse-up": null },
};

function setPlayerTile(player, tile) {
  player.position = {
    x: tile.x * TILE_SIZE + TILE_SIZE * 0.5,
    y: tile.y * TILE_SIZE + TILE_SIZE * 0.5,
  };
  player.tile = { ...tile };
}

function setPickupChoice(game) {
  for (const powerUp of game.arena.powerUps) {
    powerUp.collected = true;
    powerUp.revealed = false;
  }
  game.arena.powerUps.push(
    { type: "remote-up", tile: { x: 4, y: 3 }, revealed: true, collected: false },
    { type: "short-fuse-up", tile: { x: 4, y: 5 }, revealed: true, collected: false },
  );
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

export function runBotRemoteControlGameAppScenario() {
  const game = new GameApp(root, assets);
  game.startMatch();
  game.flames = [];
  game.bombs = [];
  game.arena.breakable = new Set();

  const bot = game.players[2];
  const enemy = game.players[1];
  setPlayerTile(bot, { x: 4, y: 4 });
  setPlayerTile(enemy, { x: 8, y: 7 });
  bot.remoteLevel = 0;
  bot.shortFuseLevel = 0;
  setPickupChoice(game);

  const samples = 100;
  const directionCounts = { up: 0, down: 0, other: 0 };
  const timings = [];
  for (let index = 0; index < samples; index += 1) {
    setPlayerTile(bot, { x: 4, y: 4 });
    const startedAt = performance.now();
    const decision = game.getBotDecision(bot);
    timings.push(performance.now() - startedAt);
    if (decision.direction === "up") directionCounts.up += 1;
    else if (decision.direction === "down") directionCounts.down += 1;
    else directionCounts.other += 1;
  }

  bot.remoteLevel = 1;
  bot.shortFuseLevel = 0;
  setPlayerTile(bot, { x: 4, y: 4 });
  const saturatedRemoteDecision = game.getBotDecision(bot);

  bot.remoteLevel = 0;
  bot.shortFuseLevel = 2;
  setPlayerTile(bot, { x: 4, y: 4 });
  const saturatedShortFuseDecision = game.getBotDecision(bot);

  const remoteScore = getPowerUpPriorityScore({ ...bot, remoteLevel: 0, shortFuseLevel: 0 }, "remote-up");
  const shortFuseScore = getPowerUpPriorityScore({ ...bot, remoteLevel: 0, shortFuseLevel: 0 }, "short-fuse-up");
  const saturatedRemoteScore = getPowerUpPriorityScore({ ...bot, remoteLevel: 1 }, "remote-up");
  const saturatedShortFuseScore = getPowerUpPriorityScore({ ...bot, shortFuseLevel: 2 }, "short-fuse-up");
  const ignoresSaturatedRemote = saturatedRemoteDecision.direction === "down";
  const ignoresSaturatedShortFuse = saturatedShortFuseDecision.direction === "up";

  return {
    samples,
    controller: "deterministic",
    remoteScore,
    shortFuseScore,
    directionCounts,
    medianDecisionMs: percentile(timings, 0.5),
    p95DecisionMs: percentile(timings, 0.95),
    saturatedRemoteDecision,
    saturatedShortFuseDecision,
    saturatedRemoteScore,
    saturatedShortFuseScore,
    ignoresSaturatedRemote,
    ignoresSaturatedShortFuse,
    pass: directionCounts.up === samples
      && directionCounts.down === 0
      && saturatedRemoteScore === 0
      && saturatedShortFuseScore === 0
      && ignoresSaturatedRemote
      && ignoresSaturatedShortFuse,
  };
}
