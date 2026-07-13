let randomSeed = 0;
let randomUuidAttempts = 0;
let storageReadAttempts = 0;
const windowListeners = new Map();
const documentListeners = new Map();
const beacons = [];

Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: () => {
      randomUuidAttempts += 1;
      throw new Error("randomUUID unavailable in this webview");
    },
    getRandomValues: (array) => {
      randomSeed += 1;
      array.fill(randomSeed);
      return array;
    },
  },
  configurable: true,
});

Object.defineProperty(globalThis, "window", {
  value: {
    location: {
      pathname: "/arena",
      host: "bomba.test",
      href: "https://bomba.test/arena?utm_medium=webview",
    },
    localStorage: {
      getItem: () => {
        storageReadAttempts += 1;
        throw new Error("storage access denied");
      },
      setItem: () => {},
    },
    addEventListener: (event, handler) => {
      windowListeners.set(event, handler);
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  },
  configurable: true,
});

Object.defineProperty(globalThis, "document", {
  value: {
    referrer: "",
    visibilityState: "visible",
    addEventListener: (event, handler) => {
      documentListeners.set(event, handler);
    },
  },
  configurable: true,
});

Object.defineProperty(globalThis, "navigator", {
  value: {
    sendBeacon: (url, body) => {
      beacons.push({ url, body });
      return true;
    },
  },
  configurable: true,
});

globalThis.fetch = async () => {
  throw new Error("sendBeacon should handle the unload flush");
};

const { GrowthTelemetryClient } = await import("../output/esm/NetCode/growth-telemetry.js");

const client = new GrowthTelemetryClient();
client.trackLandingView();

windowListeners.get("pagehide")?.();

const encodedBeacon = beacons[0] ? await beacons[0].body.text() : "[]";
const events = JSON.parse(encodedBeacon);
const eventNames = events.map((event) => event.eventName);
const anonIds = new Set(events.map((event) => event.anonPlayerId));
const sessionIds = new Set(events.map((event) => event.sessionId));

const expectedAnonId = "01010101-0101-4101-8101-010101010101";
const expectedSessionId = "02020202-0202-4202-8202-020202020202";

const pass = beacons.length === 1
  && beacons[0].url === "/api/telemetry"
  && eventNames.includes("session_start")
  && eventNames.includes("landing_view")
  && eventNames.includes("session_end")
  && anonIds.size === 1
  && anonIds.has(expectedAnonId)
  && sessionIds.size === 1
  && sessionIds.has(expectedSessionId)
  && randomUuidAttempts === 2
  && storageReadAttempts === 1
  && events.every((event) => event.attribution.utmMedium === "webview")
  && documentListeners.has("visibilitychange");

console.log(JSON.stringify({
  beacons: beacons.length,
  eventNames,
  anonIds: Array.from(anonIds),
  sessionIds: Array.from(sessionIds),
  randomUuidAttempts,
  storageReadAttempts,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
