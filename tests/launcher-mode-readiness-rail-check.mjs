import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(repoRoot, "src/UiLayouts/launcher-shell.css"), "utf8");

assert.match(
  css,
  /\.launcher-shell--control \.launcher-mode__name::after\s*\{[\s\S]*?repeating-linear-gradient\(/,
  "every mode should expose a low-emphasis readiness rail",
);
assert.match(
  css,
  /\.launcher-shell--control \.launcher-mode\.is-selected \.launcher-mode__name::after\s*\{[\s\S]*?content:\s*"READY"/,
  "the selected mode should label its readiness rail",
);
assert.match(
  css,
  /\.launcher-shell--control \.launcher-mode\.is-selected \.launcher-mode__name::after\s*\{[\s\S]*?var\(--control-signal\)/,
  "the selected rail should use the launcher signal color",
);
assert.match(
  css,
  /@media \(max-width: 480px\)[\s\S]*?\.launcher-shell--control \.launcher-mode__name::after[\s\S]*?width:\s*96px/,
  "the rail should remain compact on narrow screens",
);
assert.match(
  css,
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.launcher-shell--control \.launcher-mode__name::after\s*\{[\s\S]*?transition:\s*none/,
  "the readiness rail should respect reduced motion",
);

console.log("launcher mode readiness rail checks passed");
