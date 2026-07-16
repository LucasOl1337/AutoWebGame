import assert from "node:assert/strict";
import fs from "node:fs";

const worker = fs.readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");
assert.match(worker, /ContinuousRoomCanaryAuthority/);
assert.match(worker, /createContinuousRoomCanaryCommandResponse/);
assert.match(worker, /\/api\/canonical\/continuous-room\/canary\/commands/);
assert.match(worker, /\/internal\/canonical\/continuous-room\/canary\/commands/);
assert.match(worker, /new ContinuousRoomCanaryAuthority\(this\.ctx\.storage\)/);
assert.match(worker, /async alarm\(\)[\s\S]*advanceDueSessions\(\)/);
assert.doesNotMatch(worker, /isContinuousRoomRoute/, "opaque Sala routes must stay on the canonical SPA document, not game.html");
assert.doesNotMatch(worker, /online_server\.mjs/, "legacy relay cannot become the canary authority");

console.log("continuous-room-canary-worker-wiring-check: ok");
