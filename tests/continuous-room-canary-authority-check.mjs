import assert from "node:assert/strict";
import { ContinuousRoomCanaryAuthority } from "../output/esm/ContinuousRoom/continuous-room-canary-authority.js";
import { sha256RecoveryToken as sha256Token } from "../output/esm/ContinuousRoom/continuous-room-recovery-token.js";

class MemoryStorage {
  values = new Map();
  alarms = [];
  async get(key) { return structuredClone(this.values.get(key)); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async list({prefix}) {
    return new Map([...this.values].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => [key, structuredClone(value)]));
  }
  async setAlarm(time) { this.alarms.push(time); }
  async delete(key) { return this.values.delete(key); }
}

const protocol = "continuous-room.lifecycle.v1";
const ranni = "03a976fb-7313-4064-a477-5bb9b0760034";
const ids = (() => {
  let sequence = 0;
  return {create: (kind) => `${kind}_test_${String(++sequence).padStart(4, "0")}`};
})();
const command = (operationId, commandId, expectedServerRevision, type, extra = {}) => ({
  protocol, operationId, commandId, expectedServerRevision, type, ...extra,
});

const storage = new MemoryStorage();
const authority = new ContinuousRoomCanaryAuthority(storage, ids);
const op = "operation_authority_0001";
const prepared = await authority.handle(command(op, "command_prepare_0001", 0, "prepare-entry", {
  characterId: ranni, nick: "Dog",
}), 1_000);
assert.equal(prepared.ok, true);
assert.equal(prepared.snapshot.state, "prepared");
assert.equal(prepared.snapshot.committed, false);
assert.equal(prepared.snapshot.roomId, null);
assert.equal(prepared.snapshot.serverRevision, 1);

const replayed = await authority.handle(command(op, "command_prepare_0001", 0, "prepare-entry", {
  characterId: ranni, nick: "Dog",
}), 1_100);
assert.equal(replayed.ok, true);
assert.equal(replayed.replayed, true);
assert.deepEqual(replayed.snapshot, prepared.snapshot);

const conflictingReplay = await authority.handle(command(op, "command_prepare_0001", 0, "prepare-entry", {
  characterId: ranni, nick: "Outro",
}), 1_200);
assert.equal(conflictingReplay.ok, false);
assert.equal(conflictingReplay.code, "command_conflict");

const staleCommit = await authority.handle(command(op, "command_commit_stale", 0, "commit-entry", {
  recoveryProofHash: await sha256Token("recovery_token_alpha_0001"),
}), 1_300);
assert.equal(staleCommit.ok, false);
assert.equal(staleCommit.code, "stale_revision");

const preCancelOp = "operation_precancel_0002";
await authority.handle(command(preCancelOp, "command_prepare_0002", 0, "prepare-entry", {
  characterId: ranni, nick: "Antes",
}), 2_000);
const preCancelled = await authority.handle(command(preCancelOp, "command_cancel_0002", 1, "cancel-entry"), 2_010);
assert.equal(preCancelled.ok, true);
assert.equal(preCancelled.snapshot.state, "cancelled");
assert.equal(preCancelled.snapshot.committed, false);
assert.equal(preCancelled.snapshot.roomId, null);

const token = "recovery_token_alpha_0001";
const tokenHash = await sha256Token(token);
const committed = await authority.handle(command(op, "command_commit_0001", 1, "commit-entry", {
  recoveryProofHash: tokenHash,
}), 3_000);
assert.equal(committed.ok, true);
assert.equal(committed.snapshot.state, "preparing");
assert.equal(committed.snapshot.committed, true);
assert.equal(committed.snapshot.serverRevision, 2);
assert.equal(committed.snapshot.preparationDeadlineMs, 8_000);
assert.equal(storage.alarms.at(-1), 8_000);
assert.deepEqual(committed.snapshot.participants.map((participant) => participant.displayName), ["Dog", "Nara", "Bento", "Luma"]);
assert.deepEqual(committed.snapshot.participants.map((participant) => participant.profileId), ["visitor", "nara", "bento", "luma"]);
assert.equal(new Set(committed.snapshot.participants.map((participant) => participant.identityId)).size, 4);
assert.equal(JSON.stringify([...storage.values.values()]).includes(token), false, "raw recovery token must never be persisted");

const staleInput = await authority.handle(command(op, "command_input_stale", 1, "input", {
  inputSeq: 1,
  input: {direction: "right", bombPressed: true, detonatePressed: false, skillPressed: false, skillHeld: false},
}), 3_100);
assert.equal(staleInput.ok, false);
assert.equal(staleInput.code, "stale_revision");

