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

const { InputManager } = await import("../output/esm/engine/input.js");
const { LOCAL_PLAYER_MOVEMENT_BINDINGS } = await import("../output/esm/core/config.js");

const input = new InputManager(fakeWindow);

fire("keydown", { code: "ArrowUp", preventDefault() {}, target: null });

const aliasDirection = input.getDirectionFromCodes(LOCAL_PLAYER_MOVEMENT_BINDINGS);
const playerOneDirection = input.getMovementDirection(1);

fire("keyup", { code: "ArrowUp" });
fire("keydown", { code: "KeyW", preventDefault() {}, target: null });

const wasdDirection = input.getDirectionFromCodes(LOCAL_PLAYER_MOVEMENT_BINDINGS);
const nativePlayerOneDirection = input.getMovementDirection(1);

const pass = aliasDirection === "up"
  && playerOneDirection === null
  && wasdDirection === "up"
  && nativePlayerOneDirection === "up";

console.log(JSON.stringify({
  aliasDirection,
  playerOneDirection,
  wasdDirection,
  nativePlayerOneDirection,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
