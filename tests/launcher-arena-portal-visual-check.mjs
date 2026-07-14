import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const shell = await readFile(new URL("../src/UiLayouts/launcher-shell.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../src/UiLayouts/launcher-shell.css", import.meta.url), "utf8");
const asset = new URL("../public/Assets/UiLayouts/arena-portal-emblem.webp", import.meta.url);
const info = await stat(asset);

assert.match(shell, /mode\.id === "play"[\s\S]*arena-portal-emblem\.webp/,
  "arena portal art must be rendered only by the Arena mode");
assert.match(shell, /class="launcher-mode__art" aria-hidden="true"/,
  "decorative art must stay out of the accessibility tree");
assert.match(css, /\.launcher-mode__art img[\s\S]*image-rendering: pixelated/,
  "launcher art must preserve pixel edges at display size");
assert.match(css, /\.launcher-mode\.is-selected \.launcher-mode__art/,
  "art must be visible for keyboard-selected Arena mode");
assert.ok(info.size > 10_000 && info.size < 220_000,
  `arena portal asset size should stay production-friendly, got ${info.size} bytes`);

console.log("launcher arena portal visual contract: ok");
