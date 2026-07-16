import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const css = read("src/FrontendKernel/canonical-launcher.css");
const pointer = read("src/FrontendKernel/public-route-pointer.ts");
const main = read("src/UiLayouts/main.ts");
const landing = read("index.html");

assert.match(css, /:focus-visible/);
assert.match(css, /min-height:\s*44px/);
assert.match(css, /@media \(max-width:\s*720px\)/);
assert.match(css, /@media \(max-height:\s*480px\) and \(orientation:\s*landscape\)/);
assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
assert.match(css, /body\.canonical-launcher-active/);

assert.match(pointer, /export const PUBLIC_ROUTE_POINTER/);
assert.match(pointer, /"canonical" \| "legacy"/);
assert.match(pointer, /VITE_PUBLIC_ROUTE_POINTER=legacy npm run deploy:cloudflare/);
assert.match(main, /PUBLIC_ROUTE_POINTER === "canonical"/);
assert.match(main, /pathname === "\/" \|\| pathname === "\/game"/);
assert.match(main, /import\("\.\.\/FrontendKernel\/frontend-kernel"\)/);
assert.match(main, /await import\("\.\/legacy-bootstrap"\)/);
assert.doesNotMatch(main, /from "\.\/launcher-shell"|from "\.\/frontend-store"|new FrontendStore/);

assert.match(landing, /<div id="app" data-canonical-root hidden><\/div>/);
assert.match(landing, /<script type="module" src="\/src\/UiLayouts\/main\.ts"><\/script>/);

console.log("frontend kernel bootstrap and responsive contract: ok");
