import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");

assert.match(source, /DANGER_OVERLAY_PULSE_FAST_MS = 220/);
assert.match(source, /DANGER_OVERLAY_PULSE_SLOW_MS = 420/);
assert.match(source, /const urgency = 1 - Math\.min\(1, tile\.etaMs \/ DANGER_OVERLAY_MAX_ETA_MS\)/);
assert.match(source, /const pulsePeriodMs = DANGER_OVERLAY_PULSE_SLOW_MS/);
assert.match(source, /Math\.sin\(\(this\.animationClockMs \/ pulsePeriodMs\) \* Math\.PI \* 2\)/);
assert.match(source, /const markerY = screenY \+ TILE_SIZE - 7/);
assert.match(source, /this\.ctx\.lineTo\(screenX \+ TILE_SIZE - 9, screenY \+ 9\)/);

console.log("danger overlay pulse visual check passed");
