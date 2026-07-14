import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [mainTs, css, png] = await Promise.all([
  readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/bootstrap-drone.css", import.meta.url), "utf8"),
  readFile(new URL("../public/Assets/UiLayouts/bootstrap-drone-estopim.png", import.meta.url)),
]);

assert.match(mainTs, /import "\.\/bootstrap-drone\.css";/);
assert.match(css, /bootstrap-drone-estopim\.png/);
assert.match(css, /prefers-reduced-motion: reduce/);
assert.match(css, /image-rendering: pixelated/);

assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
assert.equal(png.readUInt32BE(16), 256);
assert.equal(png.readUInt32BE(20), 256);
assert.equal(png[25], 6, "asset must be RGBA PNG with transparency");

console.log("bootstrap drone visual contract ok");
