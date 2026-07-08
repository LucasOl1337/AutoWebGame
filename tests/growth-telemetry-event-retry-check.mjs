let uuidSequence = 0;
let timeoutSequence = 0;
const scheduledTimers = [];
const fetchCalls = [];
const windowListeners = new Map();
const documentListeners = new Map();

Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: () => `retry-uuid-${++uuidSequence}`,
  },
  configurable: true,
});

Object.defineProperty(globalThis, "window", {
  value: {
    location: {
      pathname: "/arena",
      host: "bomba.test",
      href: "https://bomba.test/arena?utm_campaign=retry-test",
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
    },
    addEventListener: (event, handler) => {
      windowListeners.set(event, handler);
    },
    setTimeout: (handler) => {
      const id = ++timeoutSequence;
      scheduledTimers.push({ id, handler });
      return id;
    },
    clearTimeout: (id) => {
      const index = scheduledTimers.findIndex((timer) => timer.id === id);
      if (index >= 0) {
        scheduledTimers.splice(index, 1);
      }
    },
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
    sendBeacon: () => false,
  },
  configurable: true,
});

globalThis.fetch = async (url, options) => {
  const payload = JSON.parse(options.body);
  fetchCalls.push({ url, payload });
  if (fetchCalls.length === 1) {
    throw new Error("temporary network outage");
  }
  return { ok: true, status: 202 };
};

const { GrowthTelemetryClient } = await import("../output/esm/NetCode/growth-telemetry.js");

const client = new GrowthTelemetryClient();
client.trackLandingView();
client.track("quick_match_clicked", { payload: { entryPoint: "hero" } });
client.track("lobby_list_opened");
client.track("lobby_create_clicked");
client.track("feedback_opened");

await Promise.resolve();
await Promise.resolve();

const retryTimer = scheduledTimers.shift();
retryTimer?.handler();

await Promise.resolve();
await Promise.resolve();

const firstEventNames = fetchCalls[0]?.payload.map((event) => event.eventName) ?? [];
const secondEventNames = fetchCalls[1]?.payload.map((event) => event.eventName) ?? [];
const pass = fetchCalls.length === 2
  && fetchCalls.every((call) => call.url === "/api/telemetry")
  && firstEventNames.length === 6
  && secondEventNames.join("|") === firstEventNames.join("|")
  && secondEventNames.includes("session_start")
  && secondEventNames.includes("feedback_opened")
  && fetchCalls[1].payload.every((event) => event.attribution.utmCampaign === "retry-test")
  && windowListeners.has("pagehide")
  && documentListeners.has("visibilitychange");

console.log(JSON.stringify({
  fetches: fetchCalls.length,
  firstEventNames,
  secondEventNames,
  scheduledTimers: scheduledTimers.length,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
