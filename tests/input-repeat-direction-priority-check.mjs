const listeners = new Map();

const fakeWindow = {
  addEventListener: (event, handler) => {
    listeners.set(event, handler);
  },
};

const fire = (event, payload) => {
  const handler = listeners.get(event);
  if (handler) {
    handler(payload);
  }
};

const { InputManager } = await import("../output/esm/Engine/input.js");
const input = new InputManager(fakeWindow);
const event = (code, repeat = false) => ({ code, repeat, preventDefault() {}, target: null });

fire("keydown", event("KeyW"));
fire("keydown", event("KeyD"));
const latestPhysicalPress = input.getMovementDirection(1);

fire("keydown", event("KeyW", true));
const afterOlderKeyRepeat = input.getMovementDirection(1);
const repeatDidNotQueuePress = input.consumePress("KeyW") && !input.consumePress("KeyW");

fire("keyup", event("KeyD"));
const fallbackToHeldDirection = input.getMovementDirection(1);

const pass = latestPhysicalPress === "right"
  && afterOlderKeyRepeat === "right"
  && repeatDidNotQueuePress
  && fallbackToHeldDirection === "up";

console.log(JSON.stringify({
  latestPhysicalPress,
  afterOlderKeyRepeat,
  repeatDidNotQueuePress,
  fallbackToHeldDirection,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
