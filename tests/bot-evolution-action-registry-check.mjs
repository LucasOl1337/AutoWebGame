import assert from "node:assert/strict";

import { createActionRegistry, definedArenaActionIds } from "../output/esm/BotLab/action-registry.js";
import { arenaError, createBotEvolutionArena } from "../output/esm/BotLab/arena-interface.js";

const actionIds = definedArenaActionIds();
assert.deepEqual(actionIds, [
  "arena.experiment.start",
  "arena.run.pause",
  "arena.run.resume",
  "arena.run.cancel",
  "arena.evaluation.request",
  "arena.promotion.challenge.issue",
  "arena.candidate.promote",
]);

const sha256 = async (value) => {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
};
const EXPERIMENT_HASH = `sha256:${"1".repeat(64)}`;
const EVIDENCE_HASH = `sha256:${"2".repeat(64)}`;
const EVALUATION_HASH = `sha256:${"3".repeat(64)}`;
const SESSION_HASH = `sha256:${"4".repeat(64)}`;
const MUTATED_HASH = `sha256:${"5".repeat(64)}`;

let receiptSequence = 0;
let handlerCallCount = 0;
let promotionCount = 0;
let promotedCandidateGenomeId = null;
let promotedEvaluationHash = null;
let evaluationCount = 0;
let currentRunState = "running";
const accepted = (runId, stateBefore, stateAfter, resourceHash = null) => ({
  ok: true,
  runId,
  stateBefore,
  stateAfter,
  resourceHash,
});
const handlers = {
  "arena.experiment.start": () => {
    handlerCallCount += 1;
    return accepted("run-1", null, "accepted", EXPERIMENT_HASH);
  },
  "arena.run.pause": (command) => {
    handlerCallCount += 1;
    if (command.expectedState !== currentRunState) {
      return {
        ok: false,
        runId: command.runId,
        stateBefore: currentRunState,
        stateAfter: currentRunState,
        error: arenaError("run_state_conflict", "conflict", "Expected state does not match.", { retryable: true }),
      };
    }
    currentRunState = "paused";
    return accepted(command.runId, command.expectedState, "paused");
  },
  "arena.run.resume": (command) => {
    handlerCallCount += 1;
    currentRunState = "running";
    return accepted(command.runId, command.expectedState, "running");
  },
  "arena.run.cancel": (command) => {
    handlerCallCount += 1;
    return accepted(command.runId, command.expectedState, "cancelled");
  },
  "arena.evaluation.request": (command) => {
    handlerCallCount += 1;
    evaluationCount += 1;
    return accepted(command.runId, "evaluating", "completed", command.evidenceManifestHash);
  },
  "arena.promotion.challenge.issue": (command, context) => {
    handlerCallCount += 1;
    assert.equal(context.principal.actorId, "admin-1");
    return accepted(command.runId, "completed", "completed", command.evaluationHash);
  },
  "arena.candidate.promote": (command, context) => {
    handlerCallCount += 1;
    promotionCount += 1;
    promotedCandidateGenomeId = command.candidateGenomeId;
    promotedEvaluationHash = command.evaluationHash;
    assert.equal(context.principal.actorId, "admin-1");
    return accepted(command.runId, "completed", "completed", command.evaluationHash);
  },
};

let challengeSequence = 0;
let issueCalls = 0;
let consumeCalls = 0;
const challenges = new Map();
const promotionAuthorizer = {
  async issueChallenge({ principal, canonicalCommandHash, expiresInMs }) {
    issueCalls += 1;
    assert.equal(expiresInMs, 300_000);
    const challengeId = `challenge-${++challengeSequence}`;
    const nonce = `nonce-${challengeSequence}`;
    const expiresAt = "2026-07-15T15:05:00.000Z";
    const issued = { challengeId, canonicalCommandHash, nonce, expiresAt };
    const record = {
      challengeId,
      canonicalCommandHash,
      nonceHash: await sha256(nonce),
      actorId: principal.actorId,
      sessionIdHash: principal.sessionIdHash,
      issuedAt: "2026-07-15T15:00:00.000Z",
      expiresAt,
      usedAt: null,
    };
    challenges.set(challengeId, { issued, record, used: false });
    return { issued, record };
  },
  async consumeChallenge({ principal, challengeId, nonce, canonicalCommandHash }) {
    consumeCalls += 1;
    const challenge = challenges.get(challengeId);
    if (!challenge) return { authorized: false, reasonCode: "challenge_missing" };
    if (challenge.used) return { authorized: false, reasonCode: "challenge_used" };
    if (challenge.issued.nonce !== nonce) return { authorized: false, reasonCode: "nonce_mismatch" };
    if (challenge.issued.canonicalCommandHash !== canonicalCommandHash) {
      return { authorized: false, reasonCode: "payload_mismatch" };
    }
    if (challenge.record.actorId !== principal.actorId
      || challenge.record.sessionIdHash !== principal.sessionIdHash) {
      return { authorized: false, reasonCode: "principal_mismatch" };
    }
    challenge.used = true;
    return { authorized: true, actorId: principal.actorId, consumedAt: "2026-07-15T15:01:00.000Z" };
  },
};

