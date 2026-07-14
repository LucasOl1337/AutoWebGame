import assert from "node:assert/strict";
import fs from "node:fs";

const assetsSource = fs.readFileSync("src/Engine/assets.ts", "utf8");
const gameSource = fs.readFileSync("src/Engine/game-app.ts", "utf8");
const assetPath = "public/Assets/UiLayouts/arena-victory-emblem.webp";

assert.ok(fs.existsSync(assetPath), "victory emblem bitmap must exist");
assert.ok(fs.statSync(assetPath).size < 48 * 1024, "victory emblem must stay under 48 KiB");
assert.match(assetsSource, /arena-victory-emblem\.webp/, "asset loader must request the emblem");
assert.match(assetsSource, /ui:\s*\{\s*victoryEmblem,/s, "loaded emblem must be exposed through GameAssets.ui");
assert.match(gameSource, /victoryEmblem:\s*this\.roundOutcome\.winner !== null/, "round wins must opt into the emblem");
assert.match(gameSource, /victoryEmblem:\s*this\.matchWinner !== null/, "match wins must opt into the emblem");
assert.match(gameSource, /this\.ctx\.drawImage\(victoryEmblem, 67, 176, 55, 78\)/, "overlay must draw the emblem without distorting its aspect ratio");

console.log(JSON.stringify({
  assetPath,
  bytes: fs.statSync(assetPath).size,
  displayedAt: "55x78",
  pass: true,
}, null, 2));
