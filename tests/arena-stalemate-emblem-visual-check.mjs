import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const assetUrl = new URL("../public/Assets/UiLayouts/arena-stalemate-emblem.png", import.meta.url);
const [asset, assetStats, assetsSource, gameSource] = await Promise.all([
  readFile(assetUrl),
  stat(assetUrl),
  readFile(new URL("../src/Engine/assets.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8"),
]);

assert.deepEqual([...asset.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "emblem must be a PNG");
assert.equal(asset.readUInt32BE(16), 101, "trimmed emblem width changed unexpectedly");
assert.equal(asset.readUInt32BE(20), 160, "trimmed emblem height changed unexpectedly");
assert.equal(asset[25], 6, "emblem must preserve RGBA transparency");
assert.ok(assetStats.size < 40_000, "HUD emblem should remain lightweight");

assert.match(assetsSource, /stalemateEmblem:\s*HTMLImageElement \| null/);
assert.match(assetsSource, /arena-stalemate-emblem\.png/);
assert.match(gameSource, /stalemateEmblem:\s*this\.roundOutcome\.winner === null/);
assert.match(gameSource, /stalemateEmblem:\s*this\.matchWinner === null/);
assert.match(gameSource, /showStalemateEmblem[\s\S]*this\.assets\.ui\?\.stalemateEmblem/);
assert.match(gameSource, /this\.ctx\.drawImage\(stalemateEmblem, 67, 176, 55, 78\)/);

console.log("arena stalemate emblem visual check passed");
