import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const assetPath = new URL("../public/Assets/UiLayouts/power-remote.png", import.meta.url);
const loaderPath = new URL("../src/Engine/assets.ts", import.meta.url);
const [png, loader] = await Promise.all([
  readFile(assetPath),
  readFile(loaderPath, "utf8"),
]);

assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "asset must be a PNG");
assert.equal(png.readUInt32BE(16), 64, "remote power-up must keep its 64 px runtime width");
assert.equal(png.readUInt32BE(20), 64, "remote power-up must keep its 64 px runtime height");
assert.equal(png[25], 6, "remote power-up must use RGBA color for transparent arena edges");
assert.ok(png.byteLength < 16_000, "remote power-up should remain lightweight");
assert.match(loader, /power-remote\.png/, "asset loader must consume the final remote power-up icon");
assert.match(loader, /"remote-up": remoteUp/, "loaded icon must remain mapped to the remote power-up");

console.log(`power remote high-readability visual check passed (${png.byteLength} bytes)`);
