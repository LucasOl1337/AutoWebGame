const { consumeFixedRatePumpSteps, createFixedRatePumpState } = await import("../output/esm/NetCode/server-tick.js");

const stepMs = 1000 / 60;
const maxSteps = 5;

const cold = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), 1000, stepMs, maxSteps);
const delayed = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), 1040, stepMs, maxSteps);
const overloaded = consumeFixedRatePumpSteps(createFixedRatePumpState(1000), 1300, stepMs, maxSteps);

const pass = cold.steps === 0
  && delayed.steps === 2
  && delayed.state.accumulatorMs >= 0
  && delayed.state.accumulatorMs < stepMs
  && overloaded.steps === maxSteps
  && overloaded.state.accumulatorMs >= 0
  && overloaded.state.accumulatorMs < stepMs;

console.log(JSON.stringify({
  cold,
  delayed,
  overloaded,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
