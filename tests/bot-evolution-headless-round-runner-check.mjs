import assert from "node:assert/strict";

const runner = await import("../output/esm/BotLab/headless-round-runner.js");
const {
  getRegisteredPolicyArtifactHash,
  getSnapshotTraceArtifactHash,
  runHeadlessRound,
  verifyRegisteredPolicyArtifact,
  verifySnapshotTraceArtifact,
} = runner;
const { createDefaultArenaDefinition } = await import("../output/esm/Arenas/arena.js");
const { sha256Canonical } = await import("../output/esm/Shared/canonical-json.js");

const neutralInput = Object.freeze({
  direction: null,
  bombPressed: false,
  detonatePressed: false,
  skillPressed: false,
  skillHeld: false,
});

// Frozen known-good hashes of the public GameApp initial semantic projection.
const BUILT_IN_INITIAL_STATE_HASH = "sha256:10654b73194f8d5c0e112c21b8500f42bc0f73d8fd281bbd2fb152ea5b1bed01";
const EXTERNAL_INITIAL_STATE_HASH = "sha256:7eb71c187818db60b231a3a19ddfad0b4dd8f0b47bd6b2c745ecb2f94cdc8628";

function createBuiltInConfig(overrides = {}) {
  return {
    build: "test-build",
    ruleset: "classic-v1",
    arena: createDefaultArenaDefinition(),
    randomness: {
      randomnessMode: "deterministic",
      expectedInitialStateHash: BUILT_IN_INITIAL_STATE_HASH,
    },
    activePlayerIds: [1, 2],
    policies: [
      { id: "built-in-1", playerId: 1, mode: "built-in" },
      { id: "built-in-2", playerId: 2, mode: "built-in" },
    ],
    maxSteps: 30_000,
    timeoutMs: 30_000,
    ...overrides,
  };
}

function createBuiltInRun() {
  return runHeadlessRound(createBuiltInConfig());
}

function createExternalConfig(policies, overrides = {}) {
  return {
    build: "test-build",
    ruleset: "classic-v1",
    arena: createDefaultArenaDefinition(),
    randomness: {
      randomnessMode: "deterministic",
      expectedInitialStateHash: EXTERNAL_INITIAL_STATE_HASH,
    },
    activePlayerIds: [1, 2],
    policies,
    maxSteps: 1,
    timeoutMs: 10_000,
    ...overrides,
  };
}

const first = await createBuiltInRun();
const repeated = await createBuiltInRun();

assert.equal(first.status, "complete");
assert.equal(first.termination, "round-outcome");
assert.equal(first.roundNumber, 1);
assert.ok(first.roundOutcome);
assert.equal(first.winner, first.roundOutcome.winner);
assert.equal(first.matchWinner, null);
assert.equal(first.terminalProof.valid, true);
assert.equal(first.terminalProof.checks.initialNonTerminal, true);
assert.equal(first.terminalProof.checks.freshRoundOutcome, true);
assert.equal(first.build, "test-build");
assert.equal(first.ruleset, "classic-v1");
assert.deepEqual(first.arena, {
  id: "default-live-arena",
  version: "default-v1",
  themeId: "tournament-clean",
});
assert.deepEqual(first.randomness, {
  randomnessMode: "deterministic",
  expectedInitialStateHash: BUILT_IN_INITIAL_STATE_HASH,
  effectiveInitialStateHash: BUILT_IN_INITIAL_STATE_HASH,
  requestedSeed: null,
  effectiveSeed: null,
  rngAlgorithm: null,
  rngVersion: null,
});
assert.equal(first.provenance.build.verified, false);
assert.equal(first.provenance.ruleset.verified, false);
assert.equal(first.provenance.arena.verified, true);
assert.equal(first.provenance.policies.verified, true);
assert.equal(first.reproducibility.status, "verified");
assert.equal(first.reproducibility.deterministicPolicyPath, true);
assert.equal(first.reproducibility.timeoutEnforced, true);
assert.deepEqual(first.reproducibility.reasons, []);

assert.equal(repeated.status, "complete");
assert.equal(repeated.winner, first.winner);
assert.equal(repeated.steps, first.steps);
assert.deepEqual(repeated.score, first.score);
assert.deepEqual(repeated.roundOutcome, first.roundOutcome);
assert.deepEqual(repeated.randomness, first.randomness);

