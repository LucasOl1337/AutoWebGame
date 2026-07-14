export interface FixedRatePumpState {
  lastUpdateAtMs: number;
  accumulatorMs: number;
}

export interface FixedRatePumpResult {
  state: FixedRatePumpState;
  steps: number;
}

export function createFixedRatePumpState(nowMs: number): FixedRatePumpState {
  return {
    lastUpdateAtMs: sanitizeNow(nowMs),
    accumulatorMs: 0,
  };
}

export function consumeFixedRatePumpSteps(
  current: FixedRatePumpState,
  nowMs: number,
  stepMs: number,
  maxSteps: number,
): FixedRatePumpResult {
  const numericStepMs = Number(stepMs);
  const safeStepMs = Number.isFinite(numericStepMs)
    ? Math.max(0.001, numericStepMs)
    : 0.001;
  const numericMaxSteps = Number(maxSteps);
  const safeMaxSteps = Number.isFinite(numericMaxSteps)
    ? Math.max(1, Math.floor(numericMaxSteps))
    : 1;
  const numericNowMs = Number(nowMs);
  const safeNowMs = isValidClockValue(numericNowMs) ? numericNowMs : null;
  const numericPreviousNowMs = Number(current.lastUpdateAtMs);
  const previousNowMs = isValidClockValue(numericPreviousNowMs)
    ? numericPreviousNowMs
    : null;
  const clockRegressed = safeNowMs !== null
    && previousNowMs !== null
    && safeNowMs < previousNowMs;
  const nextUpdateAtMs = safeNowMs === null
    ? previousNowMs ?? 0
    : safeNowMs;
  const rawElapsedMs = safeNowMs === null || previousNowMs === null || clockRegressed
    ? 0
    : safeNowMs - previousNowMs;
  const maxAccumulatedMs = safeStepMs * safeMaxSteps;
  const numericAccumulatorMs = Number(current.accumulatorMs);
  const previousAccumulatorMs = Number.isFinite(numericAccumulatorMs) && numericAccumulatorMs >= 0
    ? numericAccumulatorMs
    : 0;
  const accumulatorMs = Math.min(
    maxAccumulatedMs,
    previousAccumulatorMs + rawElapsedMs,
  );
  const steps = Math.min(safeMaxSteps, Math.floor(accumulatorMs / safeStepMs));

  return {
    state: {
      lastUpdateAtMs: nextUpdateAtMs,
      accumulatorMs: accumulatorMs - steps * safeStepMs,
    },
    steps,
  };
}

function sanitizeNow(nowMs: number): number {
  const value = Number(nowMs);
  if (!isValidClockValue(value)) {
    return 0;
  }
  return value;
}

function isValidClockValue(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}
