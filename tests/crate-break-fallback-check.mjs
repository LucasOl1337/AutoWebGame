import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const drawStart = source.indexOf("  private drawCrateBreakAnimation(effect: CrateBreakAnimation): void {");
const drawEnd = source.indexOf("\n  private ", drawStart + 1);
const drawCrateBreak = drawStart >= 0 && drawEnd > drawStart
  ? source.slice(drawStart, drawEnd)
  : "";

assert.ok(drawCrateBreak, "drawCrateBreakAnimation must remain available as the rendering seam");
assert.match(
  drawCrateBreak,
  /const progress = Math\.min\(1, effect\.elapsedMs \/ CRATE_BREAK_DURATION_MS\);/,
  "fallback must keep using the existing elapsed progress and crate-break duration",
);
assert.match(
  drawCrateBreak,
  /if \(frames\.length > 0\)[\s\S]*?this\.ctx\.drawImage\(frame,[\s\S]*?return;/,
  "sprite frames must retain their early-return path",
);

const fragmentsMatch = drawCrateBreak.match(/const fragments = \[([\s\S]*?)\n    \];/);
assert.ok(fragmentsMatch, "fallback must define pixel fragments");
const fragmentCount = [...fragmentsMatch[1].matchAll(/\{ offsetX:/g)].length;
assert.ok(fragmentCount >= 3 && fragmentCount <= 4, "fallback must draw exactly 3-4 fragments");
assert.match(
  drawCrateBreak,
  /fragment\.driftX \* progress[\s\S]*fragment\.driftY \* progress/,
  "fragment travel must derive from the same fallback progress",
);
assert.match(
  drawCrateBreak,
  /fillRect\(fragmentX, fragmentY, fragment\.size, fragment\.size\);/,
  "fragments must be rendered as square pixel blocks",
);
assert.doesNotMatch(
  drawCrateBreak,
  /effect\.(?:elapsedMs|tile)\s*=/,
  "rendering must not mutate crate-break state or timing",
);

console.log(JSON.stringify({
  fragmentCount,
  sharesProgress: /fragment\.driftX \* progress/.test(drawCrateBreak),
  preservesDuration: /effect\.elapsedMs \/ CRATE_BREAK_DURATION_MS/.test(drawCrateBreak),
  preservesSpritePath: /this\.ctx\.drawImage\(frame,[\s\S]*?return;/.test(drawCrateBreak),
  pass: true,
}, null, 2));
