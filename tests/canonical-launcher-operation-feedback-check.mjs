import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [styles, view] = await Promise.all([
  readFile(new URL("../src/FrontendKernel/canonical-launcher.css", import.meta.url), "utf8"),
  readFile(new URL("../src/FrontendKernel/canonical-launcher-view.ts", import.meta.url), "utf8"),
]);

assert.match(view, /import "\.\/canonical-launcher\.css";/, "canonical launcher must load its stylesheet");
assert.match(view, /aria-busy=\"\$\{operation\?\.status === \"leaving\"\}\"/, "launcher must expose the handoff state");
assert.match(styles, /\.canonical-launcher\[aria-busy=\"true\"\] \.canonical-launcher__command::after/, "busy launcher must expose a scan line");
assert.match(styles, /animation: canonical-launcher-handoff-scan 1\.35s/, "scan line must animate during handoff");
assert.match(styles, /\.canonical-launcher\[aria-busy=\"true\"\] \.canonical-launcher__status > p\[role=\"status\"\]::before/, "busy status must expose an active signal");
assert.match(styles, /@keyframes canonical-launcher-handoff-pulse/, "status signal must pulse");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*canonical-launcher\[aria-busy=\"true\"\] \.canonical-launcher__command::after[\s\S]*animation: none/, "reduced motion must disable the handoff animation");
assert.match(styles, /@media \(forced-colors: active\)[\s\S]*background: CanvasText/, "forced colors must retain a visible signal");

console.log("canonical launcher operation feedback visual contract passed");
