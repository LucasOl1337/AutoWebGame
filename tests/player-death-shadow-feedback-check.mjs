import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const drawPlayerStart = source.indexOf("  private drawPlayer(player: PlayerState): void {");
const drawPlayerEnd = source.indexOf("\n  private ", drawPlayerStart + 1);
const drawPlayer = drawPlayerStart >= 0 && drawPlayerEnd > drawPlayerStart
  ? source.slice(drawPlayerStart, drawPlayerEnd)
  : "";

assert.ok(drawPlayer, "drawPlayer must remain available as the player rendering seam");
assert.match(
  drawPlayer,
  /const alpha = player\.alive \? 1 : \(deathState \? 1 : 0\.35\);/,
  "the existing visual alpha contract must remain explicit",
);

const shadowFillStart = drawPlayer.indexOf('this.ctx.fillStyle = "rgba(10, 8, 7, 0.32)";');
const shadowStart = drawPlayer.lastIndexOf("this.ctx.save();", shadowFillStart);
const shadowEnd = drawPlayer.indexOf("    if (sprite)", shadowStart);
const shadowBlock = shadowStart >= 0 && shadowEnd > shadowStart
  ? drawPlayer.slice(shadowStart, shadowEnd)
  : "";

assert.ok(shadowBlock, "the player shadow block must remain available");
assert.match(shadowBlock, /this\.ctx\.save\(\);/, "shadow alpha must be isolated from later drawing");
assert.match(shadowBlock, /this\.ctx\.globalAlpha = alpha;/, "shadow must respect the player's visual alpha");
assert.match(shadowBlock, /this\.ctx\.restore\(\);/, "shadow rendering must restore the live canvas state");
assert.ok(
  shadowBlock.indexOf("this.ctx.globalAlpha = alpha;") < shadowBlock.indexOf("this.ctx.fill();"),
  "visual alpha must be applied before filling the shadow",
);
assert.doesNotMatch(
  drawPlayer.slice(0, shadowStart),
  /globalAlpha = alpha/,
  "the live-player path must keep alpha at 1 until the shadow is drawn",
);

console.log(JSON.stringify({
  deadFallbackAlpha: 0.35,
  liveAlpha: 1,
  shadowUsesVisualAlpha: true,
  shadowStateIsolated: true,
  pass: true,
}, null, 2));