const mismatched = await runHeadlessRound(createBuiltInConfig({
  randomness: {
    randomnessMode: "deterministic",
    expectedInitialStateHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  },
}));
assert.equal(mismatched.status, "error");
assert.equal(mismatched.steps, 0);
assert.equal(mismatched.reproducibility.status, "unverified");
assert.deepEqual(mismatched.reproducibility.reasons, ["randomness_mismatch"]);
assert.equal(mismatched.randomness.effectiveInitialStateHash, BUILT_IN_INITIAL_STATE_HASH);
assert.match(mismatched.error ?? "", /randomness_mismatch/);

const fakeSeeded = await runHeadlessRound(createBuiltInConfig({
  randomness: {
    randomnessMode: "seeded",
    requestedSeed: "seeded-run-v1",
    rngAlgorithm: "arena-seed-hash",
    rngVersion: "arena-runtime.v1",
    expectedInitialStateHash: `sha256:${"0".repeat(64)}`,
  },
}));
assert.equal(fakeSeeded.status, "error");
assert.equal(fakeSeeded.randomness.requestedSeed, "seeded-run-v1");
assert.equal(fakeSeeded.randomness.effectiveSeed, "seeded-run-v1");
assert.equal(fakeSeeded.randomness.rngAlgorithm, "arena-seed-hash");
assert.equal(fakeSeeded.randomness.rngVersion, "arena-runtime.v1");
assert.match(fakeSeeded.error ?? "", /randomness_mismatch/);

const legacySeed = await runHeadlessRound(createBuiltInConfig({
  seed: "must-not-be-accepted-as-applied",
  maxSteps: 1,
}));
assert.equal(legacySeed.status, "error");
assert.equal(legacySeed.randomness, null);
assert.match(legacySeed.error ?? "", /seed.*not supported/i);

const registeredMismatch = await runHeadlessRound(createBuiltInConfig({
  policies: [
    { id: "registered-1", playerId: 1, mode: "registered", scriptId: "neutral-v1", configHash: `sha256:${"0".repeat(64)}` },
    { id: "registered-2", playerId: 2, mode: "registered", scriptId: "neutral-v1", configHash: `sha256:${"0".repeat(64)}` },
  ],
}));
assert.equal(registeredMismatch.status, "error");
assert.equal(registeredMismatch.steps, 0);
assert.match(registeredMismatch.error ?? "", /registry\/config hash mismatch/i);

const neutralArtifactHash = await getRegisteredPolicyArtifactHash("neutral-v1");
await assert.rejects(
  verifyRegisteredPolicyArtifact("neutral-v1", `sha256:${"0".repeat(64)}`),
  /artifact hash mismatch/i,
);
const neutralConfigHash = "sha256:b00955e80fc35858f039a15c65863ea13f5273dc553a98ca34d69191715eaaf7";
const registeredArtifact = await runHeadlessRound(createBuiltInConfig({
  randomness: {
    randomnessMode: "deterministic",
    expectedInitialStateHash: `sha256:${"0".repeat(64)}`,
  },
  policies: [
    { id: "registered-1", playerId: 1, mode: "registered", scriptId: "neutral-v1", configHash: neutralConfigHash },
    { id: "registered-2", playerId: 2, mode: "registered", scriptId: "neutral-v1", configHash: neutralConfigHash },
  ],
}));
assert.equal(registeredArtifact.status, "error");
assert.equal(registeredArtifact.policies[0].scriptHash, neutralArtifactHash);
assert.equal(registeredArtifact.policies[0].configHash, neutralConfigHash);

