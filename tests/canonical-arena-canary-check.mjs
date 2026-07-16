import assert from "node:assert/strict";

const catalog = await import("../output/esm/Arenas/canonical-arena-catalog.js");
const canary = await import("../output/esm/Arenas/canonical-arena-canary.js");
const arenaRuntime = await import("../output/esm/Arenas/arena.js");
const ref = catalog.listPublishedArenaMaps()[0];

const baseArena = catalog.toArenaDefinition(catalog.getCanonicalArenaMap());
const dropsForSeed = (seed) => arenaRuntime.createArena({ ...baseArena, randomSeed: seed }).powerUps
  .map((drop) => `${drop.type}:${drop.tile.x},${drop.tile.y}`)
  .sort();
assert.deepEqual(dropsForSeed("seed-a"), dropsForSeed("seed-a"));
assert.notDeepEqual(dropsForSeed("seed-a"), dropsForSeed("seed-b"));
assert.deepEqual(
  arenaRuntime.createArena(baseArena).powerUps.map((drop) => `${drop.type}:${drop.tile.x},${drop.tile.y}`).sort(),
  dropsForSeed(baseArena.version),
  "omitting randomSeed must preserve the legacy version-derived drop distribution",
);
assert.equal(catalog.getCanonicalArenaMap().contentHash, ref.contentHash);

for (const [field, value] of [
  ["latestCentralContestMs", Number.NaN],
  ["maxCentralOccupancyRatio", 1.01],
  ["maxCentralDominanceMs", -1],
  ["minimumRouteEdges", 1.5],
  ["minimumEliminationSectors", 6],
  ["minimumPortalUsage", -1],
]) {
  const thresholds = {
    latestCentralContestMs: 90_000,
    maxCentralOccupancyRatio: 0.35,
    maxCentralDominanceMs: 20_000,
    minimumRouteEdges: 20,
    minimumEliminationSectors: 2,
    minimumPortalUsage: 1,
    [field]: value,
  };
  await assert.rejects(
    canary.runArenaCanary(ref, {
      roundCount: 4,
      maxStepsPerRound: 30_000,
      timeoutMsPerRound: 30_000,
      thresholds,
    }),
    new RegExp(field),
  );
}

for (const [field, value] of [
  ["latestCentralContestMs", 90_001],
  ["maxCentralOccupancyRatio", 0.351],
  ["maxCentralDominanceMs", 20_001],
  ["minimumRouteEdges", 19],
  ["minimumEliminationSectors", 1],
  ["minimumPortalUsage", 0],
]) {
  const thresholds = {
    latestCentralContestMs: 90_000,
    maxCentralOccupancyRatio: 0.35,
    maxCentralDominanceMs: 20_000,
    minimumRouteEdges: 20,
    minimumEliminationSectors: 2,
    minimumPortalUsage: 1,
    [field]: value,
  };
  await assert.rejects(
    canary.runArenaCanary(ref, {
      roundCount: 4,
      maxStepsPerRound: 30_000,
      timeoutMsPerRound: 30_000,
      thresholds,
    }),
    new RegExp(field),
  );
}

