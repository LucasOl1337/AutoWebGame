import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const assetPath = new URL("../public/Assets/UiLayouts/power-flame.png", import.meta.url);
const loaderPath = new URL("../src/Engine/assets.ts", import.meta.url);
const [png, loader] = await Promise.all([
  readFile(assetPath),
  readFile(loaderPath, "utf8"),
]);

assert.equal(png.toString("ascii", 1, 4), "PNG", "Flame Up must remain a PNG asset");
assert.equal(png.readUInt32BE(16), 64, "Flame Up source width must be 64 px");
assert.equal(png.readUInt32BE(20), 64, "Flame Up source height must be 64 px");
assert.equal(png[25], 6, "Flame Up PNG must use RGBA color type");
assert.ok(png.byteLength <= 12_000, "Flame Up icon must stay within the 12 KB loading budget");
assert.match(
  loader,
  /loadImage\(assetUrl\("\/Assets\/UiLayouts\/power-flame\.png"\)\)/,
  "the production asset loader must consume Flame Up",
);

console.log("power-flame visual contract: ok");