const input = await authority.handle(command(op, "command_input_0001", 2, "input", {
  inputSeq: 1,
  input: {direction: "right", bombPressed: true, detonatePressed: false, skillPressed: false, skillHeld: false},
}), 3_200);
assert.equal(input.ok, true);
assert.equal(input.snapshot.acceptedInputSeq, 1);
assert.equal(input.snapshot.serverRevision, 3);

const oldInput = await authority.handle(command(op, "command_input_0002", 3, "input", {
  inputSeq: 1,
  input: {direction: "left", bombPressed: false, detonatePressed: false, skillPressed: false, skillHeld: false},
}), 3_300);
assert.equal(oldInput.ok, false);
assert.equal(oldInput.code, "invalid_state");
const duplicateInput = await authority.handle(command(op, "command_input_duplicate", 3, "input", {
  inputSeq: 1,
  input: {direction: "right", bombPressed: true, detonatePressed: false, skillPressed: false, skillHeld: false},
}), 3_301);
assert.equal(duplicateInput.ok, true);
assert.equal(duplicateInput.replayed, true);
const gapInput = await authority.handle(command(op, "command_input_gap", 3, "input", {
  inputSeq: 3,
  input: {direction: "right", bombPressed: false, detonatePressed: false, skillPressed: false, skillHeld: false},
}), 3_302);
assert.equal(gapInput.ok, false);
assert.equal(gapInput.code, "invalid_state");
assert.equal(oldInput.snapshot.serverRevision, 3);

const early = await authority.handle(command(op, "command_observe_early", 3, "observe"), 7_999);
assert.equal(early.ok, true);
assert.equal(early.snapshot.state, "preparing");

const due = await authority.handle(command(op, "command_observe_due", 3, "observe"), 8_000);
assert.equal(due.ok, true, due.message);
assert.equal(due.snapshot.state, "result");
assert.equal(due.snapshot.round.status, "complete");
assert.equal(due.snapshot.round.reproducibility, "verified");
assert.equal(due.snapshot.round.snapshots.length > 2, true, "real GameApp trace must expose progressive snapshots");
assert.equal(due.snapshot.round.steps > 0, true);
assert.match(due.snapshot.round.receiptHash, /^sha256:[0-9a-f]{64}$/);
const lateCommitReplay = await authority.handle(command(op, "command_commit_0001", 1, "commit-entry", {
  recoveryProofHash: tokenHash,
}), 8_100);
assert.equal(lateCommitReplay.ok, true);
assert.equal(lateCommitReplay.replayed, true);
assert.deepEqual(lateCommitReplay.snapshot, committed.snapshot, "idempotency must replay the exact accepted commit snapshot");
assert.equal("recoveryToken" in lateCommitReplay.snapshot, false);

const neutralStorage = new MemoryStorage();
const neutralAuthority = new ContinuousRoomCanaryAuthority(neutralStorage, ids);
const neutralOp = "operation_neutral_round_0004";
await neutralAuthority.handle(command(neutralOp, "command_neutral_prepare", 0, "prepare-entry", {
  characterId: ranni, nick: "Neutro",
}), 30_000);
await neutralAuthority.handle(command(neutralOp, "command_neutral_commit", 1, "commit-entry", {
  recoveryProofHash: await sha256Token("recovery_token_neutral_0004"),
}), 30_001);
const neutralDue = await neutralAuthority.handle(command(neutralOp, "command_neutral_observe", 2, "observe"), 35_001);
assert.equal(neutralDue.ok, true, neutralDue.message);
assert.notEqual(neutralDue.snapshot.round.receiptHash, due.snapshot.round.receiptHash, "accepted human input must change the real Round trace");

const raceStorage = new MemoryStorage();
const raceAuthority = new ContinuousRoomCanaryAuthority(raceStorage, ids);
const raceOp = "operation_alarm_race_0005";
await raceAuthority.handle(command(raceOp, "command_race_prepare", 0, "prepare-entry", {
  characterId: ranni, nick: "Corrida",
}), 40_000);
await raceAuthority.handle(command(raceOp, "command_race_commit", 1, "commit-entry", {
  recoveryProofHash: await sha256Token("recovery_token_alarm_0005"),
}), 40_001);
await raceAuthority.advanceDueSessions(45_001);
const staleObserve = await raceAuthority.handle(command(raceOp, "command_race_observe", 2, "observe"), 45_002);
assert.equal(staleObserve.ok, true, "observe must stay readable when the alarm advanced the revision first");
assert.equal(staleObserve.snapshot.state, "result");
assert.equal(staleObserve.snapshot.serverRevision > 2, true);

const nextToken = "recovery_token_beta_0002";
const recovered = await authority.handle(command(op, "command_recover_0001", 0, "recover", {
  sessionId: committed.snapshot.sessionId,
  recoveryToken: token,
  nextRecoveryProofHash: await sha256Token(nextToken),
}), 9_000);
assert.equal(recovered.ok, true);
assert.equal(recovered.snapshot.serverRevision, due.snapshot.serverRevision + 1);

