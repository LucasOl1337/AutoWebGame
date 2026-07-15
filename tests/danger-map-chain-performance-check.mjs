import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const { BOMB_FUSE_MS } = await import("../output/esm/PersonalConfig/config.js");
const {
  DANGER_FORECAST_BOMB_FUSE_BUFFER_MS,
  buildDangerMap,
  getBombBlastKeys,
} = await import("../output/esm/Engine/danger-map.js");

function createChainScenario(bombCount) {
  const arena = {
    config: { grid: { width: bombCount + 2, height: 3 } },
    solid: new Set(),
    breakable: new Set(),
  };
  const bombs = Array.from({ length: bombCount }, (_, index) => ({
    id: index + 1,
    ownerId: 1,
    tile: { x: index + 1, y: 1 },
    fuseMs: 100 + (bombCount - index) * 10,
    ownerCanPass: false,
    flameRange: 1,
  }));
  return {
    bombs,
    flames: [],
    arena,
    suddenDeathActive: false,
    suddenDeathTickMs: 0,
    suddenDeathIndex: 0,
    suddenDeathPath: [],
    suddenDeathClosureEffects: [],
  };
}

function buildLegacyDangerMap(context, extraBomb) {
  const projected = context.bombs
    .filter((bomb) => bomb.fuseMs <= BOMB_FUSE_MS + DANGER_FORECAST_BOMB_FUSE_BUFFER_MS)
    .map((bomb) => ({
      tile: bomb.tile,
      fuseMs: Math.max(0, bomb.fuseMs),
      blastKeys: getBombBlastKeys(bomb.tile, bomb.flameRange, context.arena),
    }));
  if (extraBomb) {
    projected.push({
      tile: extraBomb.tile,
      fuseMs: Math.max(0, extraBomb.fuseMs),
      blastKeys: getBombBlastKeys(extraBomb.tile, extraBomb.range, context.arena),
    });
  }

  let updated = true;
  while (updated) {
    updated = false;
    for (const source of projected) {
      for (const target of projected) {
        if (source === target || source.fuseMs >= target.fuseMs) continue;
        if (source.blastKeys.has(`${target.tile.x},${target.tile.y}`)) {
          target.fuseMs = source.fuseMs;
          updated = true;
        }
      }
    }
  }

  const danger = new Map();
  for (const bomb of projected) {
    for (const key of bomb.blastKeys) {
      const previous = danger.get(key);
      if (previous === undefined || bomb.fuseMs < previous) danger.set(key, bomb.fuseMs);
    }
  }
  return danger;
}

function normalize(map) {
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function benchmark(build, context, samples = 11) {
  for (let index = 0; index < 3; index += 1) build(context);
  const durations = [];
  for (let index = 0; index < samples; index += 1) {
    const startedAt = performance.now();
    build(context);
    durations.push(performance.now() - startedAt);
  }
  return {
    medianMs: median(durations),
    worstMs: Math.max(...durations),
  };
}

const gameplayPeak = createChainScenario(20);
const stress = createChainScenario(96);
const expectedGameplay = buildLegacyDangerMap(gameplayPeak);
const actualGameplay = buildDangerMap(gameplayPeak);
const expectedStress = buildLegacyDangerMap(stress);
const actualStress = buildDangerMap(stress);

assert.deepEqual(normalize(actualGameplay), normalize(expectedGameplay), "pico jogavel deve preservar ETAs da cadeia");
assert.deepEqual(normalize(actualStress), normalize(expectedStress), "stress deve preservar ETAs da cadeia");
assert.equal(actualGameplay.get("1,1"), 110, "a menor espoleta deve propagar por toda a corrente");
assert.equal(actualGameplay.get("20,1"), 110, "a bomba-fonte deve manter a menor ETA");

let randomState = 0x9e3779b9;
function random() {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 0x1_0000_0000;
}

const parityCases = 400;
for (let caseIndex = 0; caseIndex < parityCases; caseIndex += 1) {
  const width = 13;
  const height = 9;
  const bombCount = 2 + Math.floor(random() * 24);
  const context = {
    ...createChainScenario(1),
    arena: {
      config: { grid: { width, height } },
      solid: new Set(),
      breakable: new Set(),
    },
    bombs: Array.from({ length: bombCount }, (_, index) => ({
      id: index + 1,
      ownerId: (index % 4) + 1,
      tile: { x: 1 + Math.floor(random() * (width - 2)), y: 1 + Math.floor(random() * (height - 2)) },
      fuseMs: [120, 480, 480, 900, 1_500, 2_300, 3_700][Math.floor(random() * 7)],
      ownerCanPass: false,
      flameRange: 1 + Math.floor(random() * 4),
    })),
  };
  const extraBomb = caseIndex % 3 === 0
    ? {
        tile: { x: 1 + Math.floor(random() * (width - 2)), y: 1 + Math.floor(random() * (height - 2)) },
        fuseMs: [90, 480, 1_200][Math.floor(random() * 3)],
        range: 1 + Math.floor(random() * 4),
      }
    : undefined;
  assert.deepEqual(
    normalize(buildDangerMap(context, extraBomb)),
    normalize(buildLegacyDangerMap(context, extraBomb)),
    `paridade aleatoria falhou no caso ${caseIndex}`,
  );
}

const legacyGameplay = benchmark(buildLegacyDangerMap, gameplayPeak, 31);
const optimizedGameplay = benchmark(buildDangerMap, gameplayPeak, 31);
const legacyStress = benchmark(buildLegacyDangerMap, stress);
const optimizedStress = benchmark(buildDangerMap, stress);
const stressRatio = optimizedStress.medianMs / legacyStress.medianMs;

assert.ok(
  stressRatio < 0.4,
  `propagacao otimizada deve custar <40% da revarredura; observado ${(stressRatio * 100).toFixed(1)}%`,
);

console.log(JSON.stringify({
  pass: true,
  scenario: "corrente reversa de bombas adjacentes",
  gameplayPeakBombs: gameplayPeak.bombs.length,
  stressBombs: stress.bombs.length,
  parity: true,
  parityCases,
  gameplayPeak: {
    legacyMedianMs: Number(legacyGameplay.medianMs.toFixed(3)),
    optimizedMedianMs: Number(optimizedGameplay.medianMs.toFixed(3)),
  },
  stress: {
    legacyMedianMs: Number(legacyStress.medianMs.toFixed(3)),
    optimizedMedianMs: Number(optimizedStress.medianMs.toFixed(3)),
    improvementPercent: Number(((1 - stressRatio) * 100).toFixed(1)),
    legacyWorstMs: Number(legacyStress.worstMs.toFixed(3)),
    optimizedWorstMs: Number(optimizedStress.worstMs.toFixed(3)),
  },
}, null, 2));
