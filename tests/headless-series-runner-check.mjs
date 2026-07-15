import assert from "node:assert/strict";

const { runHeadlessSeries } = await import("../output/esm/BotLab/headless-series-runner.js");
const { runHeadlessRound } = await import("../output/esm/BotLab/headless-round-runner.js");
const { createDefaultArenaDefinition } = await import("../output/esm/Arenas/arena.js");

const INITIAL_STATE_HASH = "sha256:10654b73194f8d5c0e112c21b8500f42bc0f73d8fd281bbd2fb152ea5b1bed01";

function createRound(id) {
  const arena = createDefaultArenaDefinition();
  return {
    id,
    build: "series-check-build",
    ruleset: "classic-v1",
    arena,
    randomness: {
      requestedSeed: null,
      expectedInitialStateHash: INITIAL_STATE_HASH,
    },
    spawnPlan: [
      { playerId: 1, spawnIndex: 0 },
      { playerId: 2, spawnIndex: 1 },
    ],
    activePlayerIds: [1, 2],
    policies: [
      { id: `${id}-bot-1`, playerId: 1, mode: "built-in" },
      { id: `${id}-bot-2`, playerId: 2, mode: "built-in" },
    ],
    maxSteps: 30_000,
    timeoutMs: 30_000,
  };
}

function createSeries(rounds) {
  return {
    id: "series-complete-check",
    rounds,
    limits: {
      maxRounds: 4,
      maxTotalSteps: 120_000,
      timeoutMs: 60_000,
    },
    control: {
      pause: "between-rounds",
      cancellation: "between-rounds",
    },
  };
}

function toRoundConfig(round) {
  return {
    build: round.build,
    ruleset: round.ruleset,
    arena: round.arena,
    randomness: {
      randomnessMode: "deterministic",
      expectedInitialStateHash: round.randomness.expectedInitialStateHash,
    },
    activePlayerIds: round.activePlayerIds,
    policies: round.policies,
    maxSteps: round.maxSteps,
    timeoutMs: round.timeoutMs,
  };
}

let yieldedBoundaries = 0;
const execution = runHeadlessSeries(createSeries([
  createRound("round-1"),
  createRound("round-2"),
]), {
  yieldControl: async () => {
    yieldedBoundaries += 1;
  },
});
let finalCancellationRequested = false;
const unsubscribeFinalCancellation = execution.subscribe((snapshot) => {
  if (!finalCancellationRequested && snapshot.completedRounds === 2 && snapshot.phase === "running") {
    finalCancellationRequested = true;
    execution.dispatch("cancel");
  }
});
const receipt = await execution.result;
unsubscribeFinalCancellation();

assert.equal(receipt.status, "complete");
assert.equal(receipt.termination, "all-rounds-complete");
assert.equal(receipt.completedRounds, 2);
assert.equal(receipt.rounds.length, 2);
assert.ok(receipt.rounds.every((round) => round.receipt.status === "complete"));
assert.equal(execution.getSnapshot().phase, "complete");
assert.equal(yieldedBoundaries, 1);

const direct = await runHeadlessRound(toRoundConfig(createRound("direct-equivalence")));
assert.deepEqual(
  {
    status: receipt.rounds[0].receipt.status,
    winner: receipt.rounds[0].receipt.winner,
    steps: receipt.rounds[0].receipt.steps,
    score: receipt.rounds[0].receipt.score,
    randomness: receipt.rounds[0].receipt.randomness,
  },
  {
    status: direct.status,
    winner: direct.winner,
    steps: direct.steps,
    score: direct.score,
    randomness: direct.randomness,
  },
);

const cancelledExecution = runHeadlessSeries(createSeries([
  createRound("cancel-round-1"),
  createRound("cancel-round-2"),
  createRound("cancel-round-3"),
]));
const cancelSnapshots = [];
const unsubscribeCancel = cancelledExecution.subscribe((snapshot) => {
  cancelSnapshots.push(snapshot);
  if (snapshot.completedRounds === 1 && snapshot.phase === "running") {
    cancelledExecution.dispatch("cancel");
  }
});
const cancelled = await cancelledExecution.result;
unsubscribeCancel();

