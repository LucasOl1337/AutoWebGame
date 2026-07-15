import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [entry, styles, shell] = await Promise.all([
  readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/launcher-execution-runway.css", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/launcher-shell.ts", import.meta.url), "utf8"),
]);

assert.match(entry, /import "\.\/launcher-execution-runway\.css";/, "runway layer must load in the active frontend entry");
assert.match(shell, /class="launcher-sheet-command" data-route="\$\{selected\.id\}"/, "runway must decorate the selected mode command");
assert.match(styles, /\.launcher-shell--control \.launcher-sheet-command::before/, "command must expose the directional runway layer");
assert.match(styles, /\.launcher-shell--control \.launcher-sheet-command::after[\s\S]*content: "EXEC"/, "command must expose a compact execution marker");
assert.match(styles, /\.launcher-sheet-command:active[\s\S]*transform: translate\(3px, 3px\)/, "press must provide tactile displacement");
assert.match(styles, /@media \(max-width: 480px\)/, "runway must adapt to narrow screens");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition: none/, "motion must respect user preference");

console.log("launcher execution runway visual contract passed");
