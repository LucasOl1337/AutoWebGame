import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const drawFlameStart = source.indexOf("  private drawFlame(flame: FlameState): void {");
const drawFlameEnd = source.indexOf("\n  private ", drawFlameStart + 1);
const drawFlame = drawFlameStart >= 0 && drawFlameEnd > drawFlameStart
  ? source.slice(drawFlameStart, drawFlameEnd)
  : "";

assert.ok(drawFlame, "drawFlame must remain available as the flame rendering seam");
assert.match(source, /const FLAME_DISSIPATE_TAIL_MS = 120;/, "tail duration should be explicit and short");
assert.match(
  drawFlame,
  /Math\.min\(1, Math\.max\(0, flame\.remainingMs\) \/ FLAME_DISSIPATE_TAIL_MS\)/,
  "opacity should fade only inside the final tail window",
);
assert.match(drawFlame, /globalAlpha = alpha;/, "sprite flames should use the dissipating alpha");
assert.match(drawFlame, /palette = flame\.style === "toxic"/, "toxic and normal fallbacks should share the alpha");
assert.doesNotMatch(drawFlame, /flame\.remainingMs\s*=/, "rendering must not alter authoritative flame timing");

console.log(JSON.stringify({
  tailMs: 120,
  spriteUsesTail: /globalAlpha = alpha;/.test(drawFlame),
  fallbackUsesTail: /palette = flame\.style === "toxic"/.test(drawFlame),
  preservesTiming: !/flame\.remainingMs\s*=/.test(drawFlame),
  pass: true,
}, null, 2));
