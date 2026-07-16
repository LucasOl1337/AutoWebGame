export type EntityId = string | number;

export type EvidenceValue =
  | string
  | number
  | boolean
  | null
  | readonly EvidenceValue[]
  | { readonly [key: string]: EvidenceValue };

export type ControllerKind = "deterministic" | "preset" | "model" | "hybrid" | "safety";
export type PolicyFamily = Exclude<ControllerKind, "safety">;

export interface ControllerIdentity {
  readonly id: string;
  readonly kind: ControllerKind;
  readonly version: string;
  readonly provider?: string;
  readonly model?: string;
}

export interface ControllerProvenance {
  readonly requester: ControllerIdentity;
  readonly safety: ControllerIdentity | null;
  readonly executor: ControllerIdentity | null;
}

export interface VersionedArtifact {
  readonly id: string;
  readonly version: string;
}

export interface BuildDescriptor extends VersionedArtifact {
  readonly revision?: string;
  readonly artifactHash?: string;
}

export interface PolicyDescriptor extends VersionedArtifact {
  readonly family: PolicyFamily;
  readonly parametersHash?: string;
}

export interface RoundMetadata {
  readonly roundId: string;
  readonly build: BuildDescriptor;
  readonly ruleset: VersionedArtifact;
  readonly arena: VersionedArtifact;
  readonly seed: string | number;
  readonly policy: PolicyDescriptor;
}

export interface BotAction {
  readonly kind: string;
  readonly parameters?: Readonly<Record<string, EvidenceValue>>;
}

export type SafetyVerdict = "allow" | "replace" | "block" | "invalid";

export interface SafetyDecisionInput {
  readonly verdict: SafetyVerdict;
  readonly reasonCode?: string;
}

export interface SafetyDecision {
  readonly verdict: SafetyVerdict;
  readonly reasonCode: string | null;
}

export type ActionOutcomeStatus = "executed" | "blocked" | "stalled" | "invalid" | "skipped" | "timeout";

export interface ActionOutcomeInput {
  readonly status: ActionOutcomeStatus;
  readonly reasonCode?: string;
  /** True when a different controller supplied the action after the primary controller failed. */
  readonly fallbackUsed?: boolean;
  /** Can accompany an executed fallback, so timeout is not encoded only in status. */
  readonly timedOut?: boolean;
}

export interface ActionOutcome {
  readonly status: ActionOutcomeStatus;
  readonly reasonCode: string | null;
  readonly fallbackUsed: boolean;
  readonly timedOut: boolean;
}

interface RoundEventBase {
  /** Contiguous sequence assigned by the round runner; required for canonical event ordering. */
  readonly sequence: number;
  readonly tick: number;
}

export type DeathCause = "bomb-blast" | "sudden-death" | "environment" | "disconnect" | "unknown";
export type DeathAttribution = "complete" | "partial" | "unknown";

export interface DeathEventInput extends RoundEventBase {
  readonly victimId: EntityId;
  readonly cause: DeathCause;
  readonly sourcePlayerId?: EntityId | null;
  readonly sourceBombId?: EntityId | null;
}

export interface DeathEvent extends RoundEventBase {
  readonly type: "death";
  readonly victimId: EntityId;
  readonly cause: DeathCause;
  readonly sourcePlayerId: EntityId | null;
  readonly sourceBombId: EntityId | null;
  readonly attribution: DeathAttribution;
  readonly selfKo: true | false | null;
}

export interface ActionEventInput extends RoundEventBase {
  readonly playerId: EntityId;
  readonly requestedAction: BotAction | null;
  readonly safetyDecision: SafetyDecisionInput;
  readonly executedAction: BotAction | null;
  readonly outcome: ActionOutcomeInput;
  readonly provenance: ControllerProvenance;
}

export interface ActionEvent extends RoundEventBase {
  readonly type: "action";
  readonly playerId: EntityId;
  readonly requestedAction: BotAction | null;
  readonly safetyDecision: SafetyDecision;
  readonly executedAction: BotAction | null;
  readonly outcome: ActionOutcome;
  readonly provenance: ControllerProvenance;
}

export interface RoundCompletedEventInput extends RoundEventBase {
  readonly reason: string;
  readonly winnerIds?: readonly EntityId[];
}

export interface RoundCompletedEvent extends RoundEventBase {
  readonly type: "round-completed";
  readonly reason: string;
  readonly winnerIds: readonly EntityId[];
}

export type RoundEvidenceEvent = DeathEvent | ActionEvent | RoundCompletedEvent;

export interface RoundEvidenceCounters {
  readonly completedRounds: 0 | 1;
  readonly deaths: number;
  readonly selfKOs: number;
  readonly selfKoUnknown: number;
  readonly actions: number;
  readonly invalidActions: number;
  readonly fallbackActions: number;
  readonly timeouts: number;
  readonly blockedActions: number;
  readonly stalledActions: number;
  readonly deathsByCause: Readonly<Record<DeathCause, number>>;
}

export interface RoundEvidence {
  readonly metadata: RoundMetadata;
  readonly events: readonly RoundEvidenceEvent[];
  readonly counters: RoundEvidenceCounters;
}

function immutableSnapshot<T>(value: T): T {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => immutableSnapshot(item))) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const snapshot: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      snapshot[key] = immutableSnapshot(nestedValue);
    }
    return Object.freeze(snapshot) as T;
  }
  return value;
}

