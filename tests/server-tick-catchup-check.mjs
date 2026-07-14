const { consumeFixedRatePumpSteps, createFixedRatePumpState } = await import("../output/esm/NetCode/server-tick.js");

const stepMs = 1000 / 60;
const maxSteps = 5;

const cold = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), 1000, stepMs, maxSteps);
const delayed = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), 1040, stepMs, maxSteps);
const overloaded = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), 1300, stepMs, maxSteps);
const clockRewind = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), 900, stepMs, maxSteps);
const recoveredAfterRewind = consumeFixedRatePumpSteps(clockRewind.state, 940, stepMs, maxSteps);
const invalidClockSample = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), Number.NaN, stepMs, maxSteps);
const corruptedNumericState = consumeFixedRatePumpSteps({
  lastUpdateAtMs: Number.NaN,
  accumulatorMs: Number.POSITIVE_INFINITY,
}, 1040, stepMs, maxSteps);
const invalidStepLimit = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), 1300, stepMs, Number.POSITIVE_INFINITY);

const pass = cold.steps === 0
  && delayed.steps === 2
  && delayed.state.accumulatorMs >= 0
  && delayed.state.accumulatorMs < stepMs
  && overloaded.steps === maxSteps
  && overloaded.state.accumulatorMs >= 0
  && overloaded.state.accumulatorMs < stepMs
  && clockRewind.steps === 0
  && clockRewind.state.lastUpdateAtMs === 900
  && clockRewind.state.accumulatorMs === 0
  && recoveredAfterRewind.steps === delayed.steps
  && recoveredAfterRewind.state.lastUpdateAtMs === 940
  && recoveredAfterRewind.state.accumulatorMs === delayed.state.accumulatorMs
  && invalidClockSample.steps === 0
  && invalidClockSample.state.lastUpdateAtMs === 1000
  && invalidClockSample.state.accumulatorMs === 0
  && corruptedNumericState.steps === 0
  && corruptedNumericState.state.lastUpdateAtMs === 1040
  && corruptedNumericState.state.accumulatorMs === 0
  && invalidStepLimit.steps === 1
  && invalidStepLimit.state.accumulatorMs === 0;

console.log(JSON.stringify({
  cold,
  delayed,
  overloaded,
  clockRewind,
  recoveredAfterRewind,
  invalidClockSample,
  corruptedNumericState,
  invalidStepLimit,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
