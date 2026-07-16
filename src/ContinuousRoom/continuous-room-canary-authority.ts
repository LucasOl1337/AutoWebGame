import { toArenaDefinition, getPublishedArenaMap, listPublishedArenaMaps } from "../Arenas/canonical-arena-catalog";
import {
  getRegisteredPolicyArtifactHash,
  runHeadlessRound,
  type HeadlessRoundReceipt,
} from "../BotLab/headless-round-runner";
import { CANONICAL_CHARACTER_CATALOG } from "../FrontendKernel/CharacterSelection/selection-contract";
import type { OnlineInputState } from "../NetCode/protocol";
import { sha256Canonical } from "../Shared/canonical-json";
import {
  CONTINUOUS_ROOM_CANARY_PROTOCOL,
  CONTINUOUS_ROOM_PREPARATION_MS,
  type ContinuousRoomCanaryCommand,
  type ContinuousRoomCanaryResponse,
  type ContinuousRoomCanarySnapshot,
  type ContinuousRoomParticipant,
  type ContinuousRoomRoundProjection,
} from "./continuous-room-canary-contract";
import { sha256RecoveryToken } from "./continuous-room-recovery-token";

const RECORD_PREFIX = "canonical-continuous-room-canary:v1:";
const INITIAL_STATE_HASHES = Object.freeze([
  "sha256:3978b7181574faa0f3e146d3531f79c7a0be73a9e9e5a7c19812f352b7177b4f",
  "sha256:65955cfc02bcc46a9d17b05c3a0ea4581e83a89270d1a7e02de6fe06acaee1f8",
  "sha256:68e8144bf04d7065e74f93b2c2c6ba28c42aad952875f643464fb34c3ffee948",
  "sha256:9f295d830b12c8fd2d4b8c142d65fc1b4c53368e93cbc0355dafbcf4bcb92768",
] as const);
const RECOVERY_FAILURE_BUDGET = 5;
const RECOVERY_WINDOW_MS = 60_000;
const INPUT_WINDOW_MS = 1_000;
const INPUT_BUDGET_PER_WINDOW = 60;
const RECEIPT_LIMIT = 16;
const INPUT_ACK_LIMIT = 120;
const INPUT_TOTAL_LIMIT = 7_200;
const SESSION_LIMIT = 4;
const TERMINAL_TTL_MS = 60 * 60_000;
const PREPARED_TTL_MS = 5 * 60_000;
const MAX_SERIALIZED_RECORD_BYTES = 256 * 1024;
const NEUTRAL_INPUT: OnlineInputState = Object.freeze({
  direction: null,
  bombPressed: false,
  detonatePressed: false,
  skillPressed: false,
  skillHeld: false,
});

type StoredReceipt = Readonly<{
  commandHash: `sha256:${string}`;
  snapshot: ContinuousRoomCanarySnapshot;
}>;

type StoredRecord = {
  version: 1;
  operationId: string;
  sessionId: string | null;
  roomId: string | null;
  serverRevision: number;
  committed: boolean;
  state: ContinuousRoomCanarySnapshot["state"];
  characterId: string;
  nick: string;
  preparationDeadlineMs: number | null;
  participants: ContinuousRoomParticipant[];
  acceptedInputSeq: number;
  input: OnlineInputState;
  inputTimeline: Array<Readonly<{ inputHash: `sha256:${string}`; input: OnlineInputState; repeatCount: number }>>;
  recoveryProofHash: `sha256:${string}` | null;
  recoveryFailures: { windowStartedAtMs: number; count: number };
  inputBudget: { windowStartedAtMs: number; count: number };
  inputAcks: Array<Readonly<{ seq: number; inputHash: `sha256:${string}`; acceptedServerRevision: number }>>;
  inputTotal: number;
  round: ContinuousRoomCanarySnapshot["round"];
  receipts: Record<string, StoredReceipt>;
  compensation: { startedAtMs: number; completedAtMs: number } | null;
  updatedAtMs: number;
};

export interface ContinuousRoomCanaryStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  list<T>(options: Readonly<{ prefix: string }>): Promise<Map<string, T>>;
  delete?(key: string): Promise<boolean>;
  setAlarm?(scheduledTime: number): Promise<void>;
}

