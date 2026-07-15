import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [entry, styles, shell] = await Promise.all([
  readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/launcher-detonator-cta.css", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/launcher-shell.ts", import.meta.url), "utf8"),
]);

assert.match(entry, /import "\.\/launcher-detonator-cta\.css";/, "visual layer must load in the active frontend entry");
assert.match(shell, /class="launcher-primary" data-route="play"/, "effect must target the active quick-match CTA");
assert.match(styles, /\.launcher-shell--control \.launcher-primary::before/, "CTA must expose the fuse sweep layer");
assert.match(styles, /\.launcher-shell--control \.launcher-primary::after/, "CTA must expose the armed indicator");
assert.match(styles, /:disabled::before[\s\S]*:disabled::after[\s\S]*animation: none/, "disabled CTA must stop signaling readiness");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/, "motion must respect user preference");

console.log("launcher detonator CTA visual contract passed");