const allPermissions = [
  "arena.experiment.start",
  "arena.run.control",
  "arena.run.cancel",
  "arena.evaluation.request",
  "arena.candidate.promote",
];
const adminContext = {
  requestId: "request-admin-1",
  principal: {
    actorId: "admin-1",
    sessionIdHash: SESSION_HASH,
    permissions: allPermissions,
  },
  promotionAuthorizer,
};
const dependencies = {
  implementationVersion: "0.1-test",
  policyFamilies: ["deterministic", "model", "hybrid"],
  adapters: [{
    adapterId: "catalog-only-model",
    version: "1",
    family: "model",
    configured: true,
    verified: false,
    executed: false,
    healthy: true,
    lastProbeAt: null,
    lastExecutionAt: null,
    consumedGenePaths: ["/model/prompt"],
    supportedActions: ["move"],
    effectiveIdentities: [{ provider: "catalog", model: "unverified" }],
    reason: "probe_not_executed",
  }],
  artifactRoot: "output/bot-evolution-arena/v0.1",
  limits: { maxConcurrentRounds: 2 },
  handlers,
  now: () => "2026-07-15T15:00:00.000Z",
  nextReceiptId: () => `receipt-${++receiptSequence}`,
  readView: (query) => ({ kind: query.view, data: { runId: query.runId ?? null } }),
};

const arena = createBotEvolutionArena(dependencies);
const descriptor = await arena.describe();
const directRegistry = createActionRegistry(handlers);
assert.deepEqual(descriptor.capabilities.actions, directRegistry.descriptors());
assert.equal(descriptor.capabilities.actions.length, 7);
assert.deepEqual(descriptor.capabilities.limitations, ["volatile_idempotency", "audit_sink_not_bound"]);
assert.equal(descriptor.health.status, "degraded");
assert.ok(descriptor.health.reasons.includes("volatile_idempotency"));
assert.ok(descriptor.health.reasons.includes("audit_sink_not_bound"));
const challengeDescriptor = descriptor.capabilities.actions.find(
  (action) => action.id === "arena.promotion.challenge.issue",
);
const promotionDescriptor = descriptor.capabilities.actions.find(
  (action) => action.id === "arena.candidate.promote",
);
assert.equal(challengeDescriptor.confirmationMechanism, "admin-session-challenge-v0.1");
assert.equal(challengeDescriptor.requiredPermission, "arena.candidate.promote");
assert.equal(promotionDescriptor.requiresHumanConfirmation, true);
assert.equal(promotionDescriptor.confirmationMechanism, "admin-session-challenge-v0.1");
assert.equal(promotionDescriptor.errorRetryability.promotion_challenge_invalid, true);
assert.equal(promotionDescriptor.errorRetryability.permission_denied, false);
assert.equal("actorId" in promotionDescriptor.inputSchema.properties, false);
assert.equal("signature" in promotionDescriptor.inputSchema.properties, false);
assert.equal(Object.isFrozen(descriptor.capabilities.actions), true);
assert.equal(descriptor.health.status, "degraded");

const registryWithMissingHandler = createActionRegistry({
  "arena.experiment.start": handlers["arena.experiment.start"],
});
assert.deepEqual(
  registryWithMissingHandler.descriptors().map((action) => action.id),
  ["arena.experiment.start"],
  "an action without a bound handler must not be advertised",
);

const missingAction = await arena.execute({
  action: "arena.not-real",
  idempotencyKey: "missing-action-1",
}, adminContext);
assert.equal(missingAction.error.code, "unknown_action");
assert.equal(handlerCallCount, 0);

const startCommand = {
  action: "arena.experiment.start",
  idempotencyKey: "start-1",
  spec: { schemaVersion: "botevolutionarena.v0.1", title: "Safe bots" },
};
const firstStart = await arena.execute(startCommand, adminContext);
const replayedStart = await arena.execute({
  ...startCommand,
  spec: { title: "Safe bots", schemaVersion: "botevolutionarena.v0.1" },
}, adminContext);
assert.strictEqual(firstStart, replayedStart);
assert.equal(handlerCallCount, 1);
const conflictingStart = await arena.execute({
  ...startCommand,
  spec: { schemaVersion: "botevolutionarena.v0.1", title: "Different" },
}, adminContext);
assert.equal(conflictingStart.error.code, "idempotency_conflict");
assert.equal(handlerCallCount, 1);

const invalidHashReceipt = await arena.execute({
  action: "arena.evaluation.request",
  idempotencyKey: "evaluation-invalid-hash",
  runId: "run-1",
  evidenceManifestHash: "sha256:short",
}, adminContext);
assert.equal(invalidHashReceipt.error.code, "invalid_command");
assert.equal(evaluationCount, 0);

const evaluationReceipt = await arena.execute({
  action: "arena.evaluation.request",
  idempotencyKey: "evaluation-1",
  runId: "run-1",
  evidenceManifestHash: EVIDENCE_HASH,
}, adminContext);
assert.equal(evaluationReceipt.status, "accepted");
assert.equal(evaluationCount, 1);
assert.equal(promotionCount, 0, "evaluation must never promote a candidate");

