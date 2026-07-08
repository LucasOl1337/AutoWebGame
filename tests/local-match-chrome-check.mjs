const noop = () => {};

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.classNames = new Set();
    this.classList = {
      add: (...names) => {
        for (const name of names) {
          this.classNames.add(name);
        }
      },
      remove: (...names) => {
        for (const name of names) {
          this.classNames.delete(name);
        }
      },
      toggle: (name, force) => {
        const shouldAdd = force === undefined ? !this.classNames.has(name) : Boolean(force);
        if (shouldAdd) {
          this.classNames.add(name);
        } else {
          this.classNames.delete(name);
        }
        return shouldAdd;
      },
      contains: (name) => this.classNames.has(name),
    };
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
    this.innerHTML = "";
    this.value = "";
    this.scrollTop = 0;
    this.scrollHeight = 0;
  }

  append(...nodes) {
    for (const node of nodes) {
      if (!node) {
        continue;
      }
      if (typeof node === "object") {
        node.parentElement = this;
      }
      this.children.push(node);
    }
  }

  appendChild(node) {
    this.append(node);
    return node;
  }

  prepend(...nodes) {
    for (const node of nodes.reverse()) {
      if (!node) {
        continue;
      }
      if (typeof node === "object") {
        node.parentElement = this;
      }
      this.children.unshift(node);
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  dispatchEvent(event) {
    for (const handler of this.listeners.get(event.type) ?? []) {
      handler(event);
    }
  }

  click() {
    this.dispatchEvent({
      type: "click",
      target: this,
      preventDefault: noop,
    });
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  focus() {}

  querySelector() {
    return null;
  }
}

class FakeMutationObserver {
  observe() {}
  disconnect() {}
}

class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = 0;

  addEventListener() {}
  send() {}
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
}

const storage = new Map();
const fakeLocation = {
  href: "http://127.0.0.1:5173/",
  protocol: "http:",
  host: "127.0.0.1:5173",
  hostname: "127.0.0.1",
  port: "5173",
  pathname: "/",
  assign: noop,
};

Object.defineProperty(globalThis, "navigator", {
  value: {
    language: "en-US",
    languages: ["en-US"],
    sendBeacon: () => true,
  },
  configurable: true,
});

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 720,
  location: fakeLocation,
  history: { replaceState: noop },
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
  },
  addEventListener: noop,
  setTimeout: () => 0,
  clearTimeout: noop,
  requestAnimationFrame: noop,
  dispatchEvent: noop,
};
globalThis.document = {
  documentElement: {},
  fullscreenElement: null,
  visibilityState: "visible",
  referrer: "",
  createElement: (tagName) => new FakeElement(tagName),
  addEventListener: noop,
  exitFullscreen: async () => {},
};
globalThis.MutationObserver = FakeMutationObserver;
globalThis.WebSocket = FakeWebSocket;
globalThis.fetch = async () => ({ ok: false, json: async () => ({}) });

if (!globalThis.crypto?.randomUUID) {
  globalThis.crypto = { randomUUID: () => "00000000-0000-4000-8000-000000000000" };
}

const { OnlineSessionClient } = await import("../output/esm/NetCode/session-client.js");

const sprites = {
  up: null,
  down: null,
  left: null,
  right: null,
  idle: { up: [], down: [], left: [], right: [] },
  walk: { up: [], down: [], left: [], right: [] },
  run: { up: [], down: [], left: [], right: [] },
  cast: { up: [], down: [], left: [], right: [] },
  attack: { up: [], down: [], left: [], right: [] },
  death: { up: [], down: [], left: [], right: [] },
};

const app = {
  mode: "menu",
  botFill: 0,
  returnedToMenu: 0,
  attachOnlineSession: noop,
  detachOnlineSession: noop,
  startOnlineMatch: noop,
  startOfflineBotMatch(botFill = 3) {
    this.mode = "match";
    this.botFill = botFill;
  },
  setOfflinePreferredCharacter: noop,
  setLanguage: noop,
  getCurrentMode() {
    return this.mode;
  },
  applyOnlineFrame: noop,
  applyOnlineSnapshot: noop,
  clearOnlinePeer: noop,
  receiveOnlineGuestInput: noop,
  returnToMenu() {
    this.mode = "menu";
    this.returnedToMenu += 1;
  },
};

const root = new FakeElement("div");
const client = new OnlineSessionClient(root, app, [
  { id: "alpha", name: "Alpha", size: null, sprites, order: 0 },
]);

client.elements.landingBotMatchButton.click();
client.elements.matchChatToggleButton.click();

const localChrome = {
  screen: client.elements.shell.dataset.screen,
  botFill: app.botFill,
  inviteHidden: client.elements.matchCopyButton.hidden,
  inviteDisabled: client.elements.matchCopyButton.disabled,
  dockHidden: client.elements.matchDock.hidden,
  infoToggleHidden: client.elements.matchInfoToggleButton.hidden,
  chatToggleHidden: client.elements.matchChatToggleButton.hidden,
  chatOpen: client.elements.matchStage.dataset.chatOpen,
  leaveDisabled: client.elements.matchLeaveButton.disabled,
  status: client.elements.matchStatus.textContent,
};

client.elements.matchLeaveButton.click();

const returnedHome = {
  screen: client.elements.shell.dataset.screen,
  mode: app.mode,
  returnedToMenu: app.returnedToMenu,
};

const pass = localChrome.screen === "match"
  && localChrome.botFill === 3
  && localChrome.inviteHidden
  && localChrome.inviteDisabled
  && localChrome.dockHidden
  && localChrome.infoToggleHidden
  && localChrome.chatToggleHidden
  && localChrome.chatOpen === "false"
  && !localChrome.leaveDisabled
  && localChrome.status === "Bot match live"
  && returnedHome.screen === "landing"
  && returnedHome.mode === "menu"
  && returnedHome.returnedToMenu === 1;

console.log(JSON.stringify({ localChrome, returnedHome, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
