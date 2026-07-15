import {
  runHeadlessRound,
  type HeadlessRoundReceipt,
  type HeadlessRoundRunConfig,
} from "./headless-round-runner";
import type { PlayerId } from "../Gameplay/types";

export type HeadlessSeriesStatus = "complete" | "cancelled-partial" | "failed-partial";
export type HeadlessSeriesPhase =
  | "running"
  | "pause-requested"
  | "paused"
  | "cancel-requested"
  | "complete"
  | "cancelled-partial"
  | "failed-partial";
export type HeadlessSeriesCommand = "pause" | "resume" | "cancel";

export interface HeadlessSeriesSpawn {
  playerId: PlayerId;
  spawnIndex: number;
}

export interface HeadlessSeriesRoundSpec extends Omit<HeadlessRoundRunConfig, "randomness"> {
  id: string;
  randomness: {
    requestedSeed: null;
    expectedInitialStateHash: `sha256:${string}`;
  };
  spawnPlan: readonly HeadlessSeriesSpawn[];
}

export interface HeadlessSeriesSpec {
  id: string;
  rounds: readonly HeadlessSeriesRoundSpec[];
  limits: {
    maxRounds: number;
    maxTotalSteps: number;
    timeoutMs: number;
  };
  control: {
    pause: "between-rounds";
    cancellation: "between-rounds";
  };
}

export interface HeadlessSeriesRoundReceipt {
  id: string;
  requestedSeed: null;
  spawnPlan: readonly HeadlessSeriesSpawn[];
  receipt: HeadlessRoundReceipt;
}

export interface HeadlessSeriesReceipt {
  id: string;
  status: HeadlessSeriesStatus;
  termination:
    | "all-rounds-complete"
    | "cancelled"
    | "round-failed"
    | "series-budget"
    | "series-timeout"
    | "error";
  completedRounds: number;
  totalSteps: number;
  rounds: readonly HeadlessSeriesRoundReceipt[];
  error?: string;
}

export interface HeadlessSeriesSnapshot {
  id: string;
  revision: number;
  phase: HeadlessSeriesPhase;
  currentRoundIndex: number | null;
  completedRounds: number;
  totalRounds: number;
  totalSteps: number;
}

export interface HeadlessSeriesRun {
  readonly result: Promise<HeadlessSeriesReceipt>;
  getSnapshot(): Readonly<HeadlessSeriesSnapshot>;
  subscribe(listener: (snapshot: Readonly<HeadlessSeriesSnapshot>) => void): () => void;
  dispatch(command: HeadlessSeriesCommand): void;
}

export interface HeadlessSeriesDependencies {
  now?: () => number;
  yieldControl?: () => Promise<void>;
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child, seen);
  }
  return Object.freeze(value);
}

function cloneFrozen<T>(value: T): T {
  const clone = typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)) as T;
  return deepFreeze(clone);
}

function requirePositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function validateRound(round: HeadlessSeriesRoundSpec): void {
  if (!round.id.trim()) throw new Error("round.id is required");
  if (round.randomness.requestedSeed !== null) {
    throw new Error("requestedSeed must be null until seeded randomness is implemented");
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(round.randomness.expectedInitialStateHash)) {
    throw new Error("expectedInitialStateHash must be sha256:<64 lowercase hex>");
  }
  if (round.spawnPlan.length !== round.activePlayerIds.length) {
    throw new Error(`round ${round.id} must provide one spawn for each active player`);
  }
  const players = new Set<PlayerId>();
  for (const spawn of round.spawnPlan) {
    if (!round.activePlayerIds.includes(spawn.playerId) || players.has(spawn.playerId)) {
      throw new Error(`round ${round.id} has an invalid or duplicate spawn player`);
    }
    if (spawn.spawnIndex !== spawn.playerId - 1 || !round.arena.spawns[spawn.spawnIndex]) {
      throw new Error(`round ${round.id} spawn plan does not match the authoritative arena mapping`);
    }
    players.add(spawn.playerId);
  }
}

function validateSpec(spec: HeadlessSeriesSpec): void {
  if (!spec.id.trim()) throw new Error("series.id is required");
  if (!Array.isArray(spec.rounds) || spec.rounds.length === 0) {
    throw new Error("series.rounds must contain at least one round");
  }
  requirePositiveInteger(spec.limits.maxRounds, "limits.maxRounds");
  requirePositiveInteger(spec.limits.maxTotalSteps, "limits.maxTotalSteps");
  if (!(spec.limits.timeoutMs > 0) || !Number.isFinite(spec.limits.timeoutMs)) {
    throw new Error("limits.timeoutMs must be positive");
  }
  if (spec.rounds.length > spec.limits.maxRounds) {
    throw new Error("series.rounds exceeds limits.maxRounds");
  }
  if (spec.control.pause !== "between-rounds" || spec.control.cancellation !== "between-rounds") {
    throw new Error("pause and cancellation must use between-rounds control");
  }
  const roundIds = new Set<string>();
  for (const round of spec.rounds) {
    validateRound(round);
    if (roundIds.has(round.id)) throw new Error(`duplicate round id: ${round.id}`);
    roundIds.add(round.id);
  }
}

