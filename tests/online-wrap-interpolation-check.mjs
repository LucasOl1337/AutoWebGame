const { updateVisualPlayerPositions } = await import("../output/esm/NetCode/online-sync.js");
const { TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");

function createSample(position, receivedAtMs, serverTimeMs, serverTick) {
  return {
    receivedAtMs,
    serverTimeMs,
    serverTick,
    players: {
      2: {
        position,
        velocity: { x: 0, y: 0 },
      },
    },
  };
}

function renderRemotePlayer(current, target, samples) {
  const visualPlayerPositions = {
    2: { ...current },
  };
  const players = {
    2: {
      velocity: { x: 0, y: 0 },
    },
  };

  updateVisualPlayerPositions({
    headless: false,
    hasSession: true,
    activePlayerIds: [2],
    onlineLocalPlayerId: 1,
    players,
    visualPlayerPositions,
    onlineRenderSamples: samples,
    deltaMs: 1000 / 60,
    getPlayerPixelPositionFromState: () => target,
  });

  return visualPlayerPositions[2];
}

const nowMs = performance.now();
const horizontalSamples = [
  createSample({ x: 590, y: 220 }, nowMs - 50, 1000, 20),
  createSample({ x: 5, y: 220 }, nowMs, 1050, 21),
];
const horizontalWrap = renderRemotePlayer(
  { x: 590, y: 220 },
  { x: 5, y: 220 },
  horizontalSamples,
);
const verticalSamples = [
  createSample({ x: 260, y: 590 }, nowMs - 50, 1000, 20),
  createSample({ x: 260, y: 5 }, nowMs, 1050, 21),
];
const verticalWrap = renderRemotePlayer(
  { x: 260, y: 590 },
  { x: 260, y: 5 },
  verticalSamples,
);
const discontinuityThresholdPx = TILE_SIZE * 3;
const belowThresholdTarget = discontinuityThresholdPx - 1;
const aboveThresholdTarget = discontinuityThresholdPx + 1;
const belowThresholdMovement = renderRemotePlayer(
  { x: 0, y: 100 },
  { x: belowThresholdTarget, y: 100 },
  [createSample({ x: belowThresholdTarget, y: 100 }, nowMs, 1050, 21)],
);
const aboveThresholdMovement = renderRemotePlayer(
  { x: 0, y: 100 },
  { x: aboveThresholdTarget, y: 100 },
  [createSample({ x: aboveThresholdTarget, y: 100 }, nowMs, 1050, 21)],
);

const horizontalDistanceToExit = Math.min(
  Math.abs(horizontalWrap.x - 5),
  Math.abs(horizontalWrap.x - 605),
  Math.abs(horizontalWrap.x + 595),
);
const verticalDistanceToExit = Math.min(
  Math.abs(verticalWrap.y - 5),
  Math.abs(verticalWrap.y - 605),
  Math.abs(verticalWrap.y + 595),
);
const horizontalStayedNearPortalExit = horizontalDistanceToExit < TILE_SIZE
  && (horizontalWrap.x < 50 || horizontalWrap.x > 550)
  && Math.abs(horizontalWrap.y - 220) < 0.01;
const verticalStayedNearPortalExit = verticalDistanceToExit < TILE_SIZE
  && (verticalWrap.y < 50 || verticalWrap.y > 550)
  && Math.abs(verticalWrap.x - 260) < 0.01;
const belowThresholdStillSmooth = belowThresholdMovement.x > 0
  && belowThresholdMovement.x < belowThresholdTarget;
const aboveThresholdSnaps = Math.abs(aboveThresholdMovement.x - aboveThresholdTarget) < 0.01;
const pass = horizontalStayedNearPortalExit
  && verticalStayedNearPortalExit
  && belowThresholdStillSmooth
  && aboveThresholdSnaps;

console.log(JSON.stringify({
  horizontalWrap,
  verticalWrap,
  horizontalDistanceToExit,
  verticalDistanceToExit,
  belowThresholdMovement,
  aboveThresholdMovement,
  discontinuityThresholdPx,
  horizontalStayedNearPortalExit,
  verticalStayedNearPortalExit,
  belowThresholdStillSmooth,
  aboveThresholdSnaps,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
