globalThis.window = {};

class FakeTarget {
  constructor() {
    this.listeners = new Map();
    this.added = [];
    this.removed = [];
  }

  addEventListener(type, handler, options) {
    const list = this.listeners.get(type) ?? [];
    list.push({ handler, options });
    this.listeners.set(type, list);
    this.added.push({ type, handler, options });
  }

  removeEventListener(type, handler, options) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((entry) => entry.handler !== handler));
    this.removed.push({ type, handler, options });
  }

  emit(type) {
    const list = [...(this.listeners.get(type) ?? [])];
    for (const entry of list) {
      entry.handler({ type });
    }
  }

  listenerCount(type) {
    return (this.listeners.get(type) ?? []).length;
  }
}

const { SoundManager } = await import("../output/esm/Engine/sound-manager.js");

const pointerFirstTarget = new FakeTarget();
const pointerFirstManager = new SoundManager();
pointerFirstManager.bindUnlock(pointerFirstTarget);

const initialBindPass = pointerFirstTarget.added.length === 2
  && pointerFirstTarget.added.every((entry) => entry.options?.once === true && entry.options?.capture === true)
  && pointerFirstTarget.listenerCount("pointerdown") === 1
  && pointerFirstTarget.listenerCount("keydown") === 1;

pointerFirstTarget.emit("pointerdown");

const pointerCleanupPass = pointerFirstManager.unlocked === true
  && pointerFirstTarget.removed.map((entry) => entry.type).sort().join(",") === "keydown,pointerdown"
  && pointerFirstTarget.listenerCount("pointerdown") === 0
  && pointerFirstTarget.listenerCount("keydown") === 0;

pointerFirstTarget.emit("keydown");
const noLeftoverKeydownPass = pointerFirstTarget.removed.length === 2;

const afterUnlockTarget = new FakeTarget();
pointerFirstManager.bindUnlock(afterUnlockTarget);
const noRebindAfterUnlockPass = afterUnlockTarget.added.length === 0;

const keyFirstTarget = new FakeTarget();
const keyFirstManager = new SoundManager();
keyFirstManager.bindUnlock(keyFirstTarget);
keyFirstTarget.emit("keydown");

const keyCleanupPass = keyFirstManager.unlocked === true
  && keyFirstTarget.removed.map((entry) => entry.type).sort().join(",") === "keydown,pointerdown"
  && keyFirstTarget.listenerCount("pointerdown") === 0
  && keyFirstTarget.listenerCount("keydown") === 0;

const pass = initialBindPass
  && pointerCleanupPass
  && noLeftoverKeydownPass
  && noRebindAfterUnlockPass
  && keyCleanupPass;

console.log(JSON.stringify({
  initialBindPass,
  pointerCleanupPass,
  noLeftoverKeydownPass,
  noRebindAfterUnlockPass,
  keyCleanupPass,
  pointerRemoved: pointerFirstTarget.removed.map((entry) => entry.type),
  keyRemoved: keyFirstTarget.removed.map((entry) => entry.type),
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