function captureSpec(spec: HeadlessSeriesSpec): Readonly<HeadlessSeriesSpec> {
  validateSpec(spec);
  const clone = {
    id: spec.id,
    limits: { ...spec.limits },
    control: { ...spec.control },
    rounds: spec.rounds.map((round) => ({
      ...round,
      arena: typeof structuredClone === "function"
        ? structuredClone(round.arena)
        : JSON.parse(JSON.stringify(round.arena)),
      randomness: { ...round.randomness },
      spawnPlan: round.spawnPlan.map((spawn) => ({ ...spawn })),
      activePlayerIds: [...round.activePlayerIds],
      characterSelections: round.characterSelections ? { ...round.characterSelections } : undefined,
      policies: round.policies.map((policy) => ({ ...policy })),
    })),
  } as HeadlessSeriesSpec;
  validateSpec(clone);
  return deepFreeze(clone);
}

function roundConfig(
  round: HeadlessSeriesRoundSpec,
  maxSteps: number,
  timeoutMs: number,
): HeadlessRoundRunConfig {
  return {
    build: round.build,
    ruleset: round.ruleset,
    arena: round.arena,
    randomness: {
      randomnessMode: "deterministic",
      expectedInitialStateHash: round.randomness.expectedInitialStateHash,
    },
    activePlayerIds: [...round.activePlayerIds],
    characterSelections: round.characterSelections,
    policies: [...round.policies],
    maxSteps,
    timeoutMs,
    allowUnsafeInlineExternalPolicies: round.allowUnsafeInlineExternalPolicies,
  };
}

function safeErrorMessage(error: unknown): string {
  try {
    return error instanceof Error ? error.message : String(error);
  } catch {
    return "Unknown series coordinator error";
  }
}

