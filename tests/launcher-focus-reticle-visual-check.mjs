import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [css, entry] = await Promise.all([
  readFile(new URL("../src/UiLayouts/launcher-focus-reticle.css", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8"),
]);

assert.match(entry, /import "\.\/launcher-focus-reticle\.css";/, "launcher must consume the focus treatment");
assert.match(css, /:focus-visible/, "focus treatment must not activate for ordinary pointer interaction");
assert.match(css, /\.launcher-mode/, "mode cards must receive the tactical reticle");
assert.match(css, /\.launcher-sheet-command/, "the selected-mode command must receive the tactical reticle");
assert.match(css, /prefers-reduced-motion: reduce/, "focus animation must respect reduced motion");
assert.match(css, /forced-colors: active/, "focus feedback must survive forced-color mode");
assert.match(css, /pointer-events: none/, "decorative reticle must not intercept clicks");

console.log("launcher focus reticle visual contract: ok");