const replayedOldToken = await authority.handle(command(op, "command_recover_0002", 0, "recover", {
  sessionId: committed.snapshot.sessionId,
  recoveryToken: token,
  nextRecoveryProofHash: await sha256Token("recovery_token_gamma_0003"),
}), 9_100);
assert.equal(replayedOldToken.ok, false);
assert.equal(replayedOldToken.code, "recovery_denied");

const cancelStorage = new MemoryStorage();
const cancelAuthority = new ContinuousRoomCanaryAuthority(cancelStorage, ids);
const cancelOp = "operation_postcancel_0003";
await cancelAuthority.handle(command(cancelOp, "command_prepare_0003", 0, "prepare-entry", {
  characterId: ranni, nick: "Depois",
}), 10_000);
const cancelCommit = await cancelAuthority.handle(command(cancelOp, "command_commit_0003", 1, "commit-entry", {
  recoveryProofHash: await sha256Token("recovery_token_cancel_0003"),
}), 10_010);
const postCancelled = await cancelAuthority.handle(command(cancelOp, "command_cancel_0003", 2, "cancel-entry"), 10_020);
assert.equal(postCancelled.ok, true);
assert.equal(postCancelled.snapshot.state, "cancelled");
assert.equal(postCancelled.snapshot.committed, true, "tombstone records that commit happened");
assert.equal(postCancelled.snapshot.roomId, null);
assert.deepEqual(postCancelled.snapshot.participants, []);
assert.equal(postCancelled.snapshot.serverRevision, cancelCommit.snapshot.serverRevision + 2);

// High-rate input is kept in a bounded acknowledgement ring and does not evict lifecycle receipts.
const budgetStorage = new MemoryStorage();
const budgetAuthority = new ContinuousRoomCanaryAuthority(budgetStorage, ids);
const budgetOp = "operation_input_budget_0005";
await budgetAuthority.handle(command(budgetOp, "command_budget_prepare", 0, "prepare-entry", {
  characterId: ranni, nick: "Budget",
}), 40_000);
let budgetSnapshot = (await budgetAuthority.handle(command(budgetOp, "command_budget_commit", 1, "commit-entry", {
  recoveryProofHash: await sha256Token("recovery_token_budget_0005"),
}), 40_001)).snapshot;
for (let seq = 1; seq <= 120; seq += 1) {
  const response = await budgetAuthority.handle(command(budgetOp, `command_budget_input_${seq}`, budgetSnapshot.serverRevision, "input", {
    inputSeq: seq,
    input: {direction: seq % 2 ? "right" : null, bombPressed: false, detonatePressed: false, skillPressed: false, skillHeld: false},
  }), 40_100 + seq * 20);
  assert.equal(response.ok, true, response.message);
  budgetSnapshot = response.snapshot;
}
const transitionOverflow = await budgetAuthority.handle(command(budgetOp, "command_budget_input_121", budgetSnapshot.serverRevision, "input", {
  inputSeq: 121,
  input: {direction: "left", bombPressed: false, detonatePressed: false, skillPressed: false, skillHeld: false},
}), 42_600);
assert.equal(transitionOverflow.ok, false);
assert.equal(transitionOverflow.code, "rate_limited");
assert.equal(transitionOverflow.message, "distinct input transition budget exhausted");
const budgetRecord = [...budgetStorage.values.values()][0];
assert.equal(budgetRecord.inputAcks.length, 120);
assert.equal(Object.keys(budgetRecord.receipts).length, 2);
const budgetBytes = new TextEncoder().encode(JSON.stringify(budgetRecord)).byteLength;
assert.equal(budgetBytes < 96 * 1024, true, "persisted canary record must stay inside its storage budget");

const capacityStorage = new MemoryStorage();
const capacityAuthority = new ContinuousRoomCanaryAuthority(capacityStorage, ids);
let capacityFailure = null;
for (let index = 0; index <= 4; index += 1) {
  const response = await capacityAuthority.handle(command(
    `operation_capacity_${String(index).padStart(4, "0")}`,
    `command_capacity_${String(index).padStart(4, "0")}`,
    0,
    "prepare-entry",
    { characterId: ranni, nick: `Cap${String(index).padStart(3, "0")}` },
  ), 50_000 + index);
  if (!response.ok) capacityFailure = response;
}
assert.equal(capacityStorage.values.size, 4);
assert.equal(capacityFailure?.code, "rate_limited");
for (let index = 0; index < 4; index += 1) {
  const cancelled = await capacityAuthority.handle(command(
    `operation_capacity_${String(index).padStart(4, "0")}`,
    `command_capacity_cancel_${String(index).padStart(4, "0")}`,
    1,
    "cancel-entry",
  ), 50_100 + index);
  assert.equal(cancelled.ok, true);
}
const restartedCapacityAuthority = new ContinuousRoomCanaryAuthority(capacityStorage, ids);
const capacityAfterTombstones = await restartedCapacityAuthority.handle(command(
  "operation_capacity_after_terminal_0005",
  "command_capacity_after_terminal_0005",
  0,
  "prepare-entry",
  { characterId: ranni, nick: "Cap005" },
), 50_200);
assert.equal(capacityAfterTombstones.ok, true, "terminal records cannot consume active canary capacity after restart");