export class ContinuousRoomCanaryAuthority {
  constructor(
    private readonly storage: ContinuousRoomCanaryStorage,
    private readonly ids: Readonly<{ create(kind: "session" | "room" | "human"): string }> = defaultIds(),
  ) {}

  async handle(command: ContinuousRoomCanaryCommand, nowMs = Date.now()): Promise<ContinuousRoomCanaryResponse> {
    const commandHash = await sha256Canonical(command);
    let record = await this.storage.get<StoredRecord>(recordKey(command.operationId));
    const replay = command.type === "input" || command.type === "observe" ? undefined : record?.receipts[command.commandId];
    if (replay) {
      return replay.commandHash === commandHash
        ? Object.freeze({ ok: true, replayed: true, snapshot: replay.snapshot })
        : failure("command_conflict", "commandId was already used with a different payload", snapshotOf(record!));
    }

    if (command.type === "prepare-entry") {
      if (record) return failure("invalid_state", "operation already exists", snapshotOf(record));
      if (command.expectedServerRevision !== 0 || !command.characterId || !command.nick) {
        return failure("invalid_command", "prepare-entry requires revision 0, characterId and nick", null);
      }
      if (!CANONICAL_CHARACTER_CATALOG.some((character) => character.id === command.characterId)) {
        return failure("invalid_command", "characterId is not published", null);
      }
      if (!/^[\p{L}\p{N}_ -]{3,16}$/u.test(command.nick)) {
        return failure("invalid_command", "nick must contain 3-16 safe characters", null);
      }
      if (!(await this.reserveCapacity(nowMs))) {
        return failure("rate_limited", "continuous room canary capacity is exhausted", null);
      }
      record = createPreparedRecord(command.operationId, command.characterId, command.nick, nowMs);
      await this.persistReceipt(record, command.commandId, commandHash, nowMs);
      return success(record);
    }

    if (!record || (command.sessionId && command.sessionId !== record.sessionId)) {
      return failure("not_found", "continuous room operation was not found", null);
    }

    if (command.type !== "input" && command.type !== "observe"
      && Object.keys(record.receipts).length >= RECEIPT_LIMIT) {
      return failure("rate_limited", "lifecycle receipt budget exhausted", snapshotOf(record));
    }

    if (command.type === "recover") {
      return this.recover(record, command, commandHash, nowMs);
    }

    if (command.type !== "observe" && command.expectedServerRevision !== record.serverRevision) {
      return failure("stale_revision", "expectedServerRevision does not match authority", snapshotOf(record));
    }

    if (command.type === "commit-entry") {
      if (record.state !== "prepared" || !command.recoveryProofHash) {
        return failure("invalid_state", "commit-entry requires a prepared operation and recovery proof", snapshotOf(record));
      }
      record.sessionId = this.ids.create("session");
      record.roomId = this.ids.create("room");
      record.recoveryProofHash = command.recoveryProofHash;
      record.committed = true;
      record.state = "preparing";
      record.preparationDeadlineMs = nowMs + CONTINUOUS_ROOM_PREPARATION_MS;
      record.participants = createParticipants(this.ids.create("human"), record.nick, record.characterId);
      record.serverRevision += 1;
      await this.persistReceipt(record, command.commandId, commandHash, nowMs);
      await this.scheduleNextAlarm(nowMs);
      return success(record);
    }

    if (command.type === "cancel-entry") {
      if (record.state === "cancelled") {
        await this.persistReceipt(record, command.commandId, commandHash, nowMs);
        return success(record);
      }
      if (record.state === "result") {
        return failure("invalid_state", "completed first round cannot be cancelled as entry", snapshotOf(record));
      }
      if (record.committed) {
        record.state = "compensating";
        record.serverRevision += 1;
        const startedAtMs = nowMs;
        record.participants = [];
        record.roomId = null;
        record.recoveryProofHash = null;
        record.preparationDeadlineMs = null;
        record.state = "cancelled";
        record.serverRevision += 1;
        record.compensation = { startedAtMs, completedAtMs: nowMs };
      } else {
        record.state = "cancelled";
        record.serverRevision += 1;
      }
      await this.persistReceipt(record, command.commandId, commandHash, nowMs);
      return success(record);
    }

    if (command.type === "input") {
      if ((record.state !== "preparing" && record.state !== "round") || !command.input || !command.inputSeq) {
        return failure("invalid_state", "input requires an active preparation or round", snapshotOf(record));
      }
      if (nowMs - record.inputBudget.windowStartedAtMs >= INPUT_WINDOW_MS) {
        record.inputBudget = { windowStartedAtMs: nowMs, count: 0 };
      }
      if (record.inputBudget.count >= INPUT_BUDGET_PER_WINDOW) {
        return failure("rate_limited", "input command budget exhausted", snapshotOf(record));
      }
      const inputHash = await sha256Canonical(command.input);
      const priorAck = record.inputAcks.find((ack) => ack.seq === command.inputSeq);
      if (priorAck) {
        return priorAck.inputHash === inputHash
          ? Object.freeze({ ok: true, replayed: true, snapshot: snapshotOf(record) })
          : failure("invalid_state", "inputSeq was already accepted with different input", snapshotOf(record));
      }
      if (command.inputSeq !== record.acceptedInputSeq + 1) {
        return failure("invalid_state", "inputSeq must be the next monotonic sequence", snapshotOf(record));
      }
      if (record.inputTotal >= INPUT_TOTAL_LIMIT) {
        return failure("rate_limited", "round input budget exhausted", snapshotOf(record));
      }
      const lastTimeline = record.inputTimeline.at(-1);
      if (lastTimeline?.inputHash === inputHash) {
        record.inputTimeline[record.inputTimeline.length - 1] = Object.freeze({
          ...lastTimeline,
          repeatCount: lastTimeline.repeatCount + 1,
        });
      } else {
        if (record.inputTimeline.length >= INPUT_ACK_LIMIT) {
          return failure("rate_limited", "distinct input transition budget exhausted", snapshotOf(record));
        }
        record.inputTimeline.push(Object.freeze({ inputHash, input: Object.freeze({ ...command.input }), repeatCount: 1 }));
      }
      record.inputBudget.count += 1;
      record.inputTotal += 1;
      record.input = Object.freeze({ ...command.input });
      record.acceptedInputSeq = command.inputSeq;
      record.serverRevision += 1;
      record.inputAcks.push(Object.freeze({ seq: command.inputSeq, inputHash, acceptedServerRevision: record.serverRevision }));
      record.inputAcks = record.inputAcks.slice(-INPUT_ACK_LIMIT);
      record.updatedAtMs = nowMs;
      await putRecord(this.storage, recordKey(record.operationId), record);
      return success(record);
    }

    if (command.type === "observe") {
      if ((record.state === "preparing" && record.preparationDeadlineMs !== null && nowMs >= record.preparationDeadlineMs)
        || record.state === "round") {
        record = await this.runFirstRound(record, nowMs);
      }
      record.updatedAtMs = nowMs;
      await putRecord(this.storage, recordKey(record.operationId), record);
      await this.scheduleNextAlarm(nowMs);
      return record.state === "failed"
        ? failure("round_failed", "authoritative first round failed", snapshotOf(record))
        : success(record);
    }

    return failure("invalid_command", "unsupported lifecycle command", snapshotOf(record));
  }

