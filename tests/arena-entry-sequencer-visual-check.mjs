import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [documentSource, styles, sessionSource] = await Promise.all([
  readFile(new URL("../game.html", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/arena-entry-sequencer.css", import.meta.url), "utf8"),
  readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8"),
]);

assert.match(documentSource, /arena-entry-sequencer\.css/, "game.html must load the sequencer styles");
assert.match(sessionSource, /experience-seat-pill--loading/, "the active setup flow must render loading pills");
assert.match(sessionSource, /pill\.dataset\.state = step\.state/, "loading pills must expose their semantic state");

for (const state of ["ready", "active", "pending"]) {
  assert.match(styles, new RegExp(`data-state=["']${state}["']`), `${state} needs a distinct visual treatment`);
}

assert.match(styles, /prefers-reduced-motion:\s*reduce/, "motion must respect reduced-motion preferences");
assert.match(styles, /@media \(max-width: 760px\)/, "the sequence must adapt to compact screens");
assert.match(styles, /:has\(\.experience-seat-pill--loading\)/, "styles must stay scoped to loading states");

console.log("arena entry sequencer visual contract: ok");
