import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = await readFile(resolve(root, "index.html"), "utf8");
const assets = [
  ["/brand/bomba-prism-favicon-32.png", 2_000],
  ["/brand/bomba-prism-apple-touch.png", 30_000],
  ["/brand/bomba-prism-icon-512.png", 140_000],
];

for (const [publicPath, maxBytes] of assets) {
  const assetPath = resolve(root, "public", publicPath.slice(1));
  await access(assetPath);
  assert.match(html, new RegExp(`href=["']${publicPath.replaceAll("/", "\\/")}["']`));
  assert.ok((await stat(assetPath)).size <= maxBytes, `${publicPath} exceeds ${maxBytes} bytes`);
}

assert.doesNotMatch(html, /href=["']\/Assets\/UiLayouts\/ICON\.png["']/);
console.log("Bomba Prisma favicon and install icons are integrated and within budget.");
