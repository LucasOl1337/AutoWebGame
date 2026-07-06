const { consumeFixedRatePumpSteps, createFixedRatePumpState } = await import("../output/esm/NetCode/server-tick.js");

const stepMs = 1000 / 60;
const maxSteps = 5;

const cold = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), 1000, stepMs, maxSteps);
const delayed = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), 1040, stepMs, maxSteps);
const overloaded = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), 1300, stepMs, maxSteps);
const clockRewind = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), 900, stepMs, maxSteps);
const recoveredAfterRewind = consumeFixedRatePumpSteps(clockRewind.state, 1040, stepMs, maxSteps);
const invalidClockSample = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), Number.NaN, stepMs, maxSteps);

const pass = cold.steps === 0
  && delayed.steps === 2
  && delayed.state.accumulatorMs >= 0
  && delayed.state.accumulatorMs < stepMs
  && overloaded.steps === maxSteps
  && overloaded.state.accumulatorMs >= 0
  && overloaded.state.accumulatorMs < stepMs
  && clockRewind.steps === 0
  && clockRewind.state.lastUpdateAtMs === 1000
  && clockRewind.state.accumulatorMs === 0
  && recoveredAfterRewind.steps === delayed.steps
  && recoveredAfterRewind.state.lastUpdateAtMs === delayed.state.lastUpdateAtMs
  && recoveredAfterRewind.state.accumulatorMs === delayed.state.accumulatorMs
  && invalidClockSample.steps === 0
  && invalidClockSample.state.lastUpdateAtMs === 1000
  && invalidClockSample.state.accumulatorMs === 0;

console.log(JSON.stringify({
  cold,
  delayed,
  overloaded,
  clockRewind,
  recoveredAfterRewind,
  invalidClockSample,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
