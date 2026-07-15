import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [entry, styles, shell] = await Promise.all([
  readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/launcher-material-vitrine.css", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/launcher-shell.ts", import.meta.url), "utf8"),
]);

assert.match(entry, /import "\.\/launcher-material-vitrine\.css";/, "material showcase must load in the active frontend entry");
assert.match(shell, /launcher-material-grid/, "showcase must target the live launcher material grid");
assert.match(styles, /\.launcher-material-sample:hover/, "material samples need a clear hover response");
assert.match(styles, /@media \(hover: none\)/, "touch devices need a persistent material edge");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none/, "motion must respect user preference");
assert.match(styles, /@media \(forced-colors: active\)/, "focus treatment must remain legible in forced colors");

console.log("launcher material showcase visual contract passed");