assert.equal(cancelled.status, "cancelled-partial");
assert.equal(cancelled.termination, "cancelled");
assert.equal(cancelled.completedRounds, 1);
assert.equal(cancelled.rounds.length, 1);
assert.equal(cancelledExecution.getSnapshot().phase, "cancelled-partial");
assert.ok(cancelSnapshots.some((snapshot) => snapshot.phase === "cancel-requested"));

const pausedExecution = runHeadlessSeries(createSeries([
  createRound("pause-round-1"),
  createRound("pause-round-2"),
]));
const pausePhases = [];
const pauseRevisions = [];
let pauseIssued = false;
const unsubscribePause = pausedExecution.subscribe((snapshot) => {
  pausePhases.push(snapshot.phase);
  pauseRevisions.push(snapshot.revision);
  if (!pauseIssued && snapshot.completedRounds === 1 && snapshot.phase === "running") {
    pauseIssued = true;
    pausedExecution.dispatch("pause");
  } else if (snapshot.phase === "paused") {
    pausedExecution.dispatch("resume");
  }
});
const paused = await pausedExecution.result;
unsubscribePause();

assert.equal(paused.status, "complete");
assert.deepEqual(
  pausePhases.filter((phase) => phase === "pause-requested" || phase === "paused"),
  ["pause-requested", "paused"],
);
assert.equal(pausedExecution.getSnapshot().phase, "complete");
assert.ok(pauseRevisions.every((revision, index) => index === 0 || revision > pauseRevisions[index - 1]));

const budgetSpec = createSeries([
  createRound("budget-round-1"),
  createRound("budget-round-2"),
]);
budgetSpec.limits.maxTotalSteps = 5_000;
const budgetExecution = runHeadlessSeries(budgetSpec);
const budgeted = await budgetExecution.result;

assert.equal(budgeted.status, "failed-partial");
assert.equal(budgeted.termination, "series-budget");
assert.equal(budgeted.completedRounds, 1);
assert.equal(budgeted.totalSteps, 5_000);
assert.equal(budgeted.rounds.length, 2);
assert.equal(budgeted.rounds[0].receipt.status, "complete");
assert.equal(budgeted.rounds[1].receipt.status, "timeout");
assert.equal(budgeted.error, "series_tick_budget_exhausted");

const timeoutClock = [0, 0, 60_001];
const timedOut = await runHeadlessSeries(createSeries([
  createRound("timeout-round-1"),
  createRound("timeout-round-2"),
]), {
  now: () => timeoutClock.shift() ?? 60_001,
  yieldControl: async () => undefined,
}).result;
assert.equal(timedOut.status, "failed-partial");
assert.equal(timedOut.termination, "series-timeout");
assert.equal(timedOut.completedRounds, 1);
assert.equal(timedOut.rounds.length, 1);
assert.equal(timedOut.error, "series_runner_timeout");

let pausedClock = 0;
let safetyResumeWasNeeded = false;
const pausedTimeoutExecution = runHeadlessSeries(createSeries([
  createRound("paused-timeout-round-1"),
  createRound("paused-timeout-round-2"),
]), {
  now: () => pausedClock,
  yieldControl: async () => undefined,
});
let pauseForTimeoutIssued = false;
const unsubscribePausedTimeout = pausedTimeoutExecution.subscribe((snapshot) => {
  if (!pauseForTimeoutIssued && snapshot.completedRounds === 1 && snapshot.phase === "running") {
    pauseForTimeoutIssued = true;
    pausedClock = 60_001;
    pausedTimeoutExecution.dispatch("pause");
  }
});
const safetyResume = setTimeout(() => {
  safetyResumeWasNeeded = true;
  pausedTimeoutExecution.dispatch("resume");
}, 50);
const pausedTimeout = await pausedTimeoutExecution.result;
clearTimeout(safetyResume);
unsubscribePausedTimeout();
assert.equal(safetyResumeWasNeeded, false);
assert.equal(pausedTimeout.status, "failed-partial");
assert.equal(pausedTimeout.termination, "series-timeout");
assert.equal(pausedTimeout.completedRounds, 1);
assert.equal(pausedTimeout.error, "series_runner_timeout");

