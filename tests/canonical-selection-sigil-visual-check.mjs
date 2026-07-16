import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [view, css] = await Promise.all([
  readFile(new URL("../src/FrontendKernel/CharacterSelection/canonical-character-selection-view.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/FrontendKernel/CharacterSelection/canonical-character-selection.css", import.meta.url), "utf8"),
]);

assert.match(
  view,
  /canonical-selection__selection-sigil/,
  "the live character card must consume the selection sigil",
);
assert.match(
  css,
  /\.canonical-selection__character--selected \.canonical-selection__selection-sigil\s*\{[^}]*opacity: 1;[^}]*animation: character-selection-sigil/s,
  "the selected fighter must reveal the animated identity sigil",
);
assert.match(
  css,
  /@keyframes character-selection-sigil[\s\S]*box-shadow:/,
  "the sigil must provide a visible focus pulse",
);
assert.match(
  css,
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.canonical-selection__character--selected \.canonical-selection__selection-sigil\s*\{[^}]*animation: none/s,
  "the sigil must remain static when reduced motion is requested",
);
assert.match(
  css,
  /@media \(forced-colors: active\)[\s\S]*\.canonical-selection__selection-sigil[\s\S]*color: CanvasText/s,
  "the sigil must retain contrast in forced-colors mode",
);

console.log(JSON.stringify({
  pass: true,
  delivery: "Sigilo de seleção do combatente",
  consumer: "canonical character selection",
  reducedMotion: true,
  forcedColors: true,
}, null, 2));
