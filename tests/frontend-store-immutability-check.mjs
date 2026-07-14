import assert from "node:assert/strict";

import { FrontendStore } from "../output/esm/UiLayouts/frontend-store.js";

const store = new FrontendStore("launcher");
const initialSnapshot = store.getSnapshot();
let notificationCount = 0;
let notifiedSnapshot;

store.subscribe((snapshot) => {
  notificationCount += 1;
  notifiedSnapshot = snapshot;
});

assert.equal(Object.isFrozen(initialSnapshot), true, "initial snapshot must be frozen at runtime");
assert.throws(() => {
  initialSnapshot.route = "lab";
}, TypeError);
assert.equal(store.getSnapshot().route, "launcher");

store.setRoute("training");
assert.equal(notificationCount, 1);
assert.equal(Object.isFrozen(notifiedSnapshot), true, "updated snapshots must be frozen at runtime");
assert.equal(notifiedSnapshot.route, "training");

store.setRoute("training");
assert.equal(notificationCount, 1, "equivalent updates must remain deduplicated");

console.log("frontend store runtime immutability contract: ok");
