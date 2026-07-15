import assert from "node:assert/strict";

const { createHeadlessSeriesWorkerController } = await import(
  "../output/esm/BotLab/headless-series-worker-controller.js"
);

const messages = [];
const waiters = new Set();
let eventHook = () => undefined;

function resolveWaiters(message) {
  messages.push(message);
  eventHook(message);
  for (const waiter of waiters) {
    if (!waiter.predicate(message)) continue;
    clearTimeout(waiter.timeout);
    waiters.delete(waiter);
    waiter.resolve(message);
    break;
  }
}

function waitFor(predicate, label, timeoutMs = 30_000) {
  const existing = messages.find(predicate);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve, reject) => {
    const waiter = {
      predicate,
      resolve,
      timeout: setTimeout(() => {
        waiters.delete(waiter);
        reject(new Error(`Timed out waiting for ${label}`));
      }, timeoutMs),
    };
    waiters.add(waiter);
  });
}

const controller = createHeadlessSeriesWorkerController({ post: resolveWaiters });

function startPlan(id, roundCount, botFill) {
  controller.handle({ type: "start", plan: { id, roundCount, botFill } });
}

startPlan("worker-complete-2p", 1, 1);
const firstComplete = await waitFor(
  (message) => message.type === "result" && message.receipt.id === "worker-complete-2p",
  "first complete receipt",
);
assert.equal(firstComplete.receipt.status, "complete");
assert.ok(messages.some((message) => (
  message.type === "snapshot"
  && message.snapshot.id === "worker-complete-2p"
  && message.snapshot.phase === "running"
)));

let concurrentTriggered = false;
eventHook = (message) => {
  if (
    concurrentTriggered
    || message.type !== "snapshot"
    || message.snapshot.id !== "worker-cancelled"
    || message.snapshot.completedRounds !== 1
    || message.snapshot.phase !== "running"
  ) return;
  concurrentTriggered = true;
  startPlan("worker-must-reject-concurrent", 1, 1);
  controller.handle({ type: "command", command: "cancel" });
};
startPlan("worker-cancelled", 2, 1);
const busy = await waitFor(
  (message) => message.type === "error" && message.error === "headless_series_already_active",
  "concurrent start rejection",
);
const cancelled = await waitFor(
  (message) => message.type === "result" && message.receipt.id === "worker-cancelled",
  "cancelled partial receipt",
);
eventHook = () => undefined;
assert.equal(busy.error, "headless_series_already_active");
assert.equal(cancelled.receipt.status, "cancelled-partial");
assert.equal(cancelled.receipt.completedRounds, 1);

startPlan("worker-complete-3p", 1, 2);
const threePlayers = await waitFor(
  (message) => message.type === "result" && message.receipt.id === "worker-complete-3p",
  "three-player receipt after cleanup",
);
assert.equal(threePlayers.receipt.status, "complete");

startPlan("worker-complete-4p", 1, 3);
const fourPlayers = await waitFor(
  (message) => message.type === "result" && message.receipt.id === "worker-complete-4p",
  "four-player receipt after cleanup",
);
assert.equal(fourPlayers.receipt.status, "complete");

controller.dispose();
controller.handle({ type: "command", command: "cancel" });

const disposeMessages = [];
let disposingController;
let disposeResolved;
const disposed = new Promise((resolve) => {
  disposeResolved = resolve;
});
disposingController = createHeadlessSeriesWorkerController({
  post(message) {
    disposeMessages.push(message);
    if (
      message.type === "snapshot"
      && message.snapshot.id === "worker-dispose-active"
      && message.snapshot.completedRounds === 1
      && message.snapshot.phase === "running"
    ) {
      disposingController.dispose();
      setTimeout(disposeResolved, 25);
    }
  },
});
disposingController.handle({
  type: "start",
  plan: { id: "worker-dispose-active", roundCount: 2, botFill: 1 },
});
await disposed;
assert.ok(disposeMessages.some((message) => message.type === "snapshot"));
assert.ok(!disposeMessages.some((message) => message.type === "result" || message.type === "error"));

console.log(JSON.stringify({
  complete2p: firstComplete.receipt.status,
  cancelled: cancelled.receipt.status,
  concurrent: busy.error,
  complete3p: threePlayers.receipt.status,
  complete4p: fourPlayers.receipt.status,
  pass: true,
}, null, 2));
