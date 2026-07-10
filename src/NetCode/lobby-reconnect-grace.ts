export const LOBBY_RECONNECT_GRACE_MS = 15_000;

export interface VacantRoomRecoveryState {
  emptySince: number;
  shouldDelete: boolean;
  remainingMs: number;
}

export function getVacantRoomRecoveryState(
  emptySince: number | null | undefined,
  nowMs: number,
  graceMs = LOBBY_RECONNECT_GRACE_MS,
): VacantRoomRecoveryState {
  const safeNowMs = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0;
  const safeGraceMs = Number.isFinite(graceMs) ? Math.max(0, graceMs) : LOBBY_RECONNECT_GRACE_MS;
  const vacancyStartedAt = typeof emptySince === "number"
    && Number.isFinite(emptySince)
    && emptySince >= 0
    && emptySince <= safeNowMs
    ? emptySince
    : safeNowMs;
  const elapsedMs = safeNowMs - vacancyStartedAt;

  return {
    emptySince: vacancyStartedAt,
    shouldDelete: elapsedMs >= safeGraceMs,
    remainingMs: Math.max(0, safeGraceMs - elapsedMs),
  };
}