// Consecutive identical inputs collapse without dropping a later transition.
const collapseStorage = new MemoryStorage();
const collapseAuthority = new ContinuousRoomCanaryAuthority(collapseStorage, ids);
const collapseOp = "operation_collapse_0006";
await collapseAuthority.handle(command(collapseOp, "command_collapse_prepare", 0, "prepare-entry", {
  characterId: ranni, nick: "Colapso",
}), 55_000);
let collapseSnapshot = (await collapseAuthority.handle(command(collapseOp, "command_collapse_commit", 1, "commit-entry", {
  recoveryProofHash: await sha256Token("recovery_token_collapse_0006"),
}), 55_001)).snapshot;
const repeatedRight = {direction: "right", bombPressed: false, detonatePressed: false, skillPressed: false, skillHeld: false};
for (const inputState of [repeatedRight, repeatedRight, {...repeatedRight, bombPressed: true}]) {
  const response = await collapseAuthority.handle(command(collapseOp, `command_collapse_input_${collapseSnapshot.acceptedInputSeq + 1}`, collapseSnapshot.serverRevision, "input", {
    inputSeq: collapseSnapshot.acceptedInputSeq + 1,
    input: inputState,
  }), 55_010 + collapseSnapshot.acceptedInputSeq);
  assert.equal(response.ok, true);
  collapseSnapshot = response.snapshot;
}
const collapseRecord = [...collapseStorage.values.values()][0];
assert.equal(collapseRecord.inputTimeline.length, 2);
assert.equal(collapseRecord.inputTimeline[0].repeatCount, 2);
assert.equal(collapseRecord.inputTimeline[1].input.bombPressed, true);

// One Durable Object alarm advances only the earliest due Round, then rearms
// immediately; a fresh authority instance resumes the second record from storage.
const alarmStorage = new MemoryStorage();
const alarmAuthority = new ContinuousRoomCanaryAuthority(alarmStorage, ids);
const createAlarmRoom = async (operationId, prefix, nowMs) => {
  await alarmAuthority.handle(command(operationId, `${prefix}_prepare`, 0, "prepare-entry", {characterId: ranni, nick: prefix}), nowMs);
  return alarmAuthority.handle(command(operationId, `${prefix}_commit`, 1, "commit-entry", {
    recoveryProofHash: await sha256Token(`recovery_token_${prefix}_00000001`),
  }), nowMs + 1);
};
await createAlarmRoom("operation_alarm_later_0007", "Later", 60_000);
await createAlarmRoom("operation_alarm_earlier_0008", "Earlier", 59_000);
assert.equal(alarmStorage.alarms.at(-1), 64_001, "new later commits cannot overwrite the earliest deadline");
const firstAlarmStarted = performance.now();
const firstAlarmCpuStarted = process.cpuUsage();
await alarmAuthority.advanceDueSessions(65_001);
const firstAlarmDurationMs = performance.now() - firstAlarmStarted;
const firstAlarmCpu = process.cpuUsage(firstAlarmCpuStarted);
const firstAlarmCpuMs = (firstAlarmCpu.user + firstAlarmCpu.system) / 1_000;
let alarmRecords = [...alarmStorage.values.values()];
assert.equal(alarmRecords.filter((record) => record.state === "result").length, 1);
assert.equal(alarmRecords.filter((record) => record.state === "preparing").length, 1);
assert.equal(alarmStorage.alarms.at(-1), 65_002);
assert.equal(firstAlarmCpuMs < 20_000, true, `single-round alarm CPU exceeded margin: ${firstAlarmCpuMs}ms`);
const restartedAuthority = new ContinuousRoomCanaryAuthority(alarmStorage, ids);
await restartedAuthority.advanceDueSessions(65_002);
alarmRecords = [...alarmStorage.values.values()];
assert.equal(alarmRecords.filter((record) => record.state === "result").length, 2);

console.log("continuous-room-canary-authority-check: ok", JSON.stringify({
  maxStoredRecordBytes: budgetBytes,
  firstAlarmDurationMs: Math.round(firstAlarmDurationMs),
  firstAlarmCpuMs: Math.round(firstAlarmCpuMs),
}));