const holdoutCancelReceipt = await arena.execute({
  action: "arena.run.cancel",
  idempotencyKey: "cancel-holdout-1",
  runId: "run-holdout-1",
  expectedState: "holdout-running",
  reason: "operator-request",
}, adminContext);
assert.equal(holdoutCancelReceipt.status, "accepted");

const challengeCommand = {
  action: "arena.promotion.challenge.issue",
  idempotencyKey: "challenge-issue-1",
  runId: "run-1",
  candidateGenomeId: "candidate-1",
  evaluationHash: EVALUATION_HASH,
  expectedCurrentGenomeId: null,
};
const noPrincipalReceipt = await arena.execute(challengeCommand, {
  ...adminContext,
  principal: null,
});
assert.equal(noPrincipalReceipt.error.code, "principal_required");
assert.equal(issueCalls, 0);

const noPermissionReceipt = await arena.execute({
  ...challengeCommand,
  idempotencyKey: "challenge-no-permission",
}, {
  ...adminContext,
  principal: { ...adminContext.principal, permissions: [] },
});
assert.equal(noPermissionReceipt.error.code, "permission_denied");
assert.equal(issueCalls, 0);

const forgedBodyAuthority = await arena.execute({
  ...challengeCommand,
  idempotencyKey: "challenge-forged-body-authority",
  actorId: "forged-admin",
  signature: "forged-signature",
}, adminContext);
assert.equal(forgedBodyAuthority.error.code, "invalid_command");
assert.equal(issueCalls, 0, "authority fields from the command body must never reach the authorizer");

const issuedReceipt = await arena.execute(challengeCommand, adminContext);
assert.equal(issuedReceipt.status, "accepted");
assert.ok(issuedReceipt.result.promotionChallenge);
assert.equal(issueCalls, 1);
const issuedReplay = await arena.execute({ ...challengeCommand }, adminContext);
assert.strictEqual(issuedReplay, issuedReceipt);
assert.equal(issueCalls, 1, "challenge replay must not issue a second nonce");

const issued = issuedReceipt.result.promotionChallenge;
const promotionBase = {
  action: "arena.candidate.promote",
  runId: "run-1",
  candidateGenomeId: "candidate-1",
  evaluationHash: EVALUATION_HASH,
  expectedCurrentGenomeId: null,
  adminChallengeId: issued.challengeId,
};
const wrongPayload = await arena.execute({
  ...promotionBase,
  idempotencyKey: "promotion-wrong-payload",
  candidateGenomeId: "candidate-2",
  adminChallengeNonce: issued.nonce,
}, adminContext);
assert.equal(wrongPayload.error.code, "promotion_challenge_invalid");
assert.equal(wrongPayload.error.details.reasonCode, "payload_mismatch");
assert.equal(promotionCount, 0);

const wrongNonce = await arena.execute({
  ...promotionBase,
  idempotencyKey: "promotion-wrong-nonce",
  adminChallengeNonce: "wrong-nonce",
}, adminContext);
assert.equal(wrongNonce.error.code, "promotion_challenge_invalid");
assert.equal(wrongNonce.error.details.reasonCode, "nonce_mismatch");
assert.equal(promotionCount, 0);

const promotionCommand = {
  ...promotionBase,
  idempotencyKey: "promotion-valid-1",
  adminChallengeNonce: issued.nonce,
};
const promotionReplayCommand = { ...promotionCommand };
const promotedPromise = arena.execute(promotionCommand, adminContext);
promotionCommand.candidateGenomeId = "candidate-mutated-after-dispatch";
promotionCommand.evaluationHash = MUTATED_HASH;
const promoted = await promotedPromise;
assert.equal(promoted.status, "accepted");
assert.equal(promotionCount, 1);
assert.equal(promotedCandidateGenomeId, "candidate-1");
assert.equal(promotedEvaluationHash, EVALUATION_HASH);
const promotionReplay = await arena.execute(promotionReplayCommand, adminContext);
assert.strictEqual(promotionReplay, promoted);
assert.equal(promotionCount, 1);
assert.equal(consumeCalls, 3, "idempotent replay must not consume the challenge again");

const reusedChallenge = await arena.execute({
  ...promotionCommand,
  idempotencyKey: "promotion-reuse-2",
}, adminContext);
assert.equal(reusedChallenge.error.code, "promotion_challenge_invalid");
assert.equal(reusedChallenge.error.details.reasonCode, "challenge_used");
assert.equal(promotionCount, 1);
assert.equal(consumeCalls, 4);

const handlerCallsBeforeObserve = handlerCallCount;
assert.equal((await arena.observe(null)).kind, "error");
assert.equal((await arena.observe({ view: "unknown" })).kind, "error");
const firstStatus = await arena.observe({ view: "arena.status" });
const secondStatus = await arena.observe({ view: "arena.status" });
assert.deepEqual(firstStatus, secondStatus);
assert.equal(handlerCallCount, handlerCallsBeforeObserve);

console.log(JSON.stringify({
  actionIds,
  issueCalls,
  consumeCalls,
  promotionCount,
  evaluationCount,
  pass: true,
}, null, 2));
