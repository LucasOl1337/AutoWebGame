const { projectNetworkPlayerPosition } = await import("../output/esm/NetCode/online-sync.js");

function createSample(serverTimeMs, receivedAtMs, x) {
  return {
    serverTimeMs,
    receivedAtMs,
    serverTick: serverTimeMs / 50,
    players: {
      2: {
        position: { x, y: 100 },
        velocity: { x: 1000, y: 0 },
      },
    },
  };
}

function project(samples, nowMs) {
  return projectNetworkPlayerPosition(
    samples,
    2,
    nowMs,
    { x: 100, y: 100 },
    { x: 1000, y: 0 },
  );
}

const nowMs = 950;
const establishedTimeline = [
  createSample(1000, 800, 0),
  createSample(1050, 850, 50),
];
const beforeDelayedSnapshot = project(establishedTimeline, nowMs);
const delayedNewerSnapshot = project([
  ...establishedTimeline,
  createSample(1100, 950, 100),
], nowMs);
const onTimeReference = project([
  ...establishedTimeline,
  createSample(1100, 900, 100),
], nowMs);

// Before the fix, this fixture projected x=78 and then rewound to x=66.
const baselineStartsAtExpectedLead = Math.abs(beforeDelayedSnapshot.x - 78) < 0.001;
const correctedTimelineReachesExpectedLead = Math.abs(delayedNewerSnapshot.x - 116) < 0.001;
const didNotRewind = delayedNewerSnapshot.x >= beforeDelayedSnapshot.x;
const matchesOnTimeTimeline = Math.abs(delayedNewerSnapshot.x - onTimeReference.x) < 0.001;
const pass = baselineStartsAtExpectedLead
  && correctedTimelineReachesExpectedLead
  && didNotRewind
  && matchesOnTimeTimeline;

console.log(JSON.stringify({
  beforeDelayedSnapshot,
  delayedNewerSnapshot,
  onTimeReference,
  baselineStartsAtExpectedLead,
  correctedTimelineReachesExpectedLead,
  didNotRewind,
  matchesOnTimeTimeline,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
