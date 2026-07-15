import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const favicon = await readFile(new URL("../public/favicon.svg", import.meta.url), "utf8");
const landing = await readFile(new URL("../index.html", import.meta.url), "utf8");

assert.match(favicon, /viewBox="0 0 64 64"/, "favicon should be authored on a pixel-friendly 64px grid");
assert.match(favicon, /aria-label="AutoWebGame — bomba prisma"/, "favicon should retain an accessible identity");
assert.match(favicon, /<circle cx="32" cy="40" r="18"/, "bomb silhouette should dominate the small canvas");
assert.match(favicon, /stroke="#f27834" stroke-width="2"/, "brand-orange perimeter should preserve contrast at tab size");
assert.match(favicon, /id="spark"/, "lit fuse should remain a distinct high-luminance focal point");
assert.doesNotMatch(favicon, /rgba\(/, "SVG paint values should remain portable across browsers");
assert.match(landing, /rel="icon" type="image\/svg\+xml" href="favicon\.svg"/, "landing page should consume the final favicon");

console.log("favicon bomba-prisma visual check passed");
