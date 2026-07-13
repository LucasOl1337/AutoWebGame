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
assert.match(pageHtml, /<h3 class="accent-gold">Jogue a rodada<\/h3>\s*<p>Vence a rodada o ultimo bomber vivo\./);
assert.match(pageHtml, /Double KO e ninguem ganha ponto\./);
assert.match(pageHtml, /Quando o anel ficar vermelho, a explosao esta a instantes/);
assert.match(pageHtml, /saia da linha reta imediatamente/);
assert.match(pageHtml, /<kbd>R<\/kbd><kbd>U<\/kbd>/);
assert.match(pageHtml, /Detonar bomba remota quando o powerup estiver ativo: P1 usa R e P2 usa U\./);
assert.doesNotMatch(pageHtml, /<div><kbd>E<\/kbd><\/div>\s*<p>Detonar bomba remota/);
assert.match(pageHtml, /id="objetivo"/);
assert.match(pageHtml, /id="controles"/);
assert.match(pageHtml, /id="arena"/);
assert.match(pageHtml, /<h3 class="accent-green">Powerups escalam<\/h3>/);
assert.match(pageHtml, /escudo absorve um golpe/);
assert.match(pageHtml, /atravessar bombas abre fuga, enquanto chuta-las reposiciona a ameaca/);
assert.match(pageHtml, /detonacao remota prepara armadilhas e pavio curto acelera a pressao/);
assert.match(pageHtml, /Morte subita fecha as bordas/);
assert.match(pageHtml, /aviso SD aparecer, migre cedo para o centro/);
assert.match(pageHtml, /arena fecha de fora para dentro/);
assert.match(pageHtml, /id="plano"/);
assert.match(pageHtml, /class="back-to-top"/);
assert.match(pageHtml, /aria-label="Voltar ao inicio"/);
assert.match(pageHtml, /new IntersectionObserver/);
assert.match(pageHtml, /link\.setAttribute\("aria-current", "true"\)/);
assert.match(pageHtml, /@media \(prefers-reduced-motion: reduce\)/);

assert.match(landingHtml, /href="\/how-to-play\.html">Como jogar<\/a>/);
assert.match(viteConfig, /howToPlay:\s*"\.\/how-to-play\.html"/);
assert.ok(assetStats.size > 100_000, "how-to-play banner should be a real generated image asset");

console.log("How-to-play page contract ok");
