import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const drawFlameStart = source.indexOf("  private drawFlame(flame: FlameState): void {");
const drawFlameEnd = source.indexOf("\n  private ", drawFlameStart + 1);
const drawFlame = drawFlameStart >= 0 && drawFlameEnd > drawFlameStart
  ? source.slice(drawFlameStart, drawFlameEnd)
  : "";

assert.ok(drawFlame, "drawFlame must remain the flame rendering seam");
assert.match(drawFlame, /flame\.style === "toxic"/, "the toxic style must have a dedicated visual branch");
assert.match(drawFlame, /rgba\(76, 255, 166, 0\.34\)/, "toxic flames need a green aura fill");
assert.match(drawFlame, /rgba\(169, 255, 204, 0\.9\)/, "toxic flames need a bright readable outline");
assert.match(drawFlame, /this\.animationClockMs \/ 110/, "the toxic aura should breathe with the visual clock");
assert.match(drawFlame, /this\.ctx\.arc\(centerX, centerY, 15 \+ auraPulse \* 3\.5/, "the aura fill must expand beyond the flame body");
assert.match(drawFlame, /this\.ctx\.arc\(centerX, centerY, 16\.5 \+ auraPulse \* 3/, "the aura outline must sit outside the flame body");
assert.match(drawFlame, /this\.ctx\.globalAlpha = alpha \* /, "the aura must fade with flame dissipation");
assert.doesNotMatch(drawFlame, /flame\.remainingMs\s*=/, "rendering must not mutate authoritative flame timing");

console.log(JSON.stringify({
  style: "toxic",
  aura: "green radial pulse with bright outline",
  timingSource: "animationClockMs",
  fadesWithFlame: true,
  preservesTiming: true,
  pass: true,
}, null, 2));
