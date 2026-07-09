import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const landingPath = path.join(root, "index.html");
const landingHtml = fs.readFileSync(landingPath, "utf8");

const requiredSections = [
  "top",
  "combate",
  "personagens",
  "arenas",
  "controles",
  "modos",
  "em-breve",
  "confianca",
];

const gameCtaPattern = /href="\/game"[^>]*aria-label="Jogar BOMBA PvP agora"/g;
const gameCtas = landingHtml.match(gameCtaPattern) ?? [];

assert.match(landingHtml, /<title>BOMBA PvP[^<]*<\/title>/);
assert.match(landingHtml, /<a href="#main-content" class="skip-link">Pular para o conteudo<\/a>/);
assert.match(landingHtml, /<main id="main-content" tabindex="-1">/);
assert.match(landingHtml, /<nav class="topbar-links" aria-label="Navegacao principal">/);
assert.ok(gameCtas.length >= 3, "landing should keep accessible /game entrypoints");

for (const sectionId of requiredSections) {
  assert.match(landingHtml, new RegExp(`id="${sectionId}"`), `missing section #${sectionId}`);
}

for (const href of ["/how-to-play.html", "/privacy.html", "/terms.html"]) {
  assert.match(landingHtml, new RegExp(`href="${href}"`), `missing trust link ${href}`);
}

assert.ok(
  landingHtml.indexOf('class="skip-link"') < landingHtml.indexOf('id="main-content"'),
  "skip link should appear before main content",
);
assert.ok(
  landingHtml.indexOf('id="main-content"') < landingHtml.indexOf("<footer>"),
  "main landmark should close before footer content",
);

console.log("Landing page contract ok");
