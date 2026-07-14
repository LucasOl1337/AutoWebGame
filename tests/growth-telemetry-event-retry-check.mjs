let uuidSequence = 0;
let timeoutSequence = 0;
const scheduledTimers = [];
const fetchCalls = [];
const pendingFetches = [];
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

globalThis.fetch = (url, options) => {
  const payload = JSON.parse(options.body);
  fetchCalls.push({ url, payload });
  if (fetchCalls.length <= 2) {
    return new Promise((resolve) => {
      pendingFetches.push({ resolve });
    });
  }
  return Promise.resolve({ ok: true, status: 202 });
};

const { GrowthTelemetryClient } = await import("../output/esm/NetCode/growth-telemetry.js");

const client = new GrowthTelemetryClient();
client.trackLandingView();
client.track("quick_match_clicked", { payload: { entryPoint: "hero" } });
client.track("lobby_list_opened");
client.track("lobby_create_clicked");
client.track("feedback_opened");

const firstBatchEventNames = [
  "session_start",
  "landing_view",
  "quick_match_clicked",
  "lobby_list_opened",
  "lobby_create_clicked",
  "feedback_opened",
];
const secondBatchEventNames = Array.from(
  { length: 30 },
  (_, index) => `queued_during_retry_${String(index + 1).padStart(2, "0")}`,
);

for (const eventName of secondBatchEventNames) {
  client.track(eventName);
}

const serializedBeforeRetry = fetchCalls.length === 1;
pendingFetches.shift()?.resolve({ ok: false, status: 503 });

await new Promise((resolve) => setImmediate(resolve));

const firstEventNames = fetchCalls[0]?.payload.map((event) => event.eventName) ?? [];
const secondEventNames = fetchCalls[1]?.payload.map((event) => event.eventName) ?? [];
const expectedRetriedEventNames = firstBatchEventNames.concat(secondBatchEventNames.slice(0, 24));
pendingFetches.shift()?.resolve({ ok: true, status: 202 });
await Promise.resolve();
await Promise.resolve();

const pass = fetchCalls.length === 2
  && serializedBeforeRetry
  && fetchCalls.every((call) => call.url === "/api/telemetry")
  && firstEventNames.length === 6
  && firstEventNames.join("|") === firstBatchEventNames.join("|")
  && secondEventNames.length === 30
  && secondEventNames.join("|") === expectedRetriedEventNames.join("|")
  && secondEventNames.includes("session_start")
  && secondEventNames.includes("queued_during_retry_24")
  && !secondEventNames.includes("queued_during_retry_30")
  && fetchCalls[1].payload.every((event) => event.attribution.utmCampaign === "retry-test")
  && windowListeners.has("pagehide")
  && documentListeners.has("visibilitychange");

console.log(JSON.stringify({
  fetches: fetchCalls.length,
  firstEventNames,
  secondEventNames,
  serializedBeforeRetry,
  scheduledTimers: scheduledTimers.length,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
