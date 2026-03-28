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
  const safeStepMs = Math.max(0.001, Number(stepMs) || 0.001);
  const safeMaxSteps = Math.max(1, Math.floor(Number(maxSteps) || 1));
  const safeNowMs = sanitizeNow(nowMs);
  const previousNowMs = sanitizeNow(current.lastUpdateAtMs);
  const rawElapsedMs = Math.max(0, safeNowMs - previousNowMs);
  const maxAccumulatedMs = safeStepMs * safeMaxSteps;
  const accumulatorMs = Math.min(
    maxAccumulatedMs,
    Math.max(0, Number(current.accumulatorMs) || 0) + rawElapsedMs,
  );
  const steps = Math.min(safeMaxSteps, Math.floor(accumulatorMs / safeStepMs));

  return {
    state: {
      lastUpdateAtMs: safeNowMs,
      accumulatorMs: accumulatorMs - steps * safeStepMs,
    },
    steps,
  };
}

function sanitizeNow(nowMs: number): number {
  const value = Number(nowMs);
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value;
}
