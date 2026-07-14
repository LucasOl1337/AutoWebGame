import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const assetPath = new URL("../public/Assets/UiLayouts/power-bomb.png", import.meta.url);
const loaderPath = new URL("../src/Engine/assets.ts", import.meta.url);
const png = await readFile(assetPath);
const loader = await readFile(loaderPath, "utf8");

assert.equal(png.toString("ascii", 1, 4), "PNG", "Bomb Up must remain a PNG asset");
assert.equal(png.readUInt32BE(16), 64, "Bomb Up source width must be 64 px");
assert.equal(png.readUInt32BE(20), 64, "Bomb Up source height must be 64 px");
assert.equal(png[25], 6, "Bomb Up PNG must use RGBA color type");
assert.ok(png.byteLength <= 12_000, "Bomb Up icon must stay within the 12 KB loading budget");
assert.match(loader, /\/Assets\/UiLayouts\/power-bomb\.png/, "runtime asset loader must consume Bomb Up");

console.log("power-bomb visual contract: ok");
