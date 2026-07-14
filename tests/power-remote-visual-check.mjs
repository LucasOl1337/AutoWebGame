import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const assetUrl = new URL("../public/Assets/UiLayouts/power-remote.png", import.meta.url);
const loaderUrl = new URL("../src/Engine/assets.ts", import.meta.url);
const [asset, info, loader] = await Promise.all([
  readFile(assetUrl),
  stat(assetUrl),
  readFile(loaderUrl, "utf8"),
]);

assert.equal(asset.toString("ascii", 1, 4), "PNG", "remote pickup must remain a PNG");
assert.equal(asset.readUInt32BE(16), 64, "remote pickup must be 64 px wide");
assert.equal(asset.readUInt32BE(20), 64, "remote pickup must be 64 px tall");
assert.ok([4, 6].includes(asset[25]), "remote pickup must preserve an alpha channel");
assert.ok(info.size > 1_500 && info.size < 40_000,
  `remote pickup should be detailed but lightweight, got ${info.size} bytes`);
assert.match(loader, /loadImage\(assetUrl\("\/Assets\/UiLayouts\/power-remote\.png"\)\)/,
  "the production asset loader must consume the remote pickup");

console.log("remote pickup visual contract: ok");
