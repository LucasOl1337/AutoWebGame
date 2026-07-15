import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [sessionSource, css] = await Promise.all([
  readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8"),
]);

assert.match(
  sessionSource,
  /option\.setAttribute\("aria-pressed", selected \? "true" : "false"\)/,
  "character options must expose their selected state accessibly",
);
assert.match(
  sessionSource,
  /selectionSigil\.className = "experience-character-option__selection-sigil"/,
  "the live character option must consume the selection sigil",
);
assert.match(
  css,
  /\.experience-character-option\[data-selected="true"\] \.experience-character-option__portrait\s*\{[^}]*outline:[^}]*box-shadow:/s,
  "the selected portrait must gain a high-contrast focus ring",
);
assert.match(
  css,
  /\.experience-character-option\[data-selected="true"\] \.experience-character-option__selection-sigil\s*\{[^}]*opacity: 1;[^}]*animation: character-selection-sigil/s,
  "the selected option must reveal the animated identity sigil",
);
assert.match(
  css,
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.experience-character-option\[data-selected="true"\] \.experience-character-option__selection-sigil\s*\{[^}]*animation: none/s,
  "the sigil must remain readable without animation when reduced motion is requested",
);

console.log(JSON.stringify({
  pass: true,
  delivery: "Selo de Combatente",
  consumer: "live lobby character selector",
  accessibleState: true,
  reducedMotion: true,
}, null, 2));
