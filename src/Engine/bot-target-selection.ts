import type { PlayerId } from "../Gameplay/types";

export type BotTargetDefenseState = "exposed" | "shielded" | "protected";

export interface BotTargetCandidateSignal {
  targetId: PlayerId;
  distanceSteps: number;
  openEscapeRoutes: number;
  defenseState: BotTargetDefenseState;
  bombCapacityCommitted: boolean;
  commitmentRemainingMs: number | null;
  score: number;
  reasonCode:
    | "exposed-capacity-committed"
    | "exposed-contained"
    | "nearest-exposed"
    | "shielded-fallback"
    | "protected-fallback";
}

export interface BotTargetCandidateInput {
  targetId: PlayerId;
  distanceSteps: number;
  openEscapeRoutes: number;
  spawnProtectionMs: number;
  flameGuardMs: number;
  shieldCharges: number;
  activeBombs: number;
  maxBombs: number;
  remoteLevel: number;
  soonestOwnedBombFuseMs: number | null;
}

export interface BotTargetSelectionSignal {
  selected: BotTargetCandidateSignal | null;
  candidates: BotTargetCandidateSignal[];
}

const TARGET_PROTECTION_PENALTY = 1_000;
const TARGET_SHIELD_PENALTY = 4;
const TARGET_OPEN_ROUTE_PENALTY = 0.5;
const TARGET_COMMITTED_CAPACITY_BONUS = 1.5;
const TARGET_COMMITMENT_MIN_MS = 500;

export function evaluateBotTargetCandidate(input: BotTargetCandidateInput): BotTargetCandidateSignal {
  const shieldCharges = Math.max(0, input.shieldCharges || 0);
  const activeBombs = Math.max(0, input.activeBombs || 0);
  const maxBombs = Math.max(0, input.maxBombs || 0);
  const protectedTarget = (input.spawnProtectionMs || 0) > 0 || (input.flameGuardMs || 0) > 0;
  const shielded = shieldCharges > 0;
  const commitmentRemainingMs = input.soonestOwnedBombFuseMs === null
    ? null
    : Math.max(0, input.soonestOwnedBombFuseMs);
  const bombCapacityCommitted = maxBombs > 0
    && activeBombs >= maxBombs
    && (input.remoteLevel || 0) <= 0
    && commitmentRemainingMs !== null
    && commitmentRemainingMs >= TARGET_COMMITMENT_MIN_MS;
  const defenseState: BotTargetDefenseState = protectedTarget
    ? "protected"
    : shielded
      ? "shielded"
      : "exposed";
  const score = input.distanceSteps
    + (protectedTarget ? TARGET_PROTECTION_PENALTY : 0)
    + shieldCharges * TARGET_SHIELD_PENALTY
    + Math.max(0, input.openEscapeRoutes) * TARGET_OPEN_ROUTE_PENALTY
    - (bombCapacityCommitted && !protectedTarget ? TARGET_COMMITTED_CAPACITY_BONUS : 0);
  const reasonCode = protectedTarget
    ? "protected-fallback"
    : shielded
      ? "shielded-fallback"
      : bombCapacityCommitted
        ? "exposed-capacity-committed"
        : input.openEscapeRoutes <= 1
          ? "exposed-contained"
          : "nearest-exposed";

  return {
    targetId: input.targetId,
    distanceSteps: input.distanceSteps,
    openEscapeRoutes: input.openEscapeRoutes,
    defenseState,
    bombCapacityCommitted,
    commitmentRemainingMs,
    score,
    reasonCode,
  };
}

export function selectBotTarget(inputs: BotTargetCandidateInput[]): BotTargetSelectionSignal {
  const candidates = inputs.map(evaluateBotTargetCandidate);
  let selected: BotTargetCandidateSignal | null = null;

  for (const candidate of candidates) {
    if (!selected || candidate.score < selected.score) {
      selected = candidate;
    }
  }

  return { selected, candidates };
}
