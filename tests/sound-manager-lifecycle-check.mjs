class TrackingEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener, options = {}) {
    const registrations = this.listeners.get(type) ?? [];
    registrations.push({ listener, once: options.once === true });
    this.listeners.set(type, registrations);
  }

  removeEventListener(type, listener) {
    const registrations = this.listeners.get(type) ?? [];
    this.listeners.set(type, registrations.filter((entry) => entry.listener !== listener));
  }

  dispatch(type) {
    const registrations = [...(this.listeners.get(type) ?? [])];
    for (const registration of registrations) {
      registration.listener({ type });
      if (registration.once) {
        this.removeEventListener(type, registration.listener);
      }
    }
  }

  listenerCount(type) {
    return (this.listeners.get(type) ?? []).length;
  }
}

globalThis.window = {};

const { SoundManager } = await import("../output/esm/Engine/sound-manager.js");

const target = new TrackingEventTarget();
const manager = new SoundManager();
manager.bindUnlock(target);

const listenersBeforeUnlock = {
  pointerdown: target.listenerCount("pointerdown"),
  keydown: target.listenerCount("keydown"),
};

target.dispatch("pointerdown");

const listenersAfterUnlock = {
  pointerdown: target.listenerCount("pointerdown"),
  keydown: target.listenerCount("keydown"),
};
const pass = manager.unlocked === true
  && listenersBeforeUnlock.pointerdown === 1
  && listenersBeforeUnlock.keydown === 1
  && listenersAfterUnlock.pointerdown === 0
  && listenersAfterUnlock.keydown === 0;

console.log(JSON.stringify({
  listenersBeforeUnlock,
  listenersAfterUnlock,
  unlocked: manager.unlocked,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