  async advanceDueSessions(nowMs = Date.now()): Promise<void> {
    const records = await this.storage.list<StoredRecord>({ prefix: RECORD_PREFIX });
    const due = [...records.entries()]
      .filter(([, record]) => record.state === "round"
        || (record.state === "preparing" && record.preparationDeadlineMs !== null && nowMs >= record.preparationDeadlineMs))
      .sort((left, right) => (left[1].preparationDeadlineMs ?? 0) - (right[1].preparationDeadlineMs ?? 0));
    const next = due[0];
    if (next) {
      const advanced = await this.runFirstRound(next[1], nowMs);
      await putRecord(this.storage, next[0], advanced);
    }
    await this.scheduleNextAlarm(nowMs);
  }

  private async recover(
    record: StoredRecord,
    command: ContinuousRoomCanaryCommand,
    commandHash: `sha256:${string}`,
    nowMs: number,
  ): Promise<ContinuousRoomCanaryResponse> {
    if (!record.committed || !record.recoveryProofHash || !command.recoveryToken || !command.nextRecoveryProofHash) {
      return failure("recovery_denied", "recovery proof is required", null);
    }
    if (nowMs - record.recoveryFailures.windowStartedAtMs >= RECOVERY_WINDOW_MS) {
      record.recoveryFailures = { windowStartedAtMs: nowMs, count: 0 };
    }
    if (record.recoveryFailures.count >= RECOVERY_FAILURE_BUDGET) {
      return failure("rate_limited", "recovery attempt budget exhausted", null);
    }
    const candidateHash = await sha256RecoveryToken(command.recoveryToken);
    if (!timingSafeEqual(candidateHash, record.recoveryProofHash)) {
      record.recoveryFailures.count += 1;
      await putRecord(this.storage, recordKey(record.operationId), record);
      return failure("recovery_denied", "recovery proof was rejected", null);
    }
    record.recoveryProofHash = command.nextRecoveryProofHash;
    record.recoveryFailures = { windowStartedAtMs: nowMs, count: 0 };
    record.serverRevision += 1;
    if (record.state === "preparing" && record.preparationDeadlineMs !== null && nowMs >= record.preparationDeadlineMs) {
      record = await this.runFirstRound(record, nowMs);
    }
    await this.persistReceipt(record, command.commandId, commandHash, nowMs);
    await this.scheduleNextAlarm(nowMs);
    return success(record);
  }

