import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [entry, styles, shell] = await Promise.all([
  readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/launcher-mode-scanner.css", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/launcher-shell.ts", import.meta.url), "utf8"),
]);

assert.match(entry, /import "\.\/launcher-mode-scanner\.css";/, "scanner layer must load in the active frontend entry");
assert.match(shell, /launcher-mode__art/, "scanner must target the live mode artwork");
assert.match(styles, /\.launcher-mode\.is-selected \.launcher-mode__art::after/, "only the selected mode should run the scanner");
assert.match(styles, /@keyframes launcher-mode-scan/, "scanner must define its visual sweep");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/, "motion must respect user preference");
assert.match(styles, /@media \(forced-colors: active\)/, "selected state must remain legible in forced colors");

console.log("launcher mode scanner visual contract passed");