const traceArtifactHash = await getSnapshotTraceArtifactHash();
assert.equal(traceArtifactHash, "sha256:75dc1674d467423bb26dd0aed6747798fda2ad908ad3687263ec7186eff234f3");
await verifySnapshotTraceArtifact(traceArtifactHash);
await assert.rejects(
  verifySnapshotTraceArtifact(`sha256:${"0".repeat(64)}`),
  /trace artifact hash mismatch/i,
);
const semanticallyMutatedTraceArtifactHash = await sha256Canonical({
  artifact: "snapshot-trace.v1",
  canonicalization: "strict-canonical-json.v1",
  digest: "sha256-webcrypto",
  projection: {
    step: "non-negative-simulation-step",
    players: "player-id-to-alive-and-integer-tile",
    powerUps: "type-tile-revealed-collected-in-runtime-order",
    suddenDeathActive: "boolean",
    suddenDeathClosedTiles: "sorted-tile-keys",
  },
});
assert.notEqual(semanticallyMutatedTraceArtifactHash, traceArtifactHash);
await assert.rejects(
  verifySnapshotTraceArtifact(semanticallyMutatedTraceArtifactHash),
  /trace artifact hash mismatch/i,
);

const sevenBySevenArena = {
  ...createDefaultArenaDefinition(),
  id: "waypoint-seven-by-seven",
  version: "waypoint-7x7-v1",
  grid: { width: 7, height: 7 },
  tiles: { solid: [], breakable: [] },
  spawns: [
    { playerId: 1, tile: { x: 3, y: 5 }, direction: "down" },
    { playerId: 2, tile: { x: 5, y: 1 }, direction: "left" },
    { playerId: 3, tile: { x: 1, y: 5 }, direction: "up" },
    { playerId: 4, tile: { x: 5, y: 5 }, direction: "up" },
  ],
};
const waypointScriptConfig = { route: [{ x: 3, y: 6 }], variant: 0 };
const waypointArtifactHash = await getRegisteredPolicyArtifactHash("waypoint-v1");
const waypointConfigHash = await sha256Canonical({
  scriptId: "waypoint-v1",
  scriptHash: waypointArtifactHash,
  scriptConfig: waypointScriptConfig,
});
const sevenBySevenBase = {
  build: "waypoint-grid-test",
  ruleset: "classic-v1",
  arena: sevenBySevenArena,
  activePlayerIds: [1, 2],
  policies: [
    { id: "waypoint-1", playerId: 1, mode: "registered", scriptId: "waypoint-v1", scriptConfig: waypointScriptConfig, configHash: waypointConfigHash },
    { id: "neutral-2", playerId: 2, mode: "registered", scriptId: "neutral-v1", configHash: neutralConfigHash },
  ],
  maxSteps: 120,
  timeoutMs: 10_000,
  traceMode: "snapshot-trace-v1",
};
const sevenBySevenProbe = await runHeadlessRound({
  ...sevenBySevenBase,
  randomness: { randomnessMode: "deterministic", expectedInitialStateHash: `sha256:${"0".repeat(64)}` },
});
assert.equal(sevenBySevenProbe.status, "error");
const sevenBySeven = await runHeadlessRound({
  ...sevenBySevenBase,
  randomness: {
    randomnessMode: "deterministic",
    expectedInitialStateHash: sevenBySevenProbe.randomness.effectiveInitialStateHash,
  },
});
assert.equal(sevenBySeven.status, "timeout");
assert.equal(sevenBySeven.arena.id, "waypoint-seven-by-seven");
assert.equal(sevenBySeven.trace.scriptHash, traceArtifactHash);
assert.ok(sevenBySeven.trace.entries.some((entry, index, entries) => (
  entry.players[1].tile.x === 3
  && entry.players[1].tile.y === 0
  && entries.slice(0, index).some((earlier) => earlier.players[1].tile.x === 3 && earlier.players[1].tile.y === 6)
)), "waypoint-v1 must derive the south portal edge from the 7x7 runtime grid");

const malformedUnicodeArena = createDefaultArenaDefinition();
malformedUnicodeArena.id = `broken-${String.fromCharCode(0xd800)}`;
const malformedUnicode = await runHeadlessRound(createBuiltInConfig({ arena: malformedUnicodeArena }));
assert.equal(malformedUnicode.status, "error");
assert.match(malformedUnicode.error ?? "", /unicode.*surrogate/i);

const malformed = await runHeadlessRound({});
assert.equal(malformed.status, "error");
assert.equal(malformed.termination, "error");
assert.equal(malformed.build, null);
assert.equal(malformed.arena, null);
assert.match(malformed.error ?? "", /config|build|policies|activePlayerIds/i);