  private async runFirstRound(record: StoredRecord, nowMs: number): Promise<StoredRecord> {
    if (record.state !== "preparing" && record.state !== "round") return record;
    if (record.state === "preparing") {
      record.state = "round";
      record.serverRevision += 1;
      record.updatedAtMs = nowMs;
      await putRecord(this.storage, recordKey(record.operationId), record);
    }
    const characterIndex = Math.max(0, CANONICAL_CHARACTER_CATALOG.findIndex((character) => character.id === record.characterId));
    const inputSequenceScriptHash = await getRegisteredPolicyArtifactHash("input-sequence-v1");
    const segments = createInputSegments(record.inputTimeline);
    const inputSequenceConfigHash = await sha256Canonical({
      scriptId: "input-sequence-v1",
      scriptHash: inputSequenceScriptHash,
      scriptConfig: { segments },
    });
    const receipt = await runHeadlessRound({
      build: "continuous-room-canary.v1",
      ruleset: "classic-v1",
      arena: toArenaDefinition(getPublishedArenaMap(requireCitadelRef())),
      randomness: {
        randomnessMode: "seeded",
        requestedSeed: "continuous-room-first-round-v1",
        rngAlgorithm: "arena-seed-hash",
        rngVersion: "arena-runtime.v1",
        expectedInitialStateHash: INITIAL_STATE_HASHES[characterIndex] ?? INITIAL_STATE_HASHES[0],
      },
      activePlayerIds: [1, 2, 3, 4],
      characterSelections: { 1: characterIndex, 2: 1, 3: 2, 4: 3 },
      policies: [
        {
          id: "human-input-sequence",
          playerId: 1,
          mode: "registered",
          scriptId: "input-sequence-v1",
          scriptConfig: { segments },
          configHash: inputSequenceConfigHash,
        },
        { id: "completer-nara", playerId: 2, mode: "built-in" },
        { id: "completer-bento", playerId: 3, mode: "built-in" },
        { id: "completer-luma", playerId: 4, mode: "built-in" },
      ],
      maxSteps: 30_000,
      timeoutMs: 20_000,
      traceMode: "snapshot-trace-v1",
    });
    record.round = await projectRound(receipt);
    record.state = receipt.status === "complete" && receipt.terminalProof.valid
      && receipt.reproducibility.status === "verified" ? "result" : "failed";
    record.serverRevision += 1;
    record.updatedAtMs = nowMs;
    await putRecord(this.storage, recordKey(record.operationId), record);
    return record;
  }

