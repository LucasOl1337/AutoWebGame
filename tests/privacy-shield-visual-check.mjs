import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../privacy.html", import.meta.url), "utf8");

assert.match(html, /class="privacy-core" role="img"/);
assert.match(html, /aria-label="Escudo protegendo dados de conta, sessao, partida e feedback"/);

for (const signal of ["account", "session", "match", "feedback"]) {
  assert.match(html, new RegExp(`signal-${signal}`), `missing ${signal} signal`);
}

assert.match(html, /@media \(max-width: 620px\)[\s\S]*\.hero-grid \{ grid-template-columns: 1fr; \}/);
assert.match(html, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
assert.match(html, /href="\/game"/);

console.log("privacy shield visual check passed");
