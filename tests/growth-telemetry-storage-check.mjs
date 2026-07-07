let uuidSequence = 0;
const windowListeners = new Map();
const documentListeners = new Map();
const beacons = [];

Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: () => `test-uuid-${++uuidSequence}`,
  },
  configurable: true,
});

Object.defineProperty(globalThis, "window", {
  value: {
    location: {
      pathname: "/arena",
      host: "bomba.test",
      href: "https://bomba.test/arena?ref=invite&utm_source=creator",
    },
    localStorage: {
      getItem: () => {
        throw new Error("localStorage blocked");
      },
      setItem: () => {
        throw new Error("localStorage blocked");
      },
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
    referrer: "https://referrer.test/post",
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

const pass = beacons.length === 1
  && beacons[0].url === "/api/telemetry"
  && eventNames.includes("session_start")
  && eventNames.includes("landing_view")
  && eventNames.includes("session_end")
  && anonIds.size === 1
  && anonIds.has("test-uuid-1")
  && sessionIds.size === 1
  && sessionIds.has("test-uuid-2")
  && events.every((event) => event.attribution.referrerHost === "referrer.test")
  && events.every((event) => event.attribution.referralId === "invite")
  && events.every((event) => event.attribution.utmSource === "creator");

console.log(JSON.stringify({
  beacons: beacons.length,
  eventNames,
  anonIds: Array.from(anonIds),
  sessionIds: Array.from(sessionIds),
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
