import assert from "node:assert/strict";

const { getStableBotDirection } = await import("../output/esm/Engine/bot-ai.js");
const { getBotDirectionStabilitySignal } = await import("../output/esm/Engine/bot-direction-stability.js");
const { BASE_MOVE_MS, TILE_SIZE } = await import("../output/esm/PersonalConfig/config.js");

const player = {
  id: 2,
  tile: { x: 5, y: 5 },
  position: { x: 5 * TILE_SIZE + TILE_SIZE / 2, y: 5 * TILE_SIZE + TILE_SIZE * 0.75 },
  direction: "down",
  lastMoveDirection: "down",
  speedLevel: 0,
};

const context = {
  botCommittedDirection: { 2: "down" },
  botPendingReverseDirection: { 2: null },
  botPendingReverseFrames: { 2: 0 },
  dangerMap: new Map(),
  evaluateMovementOption: () => ({ advances: true }),
  canMovementOptionAdvance: () => true,
  areOppositeDirections: (a, b) => (a === "up" && b === "down") || (a === "down" && b === "up")
    || (a === "left" && b === "right") || (a === "right" && b === "left"),
};

let reversalFrame = null;
let reversalPosition = null;
let forwardFrames = 0;

for (let frame = 1; frame <= 24; frame += 1) {
  const stableDirection = getStableBotDirection(player, "up", 1000 / 60, context);
  if (stableDirection === "up") {
    reversalFrame = frame;
    reversalPosition = { ...player.position };
    break;
  }

  assert.equal(stableDirection, "down", "a safe opposite request should preserve the committed route before the turn point");
  forwardFrames += 1;
  player.position.y += 1.5;
  player.tile.y = Math.floor(player.position.y / TILE_SIZE);
}

assert.notEqual(reversalFrame, null, "the bot must eventually accept the requested reversal");
const nearestTileCenterY = Math.round((reversalPosition.y - TILE_SIZE / 2) / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
const reversalOffsetPx = Math.abs(reversalPosition.y - nearestTileCenterY);

const report = {
  scenario: "safe repeated opposite request while crossing a tile",
  reversalFrame,
  forwardFrames,
  reversalPosition,
  reversalOffsetPx,
  pendingFrames: context.botPendingReverseFrames[2],
  pass: reversalOffsetPx <= 2 && forwardFrames >= 12,
};

console.log(JSON.stringify(report, null, 2));
assert.ok(report.pass, `bot reversed ${reversalOffsetPx}px away from a tile center`);

const visibleSignal = getBotDirectionStabilitySignal({
  position: { x: 5 * TILE_SIZE + TILE_SIZE / 2, y: 5 * TILE_SIZE + TILE_SIZE * 0.75 },
  committedDirection: "down",
  requestedDirection: "up",
  pendingFrames: 3,
  oppositeRequest: true,
  immediateDanger: false,
  canContinueForward: true,
  requestConfirmed: true,
});
assert.equal(visibleSignal.phase, "holding-route");
assert.equal(visibleSignal.decisionStillValid, true);
assert.equal(visibleSignal.requestedDirection, "up");
assert.equal(visibleSignal.committedDirection, "down");

const highDeltaContext = {
  ...context,
  botCommittedDirection: { 2: "down" },
  botPendingReverseDirection: { 2: "up" },
  botPendingReverseFrames: { 2: 8 },
};
const highDeltaPlayer = { ...player, position: { x: 5 * TILE_SIZE + TILE_SIZE / 2, y: 6 * TILE_SIZE + 8 } };
assert.equal(
  getStableBotDirection(highDeltaPlayer, "up", 100, highDeltaContext),
  "up",
  "a long simulation step must not skip the center turn window",
);

const dangerContext = {
  ...context,
  botCommittedDirection: { 2: "down" },
  botPendingReverseDirection: { 2: null },
  botPendingReverseFrames: { 2: 0 },
  dangerMap: new Map([["5,6", 100]]),
};
const dangerPlayer = {
  ...player,
  tile: { x: 5, y: 5 },
  position: { x: 5 * TILE_SIZE + TILE_SIZE / 2, y: 5 * TILE_SIZE + TILE_SIZE * 0.75 },
};
assert.equal(
  getStableBotDirection(dangerPlayer, "up", 1000 / 60, dangerContext),
  "up",
  "danger on the committed next tile must override route stabilization",
);

const twoFramePlayer = {
  ...player,
  tile: { x: 5, y: 5 },
  position: { x: 5 * TILE_SIZE + TILE_SIZE / 2, y: 5 * TILE_SIZE + TILE_SIZE / 2 },
};
const twoFrameContext = {
  ...context,
  botCommittedDirection: { 2: "down" },
  botPendingReverseDirection: { 2: null },
  botPendingReverseFrames: { 2: 0 },
  dangerMap: new Map(),
};
assert.equal(getStableBotDirection(twoFramePlayer, "up", 1000 / 60, twoFrameContext), "down");
twoFramePlayer.position.y += TILE_SIZE * (1000 / 60) / BASE_MOVE_MS;
twoFramePlayer.tile.y = Math.floor(twoFramePlayer.position.y / TILE_SIZE);
assert.equal(
  getStableBotDirection(twoFramePlayer, "up", 1000 / 60, twoFrameContext),
  "up",
  "the second consecutive opposite request at the turn point must satisfy the two-frame confirmation",
);

for (const speedLevel of [0, 4]) {
  const alternatingPlayer = {
    ...player,
    speedLevel,
    tile: { x: 5, y: 5 },
    position: { x: 5 * TILE_SIZE + TILE_SIZE / 2, y: 5 * TILE_SIZE + TILE_SIZE / 2 },
    direction: "down",
    lastMoveDirection: "down",
  };
  const alternatingContext = {
    ...context,
    botCommittedDirection: { 2: "down" },
    botPendingReverseDirection: { 2: null },
    botPendingReverseFrames: { 2: 0 },
    dangerMap: new Map(),
  };
  let reversals = 0;
  let executedDirection = "down";

  for (let frame = 0; frame < 80; frame += 1) {
    const requestedDirection = frame % 2 === 0 ? "up" : "down";
    const nextDirection = getStableBotDirection(
      alternatingPlayer,
      requestedDirection,
      1000 / 60,
      alternatingContext,
    );
    if (nextDirection !== executedDirection) {
      reversals += 1;
      executedDirection = nextDirection;
    }
    alternatingPlayer.position.y += nextDirection === "down" ? 1.5 : -1.5;
    alternatingPlayer.tile.y = Math.floor(alternatingPlayer.position.y / TILE_SIZE);
  }

  assert.equal(reversals, 0, `alternating one-frame requests must not oscillate at speed level ${speedLevel}`);
  assert.ok(
    alternatingPlayer.position.y > 5 * TILE_SIZE + TILE_SIZE / 2,
    `stable route must keep making progress at speed level ${speedLevel}`,
  );
}
