import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const styles = await readFile(
  new URL("../src/UiLayouts/arena-entry-sequencer.css", import.meta.url),
  "utf8",
);

assert.match(styles, /--entry-runner-size:/, "the ignition pulse needs a responsive size");
assert.match(styles, /\.experience-seat-strip:has\(\.experience-seat-pill--loading\)::after/, "the active setup strip needs a runner layer");
assert.match(styles, /animation:\s*arena-entry-runner/, "the runner layer needs a named motion");
assert.match(styles, /@keyframes\s+arena-entry-runner/, "the ignition pulse needs keyframes");
assert.match(styles, /left:\s*calc\(92%\s*-\s*var\(--entry-runner-size\)\)/, "the pulse must travel across the full sequence");
assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.experience-seat-strip:has\(\.experience-seat-pill--loading\)::after\s*\{\s*display:\s*none;/, "compact screens must hide the runner instead of crowding the cards");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.experience-seat-strip:has\(\.experience-seat-pill--loading\)::after\s*\{\s*animation:\s*none;/, "reduced motion must disable the runner");

console.log("arena entry ignition pulse visual contract: ok");
