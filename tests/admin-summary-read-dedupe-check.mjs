import { readFile } from "node:fs/promises";

const workerSource = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");

function extractMethod(source, signature) {
  const start = source.indexOf(signature);
  if (start === -1) {
    throw new Error(`Could not find ${signature}`);
  }

  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Could not parse ${signature}`);
}

const buildAdminSummaryMethod = extractMethod(workerSource, "async buildAdminSummary()");

const Harness = Function(`
  const ANALYTICS_LOOKBACK_DAYS = 7;
  const ANALYTICS_TIME_ZONE = "America/Sao_Paulo";
  const formatDateKey = () => "2026-07-08";
  const shiftDateKey = (dateKey, offset) => offset === 0 ? dateKey : dateKey + ":" + offset;
  return class Harness {
    constructor() {
      this.rooms = new Map([
        ["open-room", { status: "open" }],
        ["playing-room", { status: "playing" }],
      ]);
      this.sockets = new Set(["socket-1"]);
      this.reads = [];
    }

    async readAnalyticsDay(dateKey) {
      this.reads.push(dateKey);
      return { date: dateKey };
    }

    sanitizeRoomOccupancy() {}

    serializeLobbySummary(room) {
      return { status: room.status };
    }

    countOpenQuickMatchRooms() {
      return 0;
    }

    async readRecentFeedbacks() {
      return [];
    }

    ${buildAdminSummaryMethod}
  };
`)();

const harness = new Harness();
const summary = await harness.buildAdminSummary();
const uniqueReadCount = new Set(harness.reads).size;

const before = {
  readAnalyticsDayCalls: 8,
  duplicateTodayReads: 2,
  storageListProxyCalls: 32,
};

const after = {
  readAnalyticsDayCalls: harness.reads.length,
  duplicateTodayReads: harness.reads.filter((dateKey) => dateKey === "2026-07-08").length,
  storageListProxyCalls: harness.reads.length * 4,
};

const pass = summary.today === summary.recentDays[0]
  && summary.today.date === "2026-07-08"
  && summary.recentDays.length === 7
  && after.readAnalyticsDayCalls === 7
  && uniqueReadCount === 7
  && after.duplicateTodayReads === 1
  && after.storageListProxyCalls === 28;

console.log(JSON.stringify({
  pass,
  before,
  after,
  impact: {
    readAnalyticsDayCallsDelta: after.readAnalyticsDayCalls - before.readAnalyticsDayCalls,
    storageListProxyCallsDelta: after.storageListProxyCalls - before.storageListProxyCalls,
  },
  reads: harness.reads,
}, null, 2));

if (!pass) {
  process.exit(1);
}
