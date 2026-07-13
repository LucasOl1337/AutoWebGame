import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pagePath = path.join(root, "how-to-play.html");
const landingPath = path.join(root, "index.html");
const vitePath = path.join(root, "vite.config.ts");
const assetPath = path.join(root, "public", "Assets", "UiLayouts", "how-to-play-arena.png");

const pageHtml = fs.readFileSync(pagePath, "utf8");
const landingHtml = fs.readFileSync(landingPath, "utf8");
const viteConfig = fs.readFileSync(vitePath, "utf8");
const assetStats = fs.statSync(assetPath);

assert.match(pageHtml, /<title>Como jogar \| BOMBA PvP<\/title>/);
assert.match(pageHtml, /<h1>Como jogar BOMBA PvP<\/h1>/);
assert.match(pageHtml, /href="\/game"/);
assert.match(pageHtml, /src="\/Assets\/UiLayouts\/how-to-play-arena\.png"/);
assert.match(pageHtml, /<kbd>W<\/kbd><kbd>A<\/kbd><kbd>S<\/kbd><kbd>D<\/kbd>/);
assert.match(pageHtml, /<kbd>R<\/kbd><kbd>U<\/kbd>/);
assert.match(pageHtml, /Detonar bomba remota quando o powerup estiver ativo: P1 usa R e P2 usa U\./);
assert.doesNotMatch(pageHtml, /<div><kbd>E<\/kbd><\/div>\s*<p>Detonar bomba remota/);
assert.match(pageHtml, /id="objetivo"/);
assert.match(pageHtml, /id="controles"/);
assert.match(pageHtml, /id="arena"/);
assert.match(pageHtml, /id="plano"/);
assert.match(pageHtml, /class="back-to-top"[^>]*data-visible="false" hidden/);
assert.match(pageHtml, /aria-label="Voltar ao inicio"/);
assert.match(pageHtml, /backToTop\.hidden = !shouldShow/);
assert.match(pageHtml, /new IntersectionObserver/);
assert.match(pageHtml, /link\.setAttribute\("aria-current", "true"\)/);
assert.match(pageHtml, /@media \(prefers-reduced-motion: reduce\)/);

assert.match(landingHtml, /href="\/how-to-play\.html">Como jogar<\/a>/);
assert.match(landingHtml, /<a href="#main-content" class="skip-link">Pular para o conteudo<\/a>/);
assert.match(landingHtml, /<main id="main-content" tabindex="-1">/);
assert.ok(
  landingHtml.indexOf('class="skip-link"') < landingHtml.indexOf('id="main-content"'),
  "landing skip link should appear before the main landmark",
);
assert.ok(
  landingHtml.indexOf('id="main-content"') < landingHtml.indexOf("<footer>"),
  "landing main landmark should wrap content before the footer",
);
assert.match(viteConfig, /howToPlay:\s*"\.\/how-to-play\.html"/);
assert.ok(assetStats.size > 100_000, "how-to-play banner should be a real generated image asset");

console.log("How-to-play page contract ok");
