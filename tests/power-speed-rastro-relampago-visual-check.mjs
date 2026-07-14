import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const assetPath = "/Assets/UiLayouts/power-speed-rastro-relampago.png";
const [assetsSource, png] = await Promise.all([
  readFile(new URL("../src/Engine/assets.ts", import.meta.url), "utf8"),
  readFile(new URL(`../public${assetPath}`, import.meta.url)),
]);

assert.ok(
  assetsSource.includes(`loadImage(assetUrl("${assetPath}"))`),
  "the real asset loader must load Rastro Relampago",
);
assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", "asset must be a PNG");
assert.equal(png.readUInt32BE(16), 32, "asset width must match its primary canvas size");
assert.equal(png.readUInt32BE(20), 32, "asset height must match its primary canvas size");
assert.equal(png[25], 6, "asset must preserve RGBA transparency");
assert.ok(png.byteLength <= 4096, "asset must remain lightweight for arena and HUD use");

console.log(JSON.stringify({
  pass: true,
  asset: assetPath,
  dimensions: "32x32",
  bytes: png.byteLength,
  rgba: true,
  consumer: "speed-up map pickup and HUD slot",
}, null, 2));
