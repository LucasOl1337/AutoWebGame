import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const catalog = await import("../output/esm/Arenas/canonical-arena-catalog.js");
const map = catalog.getCanonicalArenaMap();
const assetRoot = new URL("../public/Assets/TileMaps/canonical/cidadela-arcana/r1/", import.meta.url);

const expected = Object.freeze({
  "tile-atlas.svg": "ecf456e38e98f19fcc3b6612ba358b10a3780b54be22f4a68bdee68770f4601f",
  "thumbnail.svg": "d5d2b5116edee0831531a9f20f42659f1c61b675a1a05375d51b598a6f022ca1",
});

let totalBytes = 0;
for (const [name, digest] of Object.entries(expected)) {
  const bytes = await readFile(new URL(name, assetRoot));
  totalBytes += bytes.byteLength;
  assert.equal(createHash("sha256").update(bytes).digest("hex"), digest);
}
assert.ok(totalBytes <= map.assets.budgetBytes);
assert.equal(map.assets.atlas.sha256, `sha256:${expected["tile-atlas.svg"]}`);
assert.equal(map.assets.thumbnail.sha256, `sha256:${expected["thumbnail.svg"]}`);

const thumbnail = await readFile(new URL("thumbnail.svg", assetRoot), "utf8");
const atlas = await readFile(new URL("tile-atlas.svg", assetRoot), "utf8");
assert.match(atlas, /^<svg[^>]*width="384"[^>]*height="64"[^>]*viewBox="0 0 384 64"/);
assert.match(atlas, /<metadata>cidadela-arcana\/r1 tile-atlas\.v1<\/metadata>/);
assert.deepEqual(
  [...atlas.matchAll(/<g id="([^"]+)"(?: transform="translate\((\d+)\)")?/g)].map((match) => ({
    id: match[1],
    x: Number(match[2] ?? 0),
  })),
  [
    { id: "floor-base", x: 0 },
    { id: "floor-lane", x: 64 },
    { id: "floor-spawn", x: 128 },
    { id: "portal", x: 192 },
    { id: "solid", x: 256 },
    { id: "breakable", x: 320 },
  ],
);
for (const source of [atlas, thumbnail]) {
  assert.doesNotMatch(source, /<script\b|<foreignObject\b|\b(?:href|xlink:href)\s*=\s*["'](?:https?:|data:|\/\/)/i);
}
assert.equal(`${thumbnail.trimEnd()}\n`, catalog.deriveArenaMapThumbnailSvg(map));
assert.equal((thumbnail.match(/<rect /g) ?? []).length, 100);
assert.ok(thumbnail.includes('aria-label="Cidadela Arcana r1"'));
assert.match(thumbnail, /^<svg[^>]*width="100%"[^>]*height="100%"[^>]*viewBox="0 0 552 456"/);
assert.equal(map.assets.atlas.path, "/Assets/TileMaps/canonical/cidadela-arcana/r1/tile-atlas.svg");
assert.equal(map.assets.thumbnail.path, "/Assets/TileMaps/canonical/cidadela-arcana/r1/thumbnail.svg");
assert.equal(map.assets.atlas.mediaType, "image/svg+xml");
assert.equal(map.assets.thumbnail.mediaType, "image/svg+xml");
assert.deepEqual(map.assets.preload, [map.assets.atlas.path, map.assets.thumbnail.path]);

console.log(JSON.stringify({ pass: true, totalBytes, budgetBytes: map.assets.budgetBytes, expected }, null, 2));
