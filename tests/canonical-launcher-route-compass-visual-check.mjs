import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/FrontendKernel/canonical-launcher.css", import.meta.url), "utf8");
const view = await readFile(new URL("../src/FrontendKernel/canonical-launcher-view.ts", import.meta.url), "utf8");

assert.match(view, /class="canonical-launcher__experience\$\{experience\.emphasis/);
assert.match(view, /data-experience="\$\{experience\.experience\}"/);
assert.match(css, /\.canonical-launcher__experience\s*\{[\s\S]*?position:\s*relative;/);
assert.match(css, /\.canonical-launcher__experience\s*\{[\s\S]*?isolation:\s*isolate;/);
assert.match(css, /\.canonical-launcher__experience::before\s*\{[\s\S]*?background:/);
assert.match(css, /\.canonical-launcher__experience::after\s*\{[\s\S]*?border-top:\s*2px solid var\(--route-accent\)/);
assert.match(css, /data-experience="continuous-room"/);
assert.match(css, /data-experience="training"/);
assert.match(css, /data-experience="lab"/);
assert.match(css, /\.canonical-launcher__experience > \*\s*\{[\s\S]*?z-index:\s*2;/);
assert.match(css, /\.canonical-launcher__experience:hover:not\(:disabled\)::before/);
assert.match(css, /\.canonical-launcher__experience:focus-visible::before/);

console.log(JSON.stringify({
  pass: true,
  routeCompass: true,
  consumers: ["continuous-room", "training", "lab"],
  visualLayers: ["coordinate-grid", "exit-marker"],
}));
