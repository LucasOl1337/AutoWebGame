import type { PowerUpType } from "../Gameplay/types";

const POWER_UP_UTILITY_DIVISOR = 10_000;

export type BotPowerUpEscapeIntent = "escape-via-power-up" | "escape-only";

export interface BotPowerUpEscapeRouteInput {
  powerUpType: PowerUpType | null;
  utility: number;
  safeNeighborCount: number;
  distanceSteps: number;
  moveDurationMs: number;
  dangerEtaMs: number | null;
}

export interface BotPowerUpEscapeRouteSignal {
  intent: BotPowerUpEscapeIntent;
  powerUpType: PowerUpType | null;
  utility: number;
  safeNeighborCount: number;
  distanceSteps: number;
  arrivalEtaMs: number;
  dangerEtaMs: number | null;
  escapeMarginMs: number | null;
  routeScore: number;
  reason: string;
}

/**
 * Scores only routes that the bot policy has already classified as safe.
 * One additional safe exit always outweighs any power-up utility; the pickup
 * is therefore a deterministic tie-breaker, never a reason to accept a less
 * survivable route.
 */
export function getBotPowerUpEscapeRouteSignal(
  input: BotPowerUpEscapeRouteInput,
): BotPowerUpEscapeRouteSignal {
  const safeNeighborCount = Math.max(0, Math.floor(input.safeNeighborCount));
  const distanceSteps = Math.max(0, Math.floor(input.distanceSteps));
  const moveDurationMs = Math.max(0, input.moveDurationMs);
  const utility = Number.isFinite(input.utility) ? Math.max(0, input.utility) : 0;
  const normalizedUtility = Math.min(POWER_UP_UTILITY_DIVISOR - 1, utility);
  const arrivalEtaMs = distanceSteps * moveDurationMs;
  const dangerEtaMs = input.dangerEtaMs === null || !Number.isFinite(input.dangerEtaMs)
    ? null
    : Math.max(0, input.dangerEtaMs);
  const powerUpType = utility > 0 ? input.powerUpType : null;
  const intent: BotPowerUpEscapeIntent = powerUpType ? "escape-via-power-up" : "escape-only";

  return {
    intent,
    powerUpType,
    utility,
    safeNeighborCount,
    distanceSteps,
    arrivalEtaMs,
    dangerEtaMs,
    escapeMarginMs: dangerEtaMs === null ? null : dangerEtaMs - arrivalEtaMs,
    routeScore: safeNeighborCount + normalizedUtility / POWER_UP_UTILITY_DIVISOR,
    reason: powerUpType
      ? "Rotas com a mesma quantidade de saídas seguras: coletar o power-up no caminho."
      : "Fugir pela rota segura sem power-up útil confirmado.",
  };
}
