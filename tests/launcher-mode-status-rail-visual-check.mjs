import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const shell = await readFile(new URL("../src/UiLayouts/launcher-shell.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../src/UiLayouts/launcher-mode-status-rail.css", import.meta.url), "utf8");

assert.match(shell, /import "\.\/launcher-mode-status-rail\.css"/);
assert.match(shell, /class="launcher-mode-status" aria-label="Status do modo selecionado"/);
assert.match(shell, /selected\.id === "play" \? "60 tick"/);
assert.match(css, /\.launcher-mode-status__signal i/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /@media \(max-width: 480px\)/);

console.log("launcher mode status rail visual check: ok");
