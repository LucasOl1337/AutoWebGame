import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [entry, css] = await Promise.all([
  readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/room-code-reactor.css", import.meta.url), "utf8"),
]);

assert.match(entry, /import "\.\/room-code-reactor\.css";/, "room code reactor must ship in the active frontend bundle");
assert.match(css, /data-screen="lobbies"/, "effect must stay scoped to the real lobby screen");
assert.match(css, /\.experience-room-code__actions:focus-within/, "reactor must visibly acknowledge keyboard focus");
assert.match(css, /font-variant-numeric:\s*tabular-nums/, "room codes must keep stable character spacing");
assert.match(css, /text-transform:\s*uppercase/, "room codes must preserve the uppercase console treatment");
assert.match(css, /@media \(max-width: 760px\)/, "reactor must retain a dedicated mobile layout");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, "reactor must respect reduced-motion preferences");

console.log("Room code reactor visual contract verified.");
