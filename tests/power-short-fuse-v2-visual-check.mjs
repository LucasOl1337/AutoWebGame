import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const assetPath = path.join(root, "public/Assets/UiLayouts/power-short-fuse-v2.png");
const loaderPath = path.join(root, "src/Engine/assets.ts");
const png = fs.readFileSync(assetPath);
const loader = fs.readFileSync(loaderPath, "utf8");

assert.equal(png.toString("ascii", 1, 4), "PNG", "sprite must be a PNG");
assert.equal(png.readUInt32BE(16), 64, "Short Fuse sprite must keep the 64px runtime width");
assert.equal(png.readUInt32BE(20), 64, "Short Fuse sprite must keep the 64px runtime height");
assert.equal(png[25], 6, "Short Fuse sprite must use RGBA for transparent arena edges");
assert.ok(png.byteLength < 12_000, "Short Fuse sprite must remain lightweight");
assert.match(loader, /power-short-fuse-v2\.png/, "asset loader must consume the refreshed sprite");
assert.match(loader, /"short-fuse-up": shortFuseUp/, "refreshed sprite must remain mapped to short-fuse-up");

console.log(JSON.stringify({
  asset: "power-short-fuse-v2.png",
  dimensions: "64x64",
  bytes: png.byteLength,
  rgba: png[25] === 6,
  consumer: "loadGameAssets -> powerUps.short-fuse-up",
  pass: true,
}, null, 2));