  private async persistReceipt(
    record: StoredRecord,
    commandId: string,
    commandHash: `sha256:${string}`,
    nowMs: number,
  ): Promise<void> {
    record.receipts[commandId] = Object.freeze({ commandHash, snapshot: snapshotOf(record) });
    record.updatedAtMs = nowMs;
    await putRecord(this.storage, recordKey(record.operationId), record);
  }

  private async reserveCapacity(nowMs: number): Promise<boolean> {
    const records = await this.storage.list<StoredRecord>({ prefix: RECORD_PREFIX });
    for (const [key, record] of records) {
      const ttl = record.state === "prepared" ? PREPARED_TTL_MS
        : record.state === "cancelled" || record.state === "result" || record.state === "failed" ? TERMINAL_TTL_MS
          : Number.POSITIVE_INFINITY;
      if (nowMs - record.updatedAtMs > ttl) {
        await this.storage.delete?.(key);
        records.delete(key);
      }
    }
    const activeCount = [...records.values()].filter((record) => (
      record.state !== "cancelled" && record.state !== "result" && record.state !== "failed"
    )).length;
    return activeCount < SESSION_LIMIT;
  }

  private async scheduleNextAlarm(nowMs: number): Promise<void> {
    if (!this.storage.setAlarm) return;
    const records = await this.storage.list<StoredRecord>({ prefix: RECORD_PREFIX });
    const deadlines = [...records.values()].flatMap((record) => {
      if (record.state === "round") return [nowMs + 1];
      if (record.state === "preparing" && record.preparationDeadlineMs !== null) {
        return [Math.max(nowMs + 1, record.preparationDeadlineMs)];
      }
      return [];
    });
    if (deadlines.length > 0) await this.storage.setAlarm(Math.min(...deadlines));
  }
}

async function projectRound(receipt: HeadlessRoundReceipt): Promise<ContinuousRoomCanarySnapshot["round"]> {
  const entries = receipt.trace?.entries ?? [];
  const samples: ContinuousRoomRoundProjection[] = [];
  for (let index = 0; index < entries.length; index += Math.max(1, Math.ceil(entries.length / 24))) {
    const entry = entries[index];
    samples.push(Object.freeze({
      frame: entry.step,
      players: Object.freeze(Object.fromEntries(Object.entries(entry.players).map(([playerId, player]) => [
        playerId,
        Object.freeze({ alive: player.alive, x: player.tile.x, y: player.tile.y }),
      ]))),
    }));
  }
  const last = entries.at(-1);
  if (last && samples.at(-1)?.frame !== last.step) {
    samples.push(Object.freeze({
      frame: last.step,
      players: Object.freeze(Object.fromEntries(Object.entries(last.players).map(([playerId, player]) => [
        playerId,
        Object.freeze({ alive: player.alive, x: player.tile.x, y: player.tile.y }),
      ]))),
    }));
  }
  const receiptHash = await sha256Canonical({
    status: receipt.status,
    termination: receipt.termination,
    steps: receipt.steps,
    winner: receipt.winner,
    roundOutcome: receipt.roundOutcome,
    score: receipt.score,
    terminalProof: receipt.terminalProof,
    trace: receipt.trace,
  });
  return Object.freeze({
    status: receipt.status === "complete" ? "complete" : "failed",
    reproducibility: receipt.reproducibility.status === "verified" ? "verified" : "failed",
    winnerPlayerId: receipt.winner,
    reason: receipt.roundOutcome?.reason ?? (receipt.status === "complete" ? null : "runtime-failed"),
    steps: receipt.steps,
    snapshots: Object.freeze(samples),
    receiptHash,
  });
}

function createPreparedRecord(operationId: string, characterId: string, nick: string, nowMs: number): StoredRecord {
  return {
    version: 1,
    operationId,
    sessionId: null,
    roomId: null,
    serverRevision: 1,
    committed: false,
    state: "prepared",
    characterId,
    nick,
    preparationDeadlineMs: null,
    participants: [],
    acceptedInputSeq: 0,
    input: NEUTRAL_INPUT,
    inputTimeline: [],
    recoveryProofHash: null,
    recoveryFailures: { windowStartedAtMs: nowMs, count: 0 },
    inputBudget: { windowStartedAtMs: nowMs, count: 0 },
    inputAcks: [],
    inputTotal: 0,
    round: emptyRound(),
    receipts: {},
    compensation: null,
    updatedAtMs: nowMs,
  };
}

