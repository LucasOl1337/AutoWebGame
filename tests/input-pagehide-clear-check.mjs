const windowListeners = new Map();
const documentListeners = new Map();

const fakeDocument = {
  visibilityState: "visible",
  addEventListener: (event, handler) => {
    documentListeners.set(event, handler);
  },
};

const fakeWindow = {
  document: fakeDocument,
  addEventListener: (event, handler) => {
    windowListeners.set(event, handler);
  },
};

const fireWindow = (event, payload) => {
  const handler = windowListeners.get(event);
  if (handler) {
    handler(payload);
  }
};

const keyEvent = (code) => ({ code, preventDefault() {}, target: null });

const { InputManager } = await import("../output/esm/Engine/input.js");

const input = new InputManager(fakeWindow);

fireWindow("keydown", keyEvent("KeyW"));

const pagehideRegistered = windowListeners.has("pagehide");
const heldBeforePagehide = input.isDown("KeyW");
const pressBeforePagehide = input.consumePress("KeyW");
const directionBeforePagehide = input.getMovementDirection(1);

fireWindow("keydown", keyEvent("KeyD"));
const secondKeyHeldBeforePagehide = input.isDown("KeyD");
const secondDirectionBeforePagehide = input.getMovementDirection(1);

fireWindow("pagehide");

const heldAfterPagehide = input.isDown("KeyW") || input.isDown("KeyD");
const pressAfterPagehide = input.consumePress("KeyD");
const directionAfterPagehide = input.getMovementDirection(1);

fireWindow("keydown", keyEvent("KeyS"));
const recoversAfterPagehide = input.isDown("KeyS") && input.getMovementDirection(1) === "down";

const pass = pagehideRegistered
  && heldBeforePagehide
  && pressBeforePagehide
  && directionBeforePagehide === "up"
  && secondKeyHeldBeforePagehide
  && secondDirectionBeforePagehide === "right"
  && !heldAfterPagehide
  && !pressAfterPagehide
  && directionAfterPagehide === null
  && recoversAfterPagehide;

console.log(JSON.stringify({
  pagehideRegistered,
  beforePagehide: {
    held: heldBeforePagehide,
    press: pressBeforePagehide,
    direction: directionBeforePagehide,
    secondKeyHeld: secondKeyHeldBeforePagehide,
    secondDirection: secondDirectionBeforePagehide,
  },
  afterPagehide: {
    held: heldAfterPagehide,
    press: pressAfterPagehide,
    direction: directionAfterPagehide,
  },
  recoversAfterPagehide,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
