import type { OnlineInputState } from "../NetCode/protocol";

export const CONTINUOUS_ROOM_CANARY_PROTOCOL = "continuous-room.lifecycle.v1" as const;
export const CONTINUOUS_ROOM_CANARY_ROUTE = "/api/canonical/continuous-room/canary/commands" as const;
export const CONTINUOUS_ROOM_PREPARATION_MS = 5_000 as const;

export type ContinuousRoomCanaryCommandType =
  | "prepare-entry"
  | "commit-entry"
  | "cancel-entry"
  | "input"
  | "observe"
  | "recover";

export type ContinuousRoomParticipant = Readonly<{
  playerId: 1 | 2 | 3 | 4;
  identityId: string;
  displayName: string;
  characterId: string;
  kind: "human" | "completer";
  profileId: "visitor" | "nara" | "bento" | "luma";
}>;

export type ContinuousRoomRoundProjection = Readonly<{
  frame: number;
  players: Readonly<Record<string, Readonly<{ alive: boolean; x: number; y: number }>>>;
}>;

export type ContinuousRoomCanarySnapshot = Readonly<{
  protocol: typeof CONTINUOUS_ROOM_CANARY_PROTOCOL;
  operationId: string;
  sessionId: string | null;
  serverRevision: number;
  committed: boolean;
  state: "prepared" | "preparing" | "round" | "result" | "compensating" | "cancelled" | "failed";
  roomId: string | null;
  preparationDeadlineMs: number | null;
  participants: readonly ContinuousRoomParticipant[];
  acceptedInputSeq: number;
  round: Readonly<{
    status: "not-started" | "running" | "complete" | "failed";
    reproducibility: "pending" | "verified" | "failed";
    winnerPlayerId: 1 | 2 | 3 | 4 | null;
    reason: string | null;
    steps: number;
    snapshots: readonly ContinuousRoomRoundProjection[];
    receiptHash: `sha256:${string}` | null;
  }>;
}>;

export type ContinuousRoomCanaryCommand = Readonly<{
  protocol: typeof CONTINUOUS_ROOM_CANARY_PROTOCOL;
  operationId: string;
  commandId: string;
  expectedServerRevision: number;
  type: ContinuousRoomCanaryCommandType;
  sessionId?: string;
  recoveryToken?: string;
  characterId?: string;
  nick?: string;
  inputSeq?: number;
  input?: OnlineInputState;
  recoveryProofHash?: `sha256:${string}`;
  nextRecoveryProofHash?: `sha256:${string}`;
}>;

export type ContinuousRoomCanaryResponse = Readonly<{
  ok: true;
  replayed: boolean;
  snapshot: ContinuousRoomCanarySnapshot;
}> | Readonly<{
  ok: false;
  code: "invalid_command" | "not_found" | "stale_revision" | "command_conflict" | "invalid_state" | "recovery_denied" | "rate_limited" | "round_failed";
  message: string;
  snapshot: ContinuousRoomCanarySnapshot | null;
}>;

export function isContinuousRoomCanarySnapshot(value: unknown): value is ContinuousRoomCanarySnapshot {
  if (!isRecord(value)) return false;
  return value.protocol === CONTINUOUS_ROOM_CANARY_PROTOCOL
    && typeof value.operationId === "string"
    && Number.isInteger(value.serverRevision)
    && typeof value.state === "string"
    && typeof value.committed === "boolean"
    && Array.isArray(value.participants)
    && isRecord(value.round);
}

export function parseContinuousRoomCanaryCommand(value: unknown): ContinuousRoomCanaryCommand {
  if (!isRecord(value) || value.protocol !== CONTINUOUS_ROOM_CANARY_PROTOCOL) {
    throw new Error("protocol must be continuous-room.lifecycle.v1");
  }
  const operationId = opaqueId(value.operationId, "operationId");
  const commandId = opaqueId(value.commandId, "commandId");
  if (!Number.isInteger(value.expectedServerRevision) || (value.expectedServerRevision as number) < 0) {
    throw new Error("expectedServerRevision must be a non-negative integer");
  }
  const allowed = new Set<ContinuousRoomCanaryCommandType>([
    "prepare-entry", "commit-entry", "cancel-entry", "input", "observe", "recover",
  ]);
  if (typeof value.type !== "string" || !allowed.has(value.type as ContinuousRoomCanaryCommandType)) {
    throw new Error("type is not a supported lifecycle command");
  }
  const knownFields = new Set([
    "protocol", "operationId", "commandId", "expectedServerRevision", "type", "sessionId", "recoveryToken",
    "characterId", "nick", "inputSeq", "input", "recoveryProofHash", "nextRecoveryProofHash",
  ]);
  const unknownField = Object.keys(value).find((field) => !knownFields.has(field));
  if (unknownField) throw new Error(`unknown lifecycle command field: ${unknownField}`);
  const optionalId = (candidate: unknown, label: string): string | undefined => candidate === undefined
    ? undefined
    : opaqueId(candidate, label);
  const inputSeq = value.inputSeq === undefined ? undefined : value.inputSeq;
  if (inputSeq !== undefined && (!Number.isInteger(inputSeq) || (inputSeq as number) < 1)) {
    throw new Error("inputSeq must be a positive integer");
  }
  return Object.freeze({
    protocol: CONTINUOUS_ROOM_CANARY_PROTOCOL,
    operationId,
    commandId,
    expectedServerRevision: value.expectedServerRevision as number,
    type: value.type as ContinuousRoomCanaryCommandType,
    ...(optionalId(value.sessionId, "sessionId") ? { sessionId: optionalId(value.sessionId, "sessionId") } : {}),
    ...(optionalId(value.recoveryToken, "recoveryToken") ? { recoveryToken: optionalId(value.recoveryToken, "recoveryToken") } : {}),
    ...(typeof value.characterId === "string" ? { characterId: value.characterId.slice(0, 80) } : {}),
    ...(typeof value.nick === "string" ? { nick: value.nick.trim().slice(0, 16) } : {}),
    ...(inputSeq === undefined ? {} : { inputSeq: inputSeq as number }),
    ...(isOnlineInput(value.input) ? { input: Object.freeze({ ...value.input }) } : {}),
    ...(isSha256(value.recoveryProofHash) ? { recoveryProofHash: value.recoveryProofHash } : {}),
    ...(isSha256(value.nextRecoveryProofHash) ? { nextRecoveryProofHash: value.nextRecoveryProofHash } : {}),
  });
}

function isSha256(value: unknown): value is `sha256:${string}` {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
}

function opaqueId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) {
    throw new Error(`${label} must be an opaque identifier`);
  }
  return value;
}

function isOnlineInput(value: unknown): value is OnlineInputState {
  if (!isRecord(value)) return false;
  return (value.direction === null || value.direction === "up" || value.direction === "down"
      || value.direction === "left" || value.direction === "right")
    && typeof value.bombPressed === "boolean"
    && typeof value.detonatePressed === "boolean"
    && typeof value.skillPressed === "boolean"
    && typeof value.skillHeld === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
