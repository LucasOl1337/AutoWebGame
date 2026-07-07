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

class FakeHTMLElement {
  constructor({ contentEditable = false, closestMatch = false } = {}) {
    this.isContentEditable = contentEditable;
    this.closestMatch = closestMatch;
  }

  closest() {
    return this.closestMatch ? this : null;
  }
}

class FakeInputElement extends FakeHTMLElement {}
class FakeTextAreaElement extends FakeHTMLElement {}
class FakeSelectElement extends FakeHTMLElement {}

globalThis.HTMLElement = FakeHTMLElement;
globalThis.HTMLInputElement = FakeInputElement;
globalThis.HTMLTextAreaElement = FakeTextAreaElement;
globalThis.HTMLSelectElement = FakeSelectElement;

const keyEvent = (code, target = null) => ({
  code,
  target,
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
});

const { InputManager } = await import("../output/esm/Engine/input.js");
const { LOCAL_PLAYER_MOVEMENT_BINDINGS } = await import("../output/esm/PersonalConfig/config.js");

const input = new InputManager(fakeWindow);

const arrowDown = keyEvent("ArrowDown");
fire("keydown", arrowDown);
const gameKeydownPreventsScroll = arrowDown.prevented
  && input.getDirectionFromCodes(LOCAL_PLAYER_MOVEMENT_BINDINGS) === "down";

const arrowUp = keyEvent("ArrowDown");
fire("keyup", arrowUp);
const gameKeyupPreventsScroll = arrowUp.prevented && !input.isDown("ArrowDown");

const buttonChild = new FakeHTMLElement({ closestMatch: true });
const buttonSpace = keyEvent("Space", buttonChild);
fire("keydown", buttonSpace);
const interactiveKeydownPassesThrough = !buttonSpace.prevented
  && !input.isDown("Space")
  && !input.consumePress("Space");

const gameSpaceDown = keyEvent("Space");
fire("keydown", gameSpaceDown);
const gameSpaceCaptured = gameSpaceDown.prevented
  && input.isDown("Space")
  && input.consumePress("Space");

const buttonSpaceUp = keyEvent("Space", buttonChild);
fire("keyup", buttonSpaceUp);
const interactiveKeyupClearsWithoutBlocking = !buttonSpaceUp.prevented && !input.isDown("Space");

const typingTarget = new FakeInputElement();
const typingKey = keyEvent("KeyW", typingTarget);
fire("keydown", typingKey);
const typingKeyPassesThrough = !typingKey.prevented
  && !input.isDown("KeyW")
  && !input.consumePress("KeyW");

const pass = gameKeydownPreventsScroll
  && gameKeyupPreventsScroll
  && interactiveKeydownPassesThrough
  && gameSpaceCaptured
  && interactiveKeyupClearsWithoutBlocking
  && typingKeyPassesThrough;

console.log(JSON.stringify({
  gameKeydownPreventsScroll,
  gameKeyupPreventsScroll,
  interactiveKeydownPassesThrough,
  gameSpaceCaptured,
  interactiveKeyupClearsWithoutBlocking,
  typingKeyPassesThrough,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
