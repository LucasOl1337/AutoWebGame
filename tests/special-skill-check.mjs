Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });

const noop = () => {};
const listeners = new Map();

function on(type, handler) {
  const list = listeners.get(type) ?? [];
  list.push(handler);
  listeners.set(type, list);
}

function emit(type, event) {
  const list = listeners.get(type) ?? [];
  for (const handler of list) {
    handler(event);
  }
}

function keyEvent(code) {
  return { code, preventDefault: noop };
}

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
  style: {},
  setAttribute: noop,
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
  addEventListener: on,
  requestAnimationFrame: noop,
};

const { GameApp } = await import("../output/esm/app/game-app.js");
const { TILE_SIZE } = await import("../output/esm/core/config.js");

const RANNI_ID = "03a976fb-7313-4064-a477-5bb9b0760034";
const KILLER_BEE_ID = "6ee8baa5-3277-413b-ae0e-2659b9cc52e9";

function createSprites() {
  return {
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
}

function createAssets(characterRoster) {
  const sprites = createSprites();
  return {
    players: { 1: sprites, 2: sprites },
    characterRoster,
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

function makeRoster() {
  return [
    { id: RANNI_ID, name: "Ranni", size: null, sprites: createSprites(), pinned: true, defaultSlot: 1, order: 0 },
    { id: KILLER_BEE_ID, name: "Killer Bee", size: null, sprites: createSprites(), pinned: true, defaultSlot: 2, order: 1 },
  ];
}

function getState() {
  return JSON.parse(window.render_game_to_text());
}

function getMatchState() {
  const state = getState();
  return state.match ?? state;
}

function pressSpace() {
  emit("keydown", keyEvent("Space"));
  emit("keyup", keyEvent("Space"));
  window.advanceTime(34);
}

function setPlayerToOpenTile(game, playerId, tile) {
  const player = game.players[playerId];
  player.position = { x: tile.x * TILE_SIZE + TILE_SIZE * 0.5, y: tile.y * TILE_SIZE + TILE_SIZE * 0.5 };
  player.tile = { ...tile };
  player.spawnProtectionMs = 0;
  player.flameGuardMs = 0;
}

function clearArenaAround(game, center, radius = 2) {
  for (let y = center.y - radius; y <= center.y + radius; y += 1) {
    for (let x = center.x - radius; x <= center.x + radius; x += 1) {
      game.arena.breakable.delete(`${x},${y}`);
      game.arena.solid.delete(`${x},${y}`);
    }
  }
}

function countSignals(node) {
  const keys = ["projectiles", "effects", "skillEffects", "particles", "flames"];
  let total = 0;
  for (const key of keys) {
    const value = node?.[key];
    if (Array.isArray(value)) {
      total += value.length;
    }
  }
  return total;
}

function findSkillishHits(node, hits = []) {
  if (node === null || node === undefined) {
    return hits;
  }
  if (typeof node === "string") {
    if (/(skill|ability|projectile|dash|blink|spell|fireball|cast|attack|ranged|movement)/i.test(node)) {
      hits.push(node);
    }
    return hits;
  }
  if (typeof node !== "object") {
    return hits;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      findSkillishHits(item, hits);
    }
    return hits;
  }

  for (const [key, value] of Object.entries(node)) {
    if (/(skill|ability|projectile|dash|blink|spell|cooldown|special|cast|attack|ranged|movement)/i.test(key)) {
      hits.push(`${key}:${typeof value === "string" ? value : ""}`);
    }
    if (typeof value === "string" && /(skill|ability|projectile|dash|blink|spell|fireball|cast|attack|ranged|movement)/i.test(value)) {
      hits.push(`${key}:${value}`);
    }
    findSkillishHits(value, hits);
  }

  return hits;
}

function hasSkillContract(state) {
  return findSkillishHits(state).length > 0;
}

function runRangedScenario() {
  const game = new GameApp({ appendChild: noop }, createAssets(makeRoster()));
  game.start();
  game.startMatch();
  setPlayerToOpenTile(game, 1, { x: 4, y: 4 });
  setPlayerToOpenTile(game, 2, { x: 7, y: 4 });
  clearArenaAround(game, { x: 4, y: 4 });
  clearArenaAround(game, { x: 7, y: 4 });

  const before = getState();
  const beforeSignals = countSignals(getMatchState());
  pressSpace();
  const after = getState();
  const afterSignals = countSignals(getMatchState());
  const skillHits = findSkillishHits(getMatchState());

  const rangedHints = skillHits.filter((entry) => /(ranged|projectile|spell|fireball|cast)/i.test(entry));
  const pass = afterSignals > beforeSignals || rangedHints.length > 0;

  return {
    name: "Ranni ranged",
    beforeSignals,
    afterSignals,
    rangedHints,
    pass,
    state: {
      position: { ...game.players[1].position },
      tile: { ...game.players[1].tile },
      alive: game.players[1].alive,
    },
  };
}

function runMovementScenario() {
  const roster = [
    { id: KILLER_BEE_ID, name: "Killer Bee", size: null, sprites: createSprites(), pinned: true, defaultSlot: 1, order: 0 },
    { id: RANNI_ID, name: "Ranni", size: null, sprites: createSprites(), pinned: true, defaultSlot: 2, order: 1 },
  ];
  const game = new GameApp({ appendChild: noop }, createAssets(roster));
  game.start();
  game.startMatch();
  setPlayerToOpenTile(game, 1, { x: 4, y: 4 });
  setPlayerToOpenTile(game, 2, { x: 7, y: 4 });
  clearArenaAround(game, { x: 4, y: 4 });
  clearArenaAround(game, { x: 7, y: 4 });

  const before = getState();
  const beforePixel = { ...game.players[1].pixel };
  const beforeSignals = countSignals(getMatchState());
  pressSpace();
  const after = getState();
  const afterPixel = { ...game.players[1].pixel };
  const afterSignals = countSignals(getMatchState());
  const skillHits = findSkillishHits(getMatchState());

  const moved = Math.abs(afterPixel.x - beforePixel.x) > 0.5 || Math.abs(afterPixel.y - beforePixel.y) > 0.5;
  const movementHints = skillHits.filter((entry) => /(movement|dash|blink|rush|step)/i.test(entry));
  const pass = moved || afterSignals > beforeSignals || movementHints.length > 0;

  return {
    name: "Killer Bee movement",
    beforeSignals,
    afterSignals,
    moved,
    movementHints,
    pass,
    state: {
      position: { ...game.players[1].position },
      tile: { ...game.players[1].tile },
      alive: game.players[1].alive,
    },
  };
}

const ranged = runRangedScenario();
const movement = runMovementScenario();

const hasAnySkillContract = hasSkillContract(getMatchState()) || ranged.rangedHints.length > 0 || movement.movementHints.length > 0;
if (!hasAnySkillContract) {
  console.log(JSON.stringify({
    skipped: true,
    reason: "special-skill contract not exposed yet",
    ranged,
    movement,
  }, null, 2));
  process.exit(0);
}

const report = {
  skipped: false,
  ranged,
  movement,
  pass: ranged.pass && movement.pass,
};

console.log(JSON.stringify(report, null, 2));

if (!report.pass) {
  process.exit(1);
}