const evidence = await canary.runArenaCanary(ref, {
  roundCount: 4,
  maxStepsPerRound: 30_000,
  timeoutMsPerRound: 30_000,
  thresholds: {
    latestCentralContestMs: 90_000,
    maxCentralOccupancyRatio: 0.35,
    maxCentralDominanceMs: 20_000,
    minimumRouteEdges: 20,
    minimumEliminationSectors: 2,
    minimumPortalUsage: 1,
  },
});
assert.equal(evidence.map.contentHash, ref.contentHash);
assert.equal(evidence.publicationVerification.ok, true);
assert.equal(evidence.terminalRound.status, "complete");
assert.equal(evidence.terminalRound.terminalProof.valid, true);
assert.equal(evidence.terminalRound.reproducibility.status, "verified");
for (const randomness of [
  evidence.terminalRound.randomness,
  evidence.deterministicRuntime.suddenDeath.receipt.randomness,
]) {
  assert.equal(randomness.randomnessMode, "seeded");
  assert.equal(randomness.requestedSeed, randomness.effectiveSeed);
  assert.equal(randomness.rngAlgorithm, "arena-seed-hash");
  assert.equal(randomness.rngVersion, "arena-runtime.v1");
}
assert.equal(evidence.deterministicRuntime.suddenDeath.receipt.status, "complete");
assert.equal(evidence.deterministicRuntime.suddenDeath.receipt.reproducibility.status, "verified");
assert.equal(evidence.deterministicRuntime.suddenDeath.observation.activeObserved, true);
assert.ok(evidence.deterministicRuntime.suddenDeath.observation.maximumClosedTiles > 0);
assert.deepEqual(evidence.deterministicRuntime.dropsBySector, {
  "north-west": 1,
  "north-east": 1,
  "south-west": 2,
  "south-east": 2,
  center: 2,
});
const deterministicObservation = evidence.deterministicRuntime.suddenDeath.observation;
const mapDefinition = catalog.getCanonicalArenaMap();
const independentSpiral = [];
for (let left = 0, right = mapDefinition.layout.grid.width - 1, top = 0, bottom = mapDefinition.layout.grid.height - 1;
  left <= right && top <= bottom;
  left += 1, right -= 1, top += 1, bottom -= 1) {
  for (let x = left; x <= right; x += 1) independentSpiral.push(`${x},${top}`);
  for (let y = top + 1; y <= bottom; y += 1) independentSpiral.push(`${right},${y}`);
  if (bottom > top) for (let x = right - 1; x >= left; x -= 1) independentSpiral.push(`${x},${bottom}`);
  if (right > left) for (let y = bottom - 1; y > top; y -= 1) independentSpiral.push(`${left},${y}`);
}
const independentlyLegalPath = independentSpiral.filter((key) => !mapDefinition.layout.solid.includes(key));
assert.deepEqual(deterministicObservation.expectedPath, independentlyLegalPath);
assert.deepEqual(
  deterministicObservation.closedSequence,
  independentlyLegalPath.slice(0, deterministicObservation.closedSequence.length),
);
assert.equal(new Set(deterministicObservation.closedSequence).size, deterministicObservation.closedSequence.length);
assert.equal(evidence.deterministicRuntime.suddenDeath.repeatability.status, "verified");
assert.equal(
  evidence.deterministicRuntime.suddenDeath.repeatability.traceHash,
  evidence.deterministicRuntime.suddenDeath.repeatability.repeatedTraceHash,
);
const deterministicGateBase = {
  expectedSuddenDeathPath: deterministicObservation.expectedPath,
  observedSuddenDeathSequence: deterministicObservation.closedSequence,
  grid: mapDefinition.layout.grid,
  solidTiles: mapDefinition.layout.solid,
};
const missingEvidenceGate = canary.evaluateArenaDeterministicEvidence({
  roundStatus: "complete",
  reproducibilityStatus: "verified",
  activeObserved: false,
  maximumClosedTiles: 0,
  expectedSpawns: catalog.getCanonicalArenaMap().layout.spawns,
  observedSpawns: deterministicObservation.initialSpawns,
  dropTiles: [],
  ...deterministicGateBase,
});
assert.ok(missingEvidenceGate.blockers.includes("sudden-death-not-observed"));
assert.ok(missingEvidenceGate.blockers.includes("drop-distribution-unfair"));
const asymmetricDropGate = canary.evaluateArenaDeterministicEvidence({
  roundStatus: "complete",
  reproducibilityStatus: "verified",
  activeObserved: true,
  maximumClosedTiles: 1,
  expectedSpawns: catalog.getCanonicalArenaMap().layout.spawns,
  observedSpawns: deterministicObservation.initialSpawns,
  dropTiles: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }],
  ...deterministicGateBase,
});
assert.ok(asymmetricDropGate.blockers.includes("drop-distribution-unfair"));
const wrongPathGate = canary.evaluateArenaDeterministicEvidence({
  roundStatus: "complete",
  reproducibilityStatus: "verified",
  activeObserved: true,
  maximumClosedTiles: 1,
  expectedSpawns: mapDefinition.layout.spawns,
  observedSpawns: deterministicObservation.initialSpawns,
  dropTiles: deterministicObservation.initialDrops.map((drop) => drop.tile),
  ...deterministicGateBase,
  observedSuddenDeathSequence: [deterministicObservation.expectedPath[1]],
});
assert.ok(wrongPathGate.blockers.includes("sudden-death-path-mismatch"));
assert.equal(evidence.playtest.rounds.length, 4);
assert.equal(evidence.playtest.rounds.every((round) => round.receipt.status === "complete"), true);
assert.equal(evidence.playtest.rounds.every((round) => round.metrics.centralContest.firstMs !== null), true);
assert.equal(new Set(evidence.playtest.rounds.map((round) => round.cell.cellHash)).size, 4);
assert.equal(new Set(evidence.playtest.rounds.map((round) => JSON.stringify(round.cell.route))).size, 4);
assert.equal(new Set(evidence.playtest.rounds.map((round) => round.receipt.randomness.effectiveInitialStateHash)).size, 4);
assert.equal(new Set(evidence.playtest.rounds.map((round) => round.cell.policy.configHash)).size, 4);
assert.equal(new Set(evidence.playtest.rounds.map((round) => round.trajectoryHash)).size, 4);
assert.equal(evidence.playtest.rounds.every((round) => round.receipt.reproducibility.status === "verified"), true);
assert.equal(evidence.playtest.rounds.every((round) => round.repeatability.status === "verified"), true);
assert.equal(evidence.playtest.rounds.every((round) => (
  round.receipt.trace?.scriptId === "snapshot-trace-v1"
  && /^sha256:[0-9a-f]{64}$/.test(round.receipt.trace.scriptHash)
  && round.receipt.trace.entries.length > 1
  && round.receipt.policies.some((policy) => (
    policy.mode === "registered"
    && policy.scriptId === "waypoint-v1"
    && policy.scriptHash === evidence.deterministicRuntime.registeredScripts.waypoint
    && policy.configHash === round.cell.policy.configHash
  ))
)), true);
assert.equal(evidence.playtest.rounds.every((round) => (
  round.receipt.randomness.randomnessMode === "seeded"
  && round.receipt.randomness.requestedSeed === round.receipt.randomness.effectiveSeed
  && round.receipt.randomness.rngAlgorithm === "arena-seed-hash"
  && round.receipt.randomness.rngVersion === "arena-runtime.v1"
)), true);
assert.equal(evidence.playtest.metrics.centralContest.firstMs !== null, true);
assert.ok(evidence.playtest.metrics.centralOccupancy.ratio <= 0.35);
assert.ok(evidence.playtest.metrics.centralDominance.maxSustainedMs <= 20_000);
assert.equal(
  evidence.playtest.metrics.centralDominance.ratio,
  evidence.playtest.metrics.centralDominance.exclusiveControlSteps
    / evidence.playtest.metrics.centralDominance.eligibleControlSteps,
);
assert.ok(evidence.playtest.metrics.centralDominance.exclusiveControlSteps > 0);
assert.ok(evidence.playtest.metrics.centralDominance.eligibleControlSteps > evidence.playtest.metrics.centralDominance.exclusiveControlSteps);
assert.ok(evidence.playtest.metrics.routeVariety.uniqueEdges >= 20);
assert.equal(evidence.playtest.metrics.routeVariety.uniqueEdges, 54);
assert.deepEqual(evidence.playtest.rounds.map((round) => round.metrics.routeVariety.uniqueEdges), [30, 40, 34, 52]);
assert.equal(Object.values(evidence.playtest.metrics.routeVariety.perPlayerUniqueEdges).every((count) => (
  count > 0 && count <= evidence.playtest.metrics.routeVariety.uniqueEdges
)), true);
assert.ok(Object.values(evidence.playtest.metrics.eliminationsBySector).reduce((sum, value) => sum + value, 0) >= 4);
assert.ok(evidence.playtest.metrics.portalUsage > 0);
assert.equal(evidence.playtest.metrics.portalUsage, 5);
assert.ok(evidence.playtest.metrics.drops.revealed > 0);
assert.equal(evidence.verdict, "publish");
assert.deepEqual(evidence.blockers, []);

console.log(JSON.stringify({
  pass: true,
  map: evidence.map,
  terminal: {
    status: evidence.terminalRound.status,
    steps: evidence.terminalRound.steps,
    winner: evidence.terminalRound.winner,
    initialStateHash: evidence.terminalRound.randomness.effectiveInitialStateHash,
  },
  cells: evidence.playtest.rounds.map((round) => ({
    id: round.cell.id,
    cellHash: round.cell.cellHash,
    trajectoryHash: round.trajectoryHash,
    steps: round.receipt.steps,
    winner: round.receipt.winner,
    metrics: round.metrics,
  })),
  aggregate: evidence.playtest.metrics,
  thresholds: evidence.thresholds,
  verdict: evidence.verdict,
  blockers: evidence.blockers,
  repeatability: true,
}, null, 2));
