import assert from "node:assert/strict";

import {
  aggregateRoundEvidence,
  recordAction,
  recordDeath,
  recordRoundCompleted,
} from "../output/esm/BotLab/round-evidence.js";

const modelController = {
  id: "planner-gpt",
  kind: "model",
  version: "1.0.0",
  provider: "openai",
  model: "gpt-evolution-test",
};
const safetyController = {
  id: "bomb-safety-shield",
  kind: "safety",
  version: "2.1.0",
};
const deterministicController = {
  id: "safe-executor",
  kind: "deterministic",
  version: "3.0.0",
};
const provenance = {
  requester: modelController,
  safety: safetyController,
  executor: deterministicController,
};

const metadata = {
  roundId: "round-seed-4401",
  build: {
    id: "bomba-pvp",
    version: "0.4.4",
    revision: "abc123",
    artifactHash: "sha256:test-build",
  },
  ruleset: { id: "classic", version: "1" },
  arena: { id: "tournament-clean", version: "2026-07-15" },
  seed: 4401,
  policy: {
    id: "hybrid-survivor",
    version: "7",
    family: "hybrid",
    parametersHash: "sha256:test-policy",
  },
};

const selfKo = recordDeath({
  sequence: 4,
  tick: 120,
  victimId: 2,
  cause: "bomb-blast",
  sourcePlayerId: 2,
  sourceBombId: 88,
});
const opponentKo = recordDeath({
  sequence: 3,
  tick: 119,
  victimId: 3,
  cause: "bomb-blast",
  sourcePlayerId: 2,
  sourceBombId: 88,
});
const environmentDeath = recordDeath({
  sequence: 8,
  tick: 123,
  victimId: 4,
  cause: "sudden-death",
});
const unknownBlastDeath = recordDeath({
  sequence: 5,
  tick: 121,
  victimId: 4,
  cause: "bomb-blast",
});
const blastWithoutBombId = recordDeath({
  sequence: 6,
  tick: 122,
  victimId: 2,
  cause: "bomb-blast",
  sourcePlayerId: 2,
});
const blastWithoutOwnerId = recordDeath({
  sequence: 7,
  tick: 122,
  victimId: 2,
  cause: "bomb-blast",
  sourceBombId: 89,
});
const attributedNonBlastDeath = recordDeath({
  sequence: 10,
  tick: 124,
  victimId: 2,
  cause: "disconnect",
  sourcePlayerId: 2,
  sourceBombId: 88,
});

assert.equal(selfKo.selfKo, true, "an owned bomb killing its owner must be a self-KO");
assert.equal(opponentKo.selfKo, false, "an owned bomb killing another player is not a self-KO");
assert.equal(environmentDeath.selfKo, false, "a death without an attributable bomb is not a self-KO");
assert.equal(unknownBlastDeath.selfKo, null, "an unattributed bomb blast must not become a false negative");
assert.equal(blastWithoutBombId.selfKo, null, "a player id without a proven bomb id is incomplete attribution");
assert.equal(blastWithoutOwnerId.selfKo, null, "a bomb id without a proven owner is incomplete attribution");
assert.equal(selfKo.attribution, "complete");
assert.equal(opponentKo.attribution, "complete");
assert.equal(unknownBlastDeath.attribution, "unknown");
assert.equal(blastWithoutBombId.attribution, "partial");
assert.equal(blastWithoutOwnerId.attribution, "partial");
assert.equal(environmentDeath.attribution, "unknown");
assert.equal(
  attributedNonBlastDeath.selfKo,
  false,
  "matching attribution must not turn a non-explosive death into a self-KO",
);
assert.equal(attributedNonBlastDeath.attribution, "unknown");
assert.equal(attributedNonBlastDeath.sourcePlayerId, null, "non-blast attribution must be normalized away");
assert.equal(attributedNonBlastDeath.sourceBombId, null, "non-blast bomb ids must not imply self-KO");
assert.equal(environmentDeath.sourcePlayerId, null);
assert.equal(environmentDeath.sourceBombId, null);
assert.equal(Object.isFrozen(unknownBlastDeath), true);

const fallbackAfterTimeout = recordAction({
  sequence: 1,
  tick: 100,
  playerId: 2,
  requestedAction: { kind: "place-bomb", parameters: { target: "crate" } },
  safetyDecision: { verdict: "replace", reasonCode: "no-escape-route" },
  executedAction: { kind: "move", parameters: { direction: "left" } },
  outcome: {
    status: "executed",
    reasonCode: "deterministic-fallback",
    fallbackUsed: true,
    timedOut: true,
  },
  provenance,
});
const blockedInvalidAction = recordAction({
  sequence: 0,
  tick: 99,
  playerId: 2,
  requestedAction: { kind: "teleport-outside-arena" },
  safetyDecision: { verdict: "invalid", reasonCode: "unsupported-action" },
  executedAction: null,
  outcome: { status: "blocked", reasonCode: "safety-rejected" },
  provenance: {
    requester: modelController,
    safety: safetyController,
    executor: null,
  },
});
const stalledAction = recordAction({
  sequence: 2,
  tick: 110,
  playerId: 2,
  requestedAction: { kind: "move", parameters: { direction: "up" } },
  safetyDecision: { verdict: "allow" },
  executedAction: { kind: "move", parameters: { direction: "up" } },
  outcome: { status: "stalled", reasonCode: "no-position-delta" },
  provenance,
});
const completed = recordRoundCompleted({
  sequence: 9,
  tick: 300,
  reason: "last-player-standing",
  winnerIds: [1],
});