const coordinatorFailure = await runHeadlessSeries(createSeries([
  createRound("coordinator-round-1"),
  createRound("coordinator-round-2"),
]), {
  yieldControl: async () => {
    throw new Error("scheduler unavailable");
  },
}).result;
assert.equal(coordinatorFailure.status, "failed-partial");
assert.equal(coordinatorFailure.termination, "error");
assert.equal(coordinatorFailure.completedRounds, 1);
assert.equal(coordinatorFailure.rounds.length, 1);
assert.equal(coordinatorFailure.error, "scheduler unavailable");

const failedSpec = createSeries([
  createRound("failure-round-1"),
  createRound("failure-round-2"),
]);
failedSpec.rounds[1].randomness.expectedInitialStateHash = `sha256:${"0".repeat(64)}`;
const failed = await runHeadlessSeries(failedSpec).result;

assert.equal(failed.status, "failed-partial");
assert.equal(failed.termination, "round-failed");
assert.equal(failed.completedRounds, 1);
assert.equal(failed.rounds.length, 2);
assert.match(failed.error, /randomness_mismatch/);

const mutableSpec = createSeries([
  createRound("captured-round-1"),
  createRound("captured-round-2"),
]);
const capturedExecution = runHeadlessSeries(mutableSpec);
let unsubscribedObservations = 0;
const unsubscribeImmediately = capturedExecution.subscribe(() => {
  unsubscribedObservations += 1;
});
unsubscribeImmediately();
mutableSpec.id = "mutated-series";
mutableSpec.rounds[1].id = "mutated-round";
mutableSpec.rounds[1].randomness.expectedInitialStateHash = `sha256:${"0".repeat(64)}`;
mutableSpec.rounds[1].spawnPlan[0].spawnIndex = 99;
mutableSpec.rounds.push(createRound("injected-round"));
const captured = await capturedExecution.result;

assert.equal(captured.id, "series-complete-check");
assert.equal(captured.status, "complete");
assert.equal(captured.completedRounds, 2);
assert.deepEqual(captured.rounds.map((round) => round.id), ["captured-round-1", "captured-round-2"]);
assert.equal(unsubscribedObservations, 1);
assert.ok(Object.isFrozen(captured));
assert.ok(Object.isFrozen(captured.rounds));
assert.ok(Object.isFrozen(captured.rounds[0].receipt));
assert.deepEqual(
  captured.rounds.map(({ receipt: roundReceipt }) => ({
    winner: roundReceipt.winner,
    steps: roundReceipt.steps,
    score: roundReceipt.score,
  })),
  receipt.rounds.map(({ receipt: roundReceipt }) => ({
    winner: roundReceipt.winner,
    steps: roundReceipt.steps,
    score: roundReceipt.score,
  })),
);

console.log(JSON.stringify({
  status: receipt.status,
  completedRounds: receipt.completedRounds,
  totalSteps: receipt.totalSteps,
  cancelled: {
    status: cancelled.status,
    completedRounds: cancelled.completedRounds,
  },
  pausePhases,
  budgeted: {
    status: budgeted.status,
    completedRounds: budgeted.completedRounds,
    totalSteps: budgeted.totalSteps,
  },
  timedOut: {
    status: timedOut.status,
    completedRounds: timedOut.completedRounds,
  },
  pausedTimeout: {
    status: pausedTimeout.status,
    safetyResumeWasNeeded,
  },
  coordinatorFailure: {
    status: coordinatorFailure.status,
    completedRounds: coordinatorFailure.completedRounds,
  },
  failed: {
    status: failed.status,
    completedRounds: failed.completedRounds,
    error: failed.error,
  },
  captured: {
    status: captured.status,
    unsubscribedObservations,
  },
  pass: true,
}, null, 2));
