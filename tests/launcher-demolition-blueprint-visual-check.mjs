import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cssPath = path.join(root, "src", "UiLayouts", "launcher-shell.css");
const assetPath = path.join(
  root,
  "public",
  "Assets",
  "UiLayouts",
  "launcher-demolition-blueprint.webp",
);

const [css, asset] = await Promise.all([readFile(cssPath, "utf8"), stat(assetPath)]);

assert.match(
  css,
  /\.launcher-sheet__header::after\s*\{[^}]*launcher-demolition-blueprint\.webp[^}]*\}/s,
  "the launcher header must render the generated demolition blueprint",
);
assert.match(css, /\.launcher-sheet__header\s*\{[^}]*overflow:\s*hidden/s);
assert.match(css, /pointer-events:\s*none/);
assert.ok(asset.size > 10_000, "the generated image must not be an empty placeholder");
assert.ok(asset.size < 80_000, "the decorative image should stay lightweight");

console.log(
  JSON.stringify({
    pass: true,
    asset: "launcher-demolition-blueprint.webp",
    bytes: asset.size,
    integration: "launcher-sheet__header::after",
  }),
);