export function runHeadlessSeries(
  spec: HeadlessSeriesSpec,
  dependencies: HeadlessSeriesDependencies = {},
): HeadlessSeriesRun {
  const plan = captureSpec(spec);
  const now = dependencies.now ?? (() => Date.now());
  const yieldControl = dependencies.yieldControl ?? (() => new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  }));
  const startedAt = now();
  const listeners = new Set<(snapshot: Readonly<HeadlessSeriesSnapshot>) => void>();
  let cancelRequested = false;
  let pauseRequested = false;
  let resumeWaiter: (() => void) | null = null;
  let snapshot: HeadlessSeriesSnapshot = {
    id: plan.id,
    revision: 0,
    phase: "running",
    currentRoundIndex: null,
    completedRounds: 0,
    totalRounds: plan.rounds.length,
    totalSteps: 0,
  };

  const publish = (next: HeadlessSeriesSnapshot): void => {
    snapshot = { ...next, revision: snapshot.revision + 1 };
    const observation = cloneFrozen(snapshot);
    for (const listener of listeners) {
      try {
        listener(observation);
      } catch {
        // Observers cannot alter or fail the series execution.
      }
    }
  };

  const cancelledReceipt = (rounds: HeadlessSeriesRoundReceipt[]): HeadlessSeriesReceipt => {
    publish({ ...snapshot, phase: "cancelled-partial", currentRoundIndex: null });
    return cloneFrozen({
      id: plan.id,
      status: "cancelled-partial",
      termination: "cancelled",
      completedRounds: snapshot.completedRounds,
      totalSteps: snapshot.totalSteps,
      rounds,
    });
  };

  const failedReceipt = (
    rounds: HeadlessSeriesRoundReceipt[],
    termination: "round-failed" | "series-budget" | "series-timeout" | "error",
    error: string,
  ): HeadlessSeriesReceipt => {
    publish({ ...snapshot, phase: "failed-partial", currentRoundIndex: null });
    return cloneFrozen({
      id: plan.id,
      status: "failed-partial",
      termination,
      completedRounds: snapshot.completedRounds,
      totalSteps: snapshot.totalSteps,
      rounds,
      error,
    });
  };

  const waitWhilePaused = async (): Promise<"resumed" | "cancelled" | "timed-out"> => {
    if (cancelRequested) return "cancelled";
    if (!pauseRequested) return "resumed";
    const remainingTimeoutMs = plan.limits.timeoutMs - Math.max(0, now() - startedAt);
    if (remainingTimeoutMs <= 0) return "timed-out";
    return new Promise((resolve) => {
      let settled = false;
      const finish = (outcome: "resumed" | "cancelled" | "timed-out"): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resumeWaiter = null;
        resolve(outcome);
      };
      const timeout = setTimeout(() => finish("timed-out"), remainingTimeoutMs);
      resumeWaiter = () => finish(cancelRequested ? "cancelled" : "resumed");
      publish({ ...snapshot, phase: "paused", currentRoundIndex: null });
      if (cancelRequested) finish("cancelled");
      else if (!pauseRequested) finish("resumed");
    });
  };

  const rounds: HeadlessSeriesRoundReceipt[] = [];
  const result = (async (): Promise<HeadlessSeriesReceipt> => {
    try {
      for (let index = 0; index < plan.rounds.length; index += 1) {
        const pauseOutcome = await waitWhilePaused();
        if (pauseOutcome === "timed-out") {
          return failedReceipt(rounds, "series-timeout", "series_runner_timeout");
        }
        if (pauseOutcome === "cancelled" || cancelRequested) return cancelledReceipt(rounds);
        const round = plan.rounds[index];
        const remainingSteps = plan.limits.maxTotalSteps - snapshot.totalSteps;
        if (remainingSteps <= 0) {
          return failedReceipt(rounds, "series-budget", "series_tick_budget_exhausted");
        }
        const remainingTimeoutMs = plan.limits.timeoutMs - Math.max(0, now() - startedAt);
        if (remainingTimeoutMs <= 0) {
          return failedReceipt(rounds, "series-timeout", "series_runner_timeout");
        }
        const requestedRoundSteps = round.maxSteps ?? 30_000;
        const appliedRoundSteps = Math.min(requestedRoundSteps, remainingSteps);
        const appliedRoundTimeoutMs = Math.min(round.timeoutMs ?? 30_000, remainingTimeoutMs);
        publish({ ...snapshot, phase: "running", currentRoundIndex: index });
        const receipt = await runHeadlessRound(roundConfig(round, appliedRoundSteps, appliedRoundTimeoutMs));
        rounds.push(cloneFrozen({
          id: round.id,
          requestedSeed: null,
          spawnPlan: [...round.spawnPlan],
          receipt,
        }));
        publish({
          ...snapshot,
          completedRounds: receipt.status === "complete" ? snapshot.completedRounds + 1 : snapshot.completedRounds,
          totalSteps: snapshot.totalSteps + receipt.steps,
        });
        if (receipt.status !== "complete") {
          if (
            receipt.status === "timeout"
            && receipt.termination === "max-steps"
            && appliedRoundSteps < requestedRoundSteps
            && snapshot.totalSteps >= plan.limits.maxTotalSteps
          ) {
            return failedReceipt(rounds, "series-budget", "series_tick_budget_exhausted");
          }
          if (
            receipt.status === "timeout"
            && receipt.termination === "wall-clock"
            && appliedRoundTimeoutMs < (round.timeoutMs ?? 30_000)
          ) {
            return failedReceipt(rounds, "series-timeout", "series_runner_timeout");
          }
          return failedReceipt(
            rounds,
            "round-failed",
            receipt.error ?? `round_${receipt.status}:${receipt.termination}`,
          );
        }
        if (index < plan.rounds.length - 1) {
          await yieldControl();
        }
      }
      publish({ ...snapshot, phase: "complete", currentRoundIndex: null });
      return cloneFrozen({
        id: plan.id,
        status: "complete",
        termination: "all-rounds-complete",
        completedRounds: snapshot.completedRounds,
        totalSteps: snapshot.totalSteps,
        rounds,
      });
    } catch (error) {
      return failedReceipt(rounds, "error", safeErrorMessage(error));
    }
  })();

  return {
    result,
    getSnapshot: () => cloneFrozen(snapshot),
    subscribe: (listener) => {
      listeners.add(listener);
      listener(cloneFrozen(snapshot));
      return () => listeners.delete(listener);
    },
    dispatch: (command) => {
      if (command === "pause") {
        if (snapshot.phase !== "running") return;
        pauseRequested = true;
        publish({ ...snapshot, phase: "pause-requested" });
        return;
      }
      if (command === "resume") {
        if (!pauseRequested) return;
        pauseRequested = false;
        publish({ ...snapshot, phase: "running" });
        resumeWaiter?.();
        return;
      }
      if (command === "cancel") {
        if (
          snapshot.phase === "complete"
          || snapshot.phase === "cancelled-partial"
          || snapshot.phase === "failed-partial"
        ) return;
        cancelRequested = true;
        pauseRequested = false;
        publish({ ...snapshot, phase: "cancel-requested" });
        resumeWaiter?.();
        return;
      }
      throw new Error(`unsupported series command: ${String(command)}`);
    },
  };
}
