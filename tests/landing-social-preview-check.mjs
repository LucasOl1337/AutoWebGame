import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const landingHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
const previewPath = path.join(
  root,
  "public",
  "Assets",
  "marketing",
  "hero-match-control-v2.webp",
);
const preview = fs.readFileSync(previewPath);
const previewUrl = "https://bombapvp.com/Assets/marketing/hero-match-control-v2.webp";

assert.match(landingHtml, /<meta name="theme-color" content="#050508" \/>/);
assert.match(landingHtml, /<meta property="og:type" content="website" \/>/);
assert.match(landingHtml, /<meta property="og:locale" content="pt_BR" \/>/);
assert.match(landingHtml, /<meta name="twitter:card" content="summary_large_image" \/>/);
assert.ok(
  landingHtml.includes(`<meta property="og:image" content="${previewUrl}" />`),
  "Open Graph should use the integrated marketing artwork",
);
assert.ok(
  landingHtml.includes(`<meta name="twitter:image" content="${previewUrl}" />`),
  "Twitter card should use the integrated marketing artwork",
);
assert.equal(preview.subarray(0, 4).toString("ascii"), "RIFF", "preview should be a WebP RIFF asset");
assert.equal(preview.subarray(8, 12).toString("ascii"), "WEBP", "preview should be a valid WebP container");
assert.ok(preview.length < 300_000, "social preview should stay below 300 KB");
assert.match(landingHtml, /<meta property="og:image:alt" content="[^"]+" \/>/);
assert.match(landingHtml, /<meta name="twitter:image:alt" content="[^"]+" \/>/);

console.log("Landing social preview contract ok");
