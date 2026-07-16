import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/FrontendKernel/canonical-arena-preview.css", import.meta.url), "utf8");

assert.match(css, /\.canonical-arena-preview\s*\{[\s\S]*?position:\s*relative;/);
assert.match(css, /\.canonical-arena-preview::before\s*\{[\s\S]*?background-size:\s*100% 8px;/);
assert.match(css, /\.canonical-arena-preview::after\s*\{[\s\S]*?content:\s*"MAP \/\/ R1";/);
assert.match(css, /\.canonical-arena-preview > img\s*\{[\s\S]*?aspect-ratio:\s*23 \/ 19;/);
assert.match(css, /\.canonical-arena-preview > figcaption::before\s*\{[\s\S]*?box-shadow:/);
assert.match(css, /\.canonical-arena-preview\[data-degraded="true"\]\s*\{[\s\S]*?border-color:/);
assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
assert.match(css, /@media \(max-width: 560px\)/);

console.log("canonical arena preview frame visual contract passed");