function createParticipants(humanId: string, nick: string, characterId: string): ContinuousRoomParticipant[] {
  const character = (index: number) => CANONICAL_CHARACTER_CATALOG[index]?.id ?? characterId;
  return [
    Object.freeze({ playerId: 1, identityId: humanId, displayName: nick, characterId, kind: "human", profileId: "visitor" }),
    Object.freeze({ playerId: 2, identityId: "completer:nara", displayName: "Nara", characterId: character(1), kind: "completer", profileId: "nara" }),
    Object.freeze({ playerId: 3, identityId: "completer:bento", displayName: "Bento", characterId: character(3), kind: "completer", profileId: "bento" }),
    Object.freeze({ playerId: 4, identityId: "completer:luma", displayName: "Luma", characterId: character(2), kind: "completer", profileId: "luma" }),
  ];
}

function emptyRound(): ContinuousRoomCanarySnapshot["round"] {
  return Object.freeze({ status: "not-started", reproducibility: "pending", winnerPlayerId: null, reason: null, steps: 0, snapshots: [], receiptHash: null });
}

function snapshotOf(record: StoredRecord): ContinuousRoomCanarySnapshot {
  return Object.freeze({
    protocol: CONTINUOUS_ROOM_CANARY_PROTOCOL,
    operationId: record.operationId,
    sessionId: record.sessionId,
    serverRevision: record.serverRevision,
    committed: record.committed,
    state: record.state,
    roomId: record.roomId,
    preparationDeadlineMs: record.preparationDeadlineMs,
    participants: Object.freeze(record.participants.map((participant) => Object.freeze({ ...participant }))),
    acceptedInputSeq: record.acceptedInputSeq,
    round: Object.freeze({ ...record.round, snapshots: Object.freeze([...record.round.snapshots]) }),
  });
}

function success(record: StoredRecord): ContinuousRoomCanaryResponse {
  return Object.freeze({ ok: true, replayed: false, snapshot: snapshotOf(record) });
}

function failure(
  code: Extract<ContinuousRoomCanaryResponse, { ok: false }>["code"],
  message: string,
  snapshot: ContinuousRoomCanarySnapshot | null,
): ContinuousRoomCanaryResponse {
  return Object.freeze({ ok: false, code, message, snapshot });
}

function recordKey(operationId: string): string {
  return `${RECORD_PREFIX}${operationId}`;
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function defaultIds(): Readonly<{ create(kind: "session" | "room" | "human"): string }> {
  return Object.freeze({ create: (kind: "session" | "room" | "human") => `${kind}_${crypto.randomUUID().replaceAll("-", "")}` });
}

async function putRecord(storage: ContinuousRoomCanaryStorage, key: string, record: StoredRecord): Promise<void> {
  const serializedBytes = new TextEncoder().encode(JSON.stringify(record)).byteLength;
  if (serializedBytes > MAX_SERIALIZED_RECORD_BYTES) {
    throw new Error("continuous room record exceeds 256 KiB storage budget");
  }
  await storage.put(key, record);
}

function requireCitadelRef() {
  const ref = listPublishedArenaMaps().find((candidate) => candidate.id === "cidadela-arcana" && candidate.revision === "r1");
  if (!ref) throw new Error("Cidadela Arcana r1 is not published");
  return ref;
}

function createInputSegments(
  timeline: StoredRecord["inputTimeline"],
): readonly Readonly<{ untilStep: number; input: OnlineInputState }>[] {
  const source: readonly Readonly<{ input: OnlineInputState }>[] = timeline.length > 0
    ? timeline
    : [Object.freeze({ input: NEUTRAL_INPUT })];
  return Object.freeze(source.map((entry, index) => Object.freeze({
    untilStep: Math.max(1, Math.floor(((index + 1) * 30_000) / source.length)),
    input: Object.freeze({ ...entry.input }),
  })));
}
