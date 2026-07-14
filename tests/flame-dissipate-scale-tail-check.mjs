import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const drawFlameStart = source.indexOf("  private drawFlame(flame: FlameState): void {");
const drawFlameEnd = source.indexOf("\n  private ", drawFlameStart + 1);
const drawFlame = drawFlameStart >= 0 && drawFlameEnd > drawFlameStart
  ? source.slice(drawFlameStart, drawFlameEnd)
  : "";

assert.ok(drawFlame, "drawFlame must remain available as the flame rendering seam");
assert.match(
  drawFlame,
  /const dissipateScale = 0\.9 \+ alpha \* 0\.1;/,
  "the existing tail alpha should drive a subtle 0.90-to-1.00 contraction",
);
assert.match(drawFlame, /const centerX = x \+ TILE_SIZE \* 0\.5;/, "horizontal scaling must use the tile center");
assert.match(drawFlame, /const centerY = y \+ TILE_SIZE \* 0\.5;/, "vertical scaling must use the tile center");

const centeredScale = /translate\(centerX, centerY\);\s*this\.ctx\.scale\(dissipateScale, dissipateScale\);\s*this\.ctx\.translate\(-centerX, -centerY\);/g;
const centeredScaleUses = [...drawFlame.matchAll(centeredScale)].length;
assert.equal(centeredScaleUses, 2, "sprite and fallback paths should share the centered contraction");
assert.ok(
  drawFlame.indexOf("this.ctx.scale(dissipateScale, dissipateScale);") < drawFlame.indexOf("this.ctx.drawImage("),
  "sprite rendering should apply the contraction before drawing",
);
assert.ok(
  drawFlame.lastIndexOf("this.ctx.scale(dissipateScale, dissipateScale);") < drawFlame.indexOf("this.ctx.fillRect("),
  "fallback rendering should apply the contraction before drawing",
);
assert.doesNotMatch(drawFlame, /flame\.remainingMs\s*=/, "rendering must not alter authoritative flame timing");
assert.match(source, /const FLAME_DISSIPATE_TAIL_MS = 120;/, "the existing tail timing must remain unchanged");

console.log(JSON.stringify({
  scaleRange: [0.9, 1],
  centeredScaleUses,
  spriteUsesScale: true,
  fallbackUsesScale: true,
  preservesTiming: true,
  pass: true,
}, null, 2));
