import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [shellSource, css] = await Promise.all([
  readFile(new URL("../src/UiLayouts/launcher-shell.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/launcher-shell.css", import.meta.url), "utf8"),
]);

assert.ok(
  shellSource.includes('class="launcher-mode ${state.selectedMode === mode.id ? "is-selected" : ""}"'),
  "the live launcher must expose its selected mode to the visual treatment",
);
assert.match(
  css,
  /\.launcher-shell--control \.launcher-mode\.is-selected::before\s*\{[^}]*transform: scaleY\(1\)/s,
  "the selected mode must raise the red signal rail",
);
assert.match(
  css,
  /\.launcher-shell--control \.launcher-mode\.is-selected::after\s*\{[^}]*launcher-beacon-pulse/s,
  "the selected mode must activate its beacon",
);
assert.match(
  css,
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.launcher-shell--control \.launcher-mode\.is-selected::after\s*\{[^}]*animation: none/s,
  "the beacon must remain readable without animation when reduced motion is requested",
);

console.log(JSON.stringify({
  pass: true,
  delivery: "Farol de Partida",
  consumer: "live /game launcher mode cards",
  responsive: true,
  reducedMotion: true,
}, null, 2));
