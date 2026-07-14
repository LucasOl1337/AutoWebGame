import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../game.html", import.meta.url), "utf8");
const png = await readFile(
  new URL("../public/Assets/UiLayouts/favicon-bomba-coroa.png", import.meta.url),
);

assert.match(
  html,
  /<link rel="icon" type="image\/png" sizes="32x32" href="\/Assets\/UiLayouts\/favicon-bomba-coroa\.png" \/>/,
  "game.html must load the Bomba-Coroa favicon at its intended display size",
);
assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", "favicon must be a PNG");
assert.equal(png.readUInt32BE(16), 32, "favicon width must be 32px");
assert.equal(png.readUInt32BE(20), 32, "favicon height must be 32px");
assert.equal(png[25], 6, "favicon must preserve RGBA transparency");
assert.ok(png.byteLength <= 4096, "favicon must stay lightweight");

console.log(
  JSON.stringify({
    pass: true,
    asset: "/Assets/UiLayouts/favicon-bomba-coroa.png",
    dimensions: "32x32",
    bytes: png.byteLength,
    rgba: true,
  }),
);