let deniedCalls = 0;
const denied = await runHeadlessRound(createExternalConfig([
    { id: "external-1", playerId: 1, mode: "external", decide: () => { deniedCalls += 1; return neutralInput; } },
    { id: "external-2", playerId: 2, mode: "external", decide: () => neutralInput },
  ]));
assert.equal(denied.status, "error");
assert.equal(deniedCalls, 0);
assert.match(denied.error ?? "", /allowUnsafeInlineExternalPolicies/);

let observationWasFrozen = false;
let observerSawPlayerTwoAlive = null;
let hiddenPolicyCalls = 0;
const mutableArena = createDefaultArenaDefinition();
const mutableConfig = createExternalConfig([], {
  build: "original-build",
  ruleset: "original-ruleset",
  arena: mutableArena,
  allowUnsafeInlineExternalPolicies: true,
});
mutableConfig.policies.push(
  {
    id: "mutator",
    playerId: 1,
    mode: "external",
    decide: ({ snapshot }) => {
      observationWasFrozen = Object.isFrozen(snapshot)
        && Object.isFrozen(snapshot.players)
        && Object.isFrozen(snapshot.players[2]);
      try {
        snapshot.players[2].alive = false;
      } catch {
        // Frozen policy observations reject cross-policy contamination.
      }
      mutableConfig.build = "mutated-build";
      mutableConfig.ruleset = "mutated-ruleset";
      mutableArena.version = "mutated-version";
      mutableConfig.policies.push({
        id: "hidden-after-validation",
        playerId: 1,
        mode: "external",
        decide: () => { hiddenPolicyCalls += 1; return neutralInput; },
      });
      return neutralInput;
    },
  },
  {
    id: "observer",
    playerId: 2,
    mode: "external",
    decide: ({ snapshot }) => {
      observerSawPlayerTwoAlive = snapshot.players[2].alive;
      return neutralInput;
    },
  },
);

const unsafeInline = await runHeadlessRound({
  ...mutableConfig,
  randomness: {
    randomnessMode: "deterministic",
    expectedInitialStateHash: EXTERNAL_INITIAL_STATE_HASH,
  },
});
assert.equal(unsafeInline.status, "timeout");
assert.equal(unsafeInline.termination, "max-steps");
assert.equal(unsafeInline.build, "original-build");
assert.equal(unsafeInline.ruleset, "original-ruleset");
assert.equal(unsafeInline.arena.version, "default-v1");
assert.equal(unsafeInline.randomness.requestedSeed, null);
assert.equal(hiddenPolicyCalls, 0);
assert.equal(observationWasFrozen, true);
assert.equal(observerSawPlayerTwoAlive, true);
assert.equal(unsafeInline.reproducibility.status, "unverified");
assert.equal(unsafeInline.reproducibility.deterministicPolicyPath, false);
assert.equal(unsafeInline.reproducibility.timeoutEnforced, false);
assert.equal(unsafeInline.provenance.policies.verified, false);
assert.ok(unsafeInline.limitations.some((item) => item.includes("synchronous")));

const failed = await runHeadlessRound(createExternalConfig([
    { id: "broken-policy", playerId: 1, mode: "external", decide: () => { throw new Error("policy exploded"); } },
    { id: "neutral-2", playerId: 2, mode: "external", decide: () => neutralInput },
  ], {
  allowUnsafeInlineExternalPolicies: true,
  maxSteps: 3,
}));
assert.equal(failed.status, "error");
assert.equal(failed.steps, 0);
assert.match(failed.error ?? "", /policy exploded/);

console.log(JSON.stringify({
  complete: {
    status: first.status,
    winner: first.winner,
    steps: first.steps,
    roundNumber: first.roundNumber,
    roundOutcome: first.roundOutcome,
  },
  repeat: {
    sameWinner: repeated.winner === first.winner,
    sameSteps: repeated.steps === first.steps,
    sameScore: JSON.stringify(repeated.score) === JSON.stringify(first.score),
  },
  malformed: { status: malformed.status, error: malformed.error },
  mismatch: {
    status: mismatched.status,
    effectiveInitialStateHash: mismatched.randomness.effectiveInitialStateHash,
  },
  unsafeInline: {
    status: unsafeInline.status,
    timeoutEnforced: unsafeInline.reproducibility.timeoutEnforced,
    observationWasFrozen,
  },
  pass: true,
}, null, 2));