assert.deepEqual(fallbackAfterTimeout.provenance, provenance);
assert.equal(fallbackAfterTimeout.requestedAction.kind, "place-bomb");
assert.equal(fallbackAfterTimeout.safetyDecision.verdict, "replace");
assert.equal(fallbackAfterTimeout.executedAction.kind, "move");
assert.equal(fallbackAfterTimeout.outcome.status, "executed");

const eventsInReverseOrder = [
  completed,
  environmentDeath,
  blastWithoutOwnerId,
  blastWithoutBombId,
  unknownBlastDeath,
  selfKo,
  opponentKo,
  stalledAction,
  fallbackAfterTimeout,
  blockedInvalidAction,
];
const evidence = aggregateRoundEvidence(metadata, eventsInReverseOrder);
const repeatedEvidence = aggregateRoundEvidence(metadata, [...eventsInReverseOrder].reverse());

assert.deepEqual(evidence, repeatedEvidence, "event aggregation must be canonical by sequence");
assert.deepEqual(
  evidence.events.map((event) => event.sequence),
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
);
assert.deepEqual(evidence.metadata, metadata);
assert.equal(Object.isFrozen(evidence), true);
assert.equal(Object.isFrozen(evidence.metadata), true);
assert.equal(Object.isFrozen(evidence.metadata.build), true);
assert.equal(Object.isFrozen(evidence.events), true);
eventsInReverseOrder.length = 0;
assert.equal(evidence.events.length, 10, "the evidence must not retain the caller's event-array alias");
assert.deepEqual(evidence.counters, {
  completedRounds: 1,
  deaths: 6,
  selfKOs: 1,
  selfKoUnknown: 3,
  actions: 3,
  invalidActions: 1,
  fallbackActions: 1,
  timeouts: 1,
  blockedActions: 1,
  stalledActions: 1,
  deathsByCause: {
    "bomb-blast": 5,
    "sudden-death": 1,
    environment: 0,
    disconnect: 0,
    unknown: 0,
  },
});

assert.throws(
  () => aggregateRoundEvidence(metadata, [selfKo, { ...opponentKo, sequence: selfKo.sequence }]),
  /Duplicate round evidence sequence/,
  "ambiguous event ordering must fail closed",
);

assert.throws(
  () => aggregateRoundEvidence(metadata, [
    { ...completed, sequence: 0 },
    recordAction({
      sequence: 1,
      tick: 301,
      playerId: 1,
      requestedAction: { kind: "move" },
      safetyDecision: { verdict: "allow" },
      executedAction: { kind: "move" },
      outcome: { status: "executed" },
      provenance,
    }),
  ]),
  /event after completion/,
  "post-completion events must not contaminate round counters",
);

assert.throws(
  () => aggregateRoundEvidence(metadata, [
    { ...completed, sequence: 0 },
    recordRoundCompleted({
      sequence: 1,
      tick: 301,
      reason: "conflicting-final",
      winnerIds: [2],
    }),
  ]),
  /Duplicate round-completed event/,
  "a round must have at most one completion event",
);

assert.throws(
  () => aggregateRoundEvidence(metadata, [
    { ...blockedInvalidAction, sequence: 0 },
    { ...stalledAction, sequence: 2 },
  ]),
  /sequence gap/,
  "missing events must fail closed instead of silently shrinking counters",
);

for (const invalidTick of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
  assert.throws(
    () => aggregateRoundEvidence(metadata, [{ ...opponentKo, sequence: 0, tick: invalidTick }]),
    /tick must be a non-negative safe integer/,
  );
}
assert.throws(
  () => aggregateRoundEvidence(metadata, [
    { ...opponentKo, sequence: 0, tick: 10 },
    { ...selfKo, sequence: 1, tick: 9 },
  ]),
  /tick regressed/,
  "ticks must not regress as event sequence advances",
);

const mutableRequestedAction = {
  kind: "move",
  parameters: { direction: "left" },
};
const mutableProvenance = {
  requester: { ...modelController },
  safety: { ...safetyController },
  executor: { ...deterministicController },
};
const snapshottedAction = recordAction({
  sequence: 8,
  tick: 400,
  playerId: 2,
  requestedAction: mutableRequestedAction,
  safetyDecision: { verdict: "allow" },
  executedAction: mutableRequestedAction,
  outcome: { status: "executed" },
  provenance: mutableProvenance,
});
mutableRequestedAction.parameters.direction = "right";
mutableProvenance.requester.id = "tampered-controller";
assert.equal(snapshottedAction.requestedAction.parameters.direction, "left");
assert.equal(snapshottedAction.executedAction.parameters.direction, "left");
assert.equal(snapshottedAction.provenance.requester.id, "planner-gpt");
assert.equal(Object.isFrozen(snapshottedAction.requestedAction.parameters), true);

metadata.build.version = "tampered-build";
metadata.policy.version = "tampered-policy";
assert.equal(evidence.metadata.build.version, "0.4.4");
assert.equal(evidence.metadata.policy.version, "7");

console.log(JSON.stringify({
  metadata: evidence.metadata,
  counters: evidence.counters,
  provenance: fallbackAfterTimeout.provenance,
  pass: true,
}, null, 2));
