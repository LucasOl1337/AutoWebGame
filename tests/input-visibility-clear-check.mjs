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

const fireDocument = (event) => {
  const handler = documentListeners.get(event);
  if (handler) {
    handler();
  }
};

const keyEvent = (code) => ({ code, preventDefault() {}, target: null });

const { InputManager } = await import("../output/esm/Engine/input.js");

const input = new InputManager(fakeWindow);

fireWindow("keydown", keyEvent("KeyW"));

const heldBeforeHide = input.isDown("KeyW");
const pressBeforeHide = input.consumePress("KeyW");
const directionBeforeHide = input.getMovementDirection(1);

fakeDocument.visibilityState = "hidden";
fireDocument("visibilitychange");

const heldAfterHide = input.isDown("KeyW");
const pressAfterHide = input.consumePress("KeyW");
const directionAfterHide = input.getMovementDirection(1);

fakeDocument.visibilityState = "visible";
fireDocument("visibilitychange");
fireWindow("keydown", keyEvent("KeyD"));

const recoversAfterVisible = input.isDown("KeyD") && input.getMovementDirection(1) === "right";

const pass = heldBeforeHide
  && pressBeforeHide
  && directionBeforeHide === "up"
  && !heldAfterHide
  && !pressAfterHide
  && directionAfterHide === null
  && recoversAfterVisible;

console.log(JSON.stringify({
  beforeHide: {
    held: heldBeforeHide,
    press: pressBeforeHide,
    direction: directionBeforeHide,
  },
  afterHide: {
    held: heldAfterHide,
    press: pressAfterHide,
    direction: directionAfterHide,
  },
  recoversAfterVisible,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