export function recordDeath(input: DeathEventInput): DeathEvent {
  const isBombBlast = input.cause === "bomb-blast";
  const sourcePlayerId = isBombBlast ? input.sourcePlayerId ?? null : null;
  const sourceBombId = isBombBlast ? input.sourceBombId ?? null : null;
  const hasSourcePlayer = sourcePlayerId !== null;
  const hasSourceBomb = sourceBombId !== null;
  const attribution: DeathAttribution = !isBombBlast || (!hasSourcePlayer && !hasSourceBomb)
    ? "unknown"
    : hasSourcePlayer && hasSourceBomb
      ? "complete"
      : "partial";
  const selfKo = !isBombBlast
    ? false
    : attribution === "complete"
      ? sourcePlayerId === input.victimId
      : null;

  return immutableSnapshot({
    type: "death",
    sequence: input.sequence,
    tick: input.tick,
    victimId: input.victimId,
    cause: input.cause,
    sourcePlayerId,
    sourceBombId,
    attribution,
    selfKo,
  });
}

export function recordAction(input: ActionEventInput): ActionEvent {
  return immutableSnapshot({
    type: "action",
    sequence: input.sequence,
    tick: input.tick,
    playerId: input.playerId,
    requestedAction: input.requestedAction,
    safetyDecision: {
      verdict: input.safetyDecision.verdict,
      reasonCode: input.safetyDecision.reasonCode ?? null,
    },
    executedAction: input.executedAction,
    outcome: {
      status: input.outcome.status,
      reasonCode: input.outcome.reasonCode ?? null,
      fallbackUsed: input.outcome.fallbackUsed ?? false,
      timedOut: input.outcome.timedOut ?? input.outcome.status === "timeout",
    },
    provenance: input.provenance,
  });
}

export function recordRoundCompleted(input: RoundCompletedEventInput): RoundCompletedEvent {
  return immutableSnapshot({
    type: "round-completed",
    sequence: input.sequence,
    tick: input.tick,
    reason: input.reason,
    winnerIds: input.winnerIds ?? [],
  });
}

function canonicalizeEvents(events: readonly RoundEvidenceEvent[]): RoundEvidenceEvent[] {
  const seenSequences = new Set<number>();
  for (const event of events) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
      throw new Error(`Round evidence sequence must be a non-negative safe integer: ${event.sequence}`);
    }
    if (seenSequences.has(event.sequence)) {
      throw new Error(`Duplicate round evidence sequence: ${event.sequence}`);
    }
    seenSequences.add(event.sequence);
    if (!Number.isSafeInteger(event.tick) || event.tick < 0) {
      throw new Error(`Round evidence tick must be a non-negative safe integer: ${event.tick}`);
    }
  }

  const canonicalEvents = [...events].sort((left, right) => left.sequence - right.sequence);
  let previousTick = -1;
  let completed = false;
  for (const [index, event] of canonicalEvents.entries()) {
    if (event.sequence !== index) {
      throw new Error(`Round evidence sequence gap: expected ${index}, received ${event.sequence}`);
    }
    if (event.tick < previousTick) {
      throw new Error(`Round evidence tick regressed at sequence ${event.sequence}: ${event.tick} < ${previousTick}`);
    }
    previousTick = event.tick;

    if (event.type === "round-completed") {
      if (completed) {
        throw new Error("Duplicate round-completed event");
      }
      completed = true;
      continue;
    }
    if (completed) {
      throw new Error(`Round evidence event after completion at sequence ${event.sequence}`);
    }
  }

  return canonicalEvents;
}

export function aggregateRoundEvidence(
  metadata: RoundMetadata,
  events: readonly RoundEvidenceEvent[],
): RoundEvidence {
  const canonicalEvents = canonicalizeEvents(events);
  const deathsByCause: Record<DeathCause, number> = {
    "bomb-blast": 0,
    "sudden-death": 0,
    environment: 0,
    disconnect: 0,
    unknown: 0,
  };
  let completedRounds: 0 | 1 = 0;
  let deaths = 0;
  let selfKOs = 0;
  let selfKoUnknown = 0;
  let actions = 0;
  let invalidActions = 0;
  let fallbackActions = 0;
  let timeouts = 0;
  let blockedActions = 0;
  let stalledActions = 0;

  for (const event of canonicalEvents) {
    if (event.type === "round-completed") {
      completedRounds = 1;
      continue;
    }
    if (event.type === "death") {
      deaths += 1;
      selfKOs += event.selfKo ? 1 : 0;
      selfKoUnknown += event.selfKo === null ? 1 : 0;
      deathsByCause[event.cause] += 1;
      continue;
    }

    actions += 1;
    const invalid = event.safetyDecision.verdict === "invalid" || event.outcome.status === "invalid";
    const blocked = event.safetyDecision.verdict === "block" || event.outcome.status === "blocked";
    invalidActions += invalid ? 1 : 0;
    fallbackActions += event.outcome.fallbackUsed ? 1 : 0;
    timeouts += event.outcome.timedOut || event.outcome.status === "timeout" ? 1 : 0;
    blockedActions += blocked ? 1 : 0;
    stalledActions += event.outcome.status === "stalled" ? 1 : 0;
  }

  return immutableSnapshot({
    metadata,
    events: canonicalEvents,
    counters: {
      completedRounds,
      deaths,
      selfKOs,
      selfKoUnknown,
      actions,
      invalidActions,
      fallbackActions,
      timeouts,
      blockedActions,
      stalledActions,
      deathsByCause,
    },
  });
}
