import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const pagePath = path.join(root, "how-to-play.html");
const landingPath = path.join(root, "index.html");
const vitePath = path.join(root, "vite.config.ts");
const assetPath = path.join(root, "public", "Assets", "UiLayouts", "how-to-play-arena-tactical.webp");

const pageHtml = fs.readFileSync(pagePath, "utf8");
const landingHtml = fs.readFileSync(landingPath, "utf8");
const viteConfig = fs.readFileSync(vitePath, "utf8");
const assetStats = fs.statSync(assetPath);

assert.match(pageHtml, /<title>Como jogar \| BOMBA PvP<\/title>/);
assert.match(pageHtml, /<h1>Como jogar BOMBA PvP<\/h1>/);
assert.match(pageHtml, /href="\/game"/);
assert.match(pageHtml, /src="\/Assets\/UiLayouts\/how-to-play-arena-tactical\.webp"/);
assert.match(pageHtml, /alt="Bomber escapando por uma zona segura enquanto uma bomba explode em cruz na arena"/);
assert.match(pageHtml, /<kbd>W<\/kbd><kbd>A<\/kbd><kbd>S<\/kbd><kbd>D<\/kbd>/);
assert.match(pageHtml, /<h3 class="accent-gold">Jogue a rodada<\/h3>\s*<p>Vence a rodada o ultimo bomber vivo\./);
assert.match(pageHtml, /Na partida classica, vence o primeiro jogador a 2 vitorias\./);
assert.match(pageHtml, /Double KO e ninguem ganha ponto\./);
assert.match(pageHtml, /Quando o anel ficar vermelho, a explosao esta a instantes/);
assert.match(pageHtml, /saia da linha reta imediatamente/);
assert.match(pageHtml, /<kbd>R<\/kbd><kbd>U<\/kbd>/);
assert.match(pageHtml, /Detonar bomba remota quando o powerup estiver ativo: P1 usa R e P2 usa U\./);
assert.match(pageHtml, /Ativar ou sustentar a habilidade: P1 usa Espaco e P2 usa I\./);
assert.match(pageHtml, /Em habilidades canalizadas, soltar antes do disparo cancela a acao/);
assert.doesNotMatch(pageHtml, /<div><kbd>E<\/kbd><\/div>\s*<p>Detonar bomba remota/);
assert.match(pageHtml, /id="objetivo"/);
assert.match(pageHtml, /id="controles"/);
assert.match(pageHtml, /id="arena"/);
assert.match(pageHtml, /<h3 class="accent-green">Powerups escalam<\/h3>/);
assert.match(pageHtml, /Colete tipos diferentes em ate 4,2 s para ativar protecao curta contra flames\./);
assert.match(pageHtml, /escudo absorve um golpe/);
assert.match(pageHtml, /atravessar bombas abre fuga, enquanto chuta-las reposiciona a ameaca e corta 250 ms do pavio por tile percorrido/);
assert.match(pageHtml, /Chutes longos exigem fuga imediata/);
assert.match(pageHtml, /detonacao remota prepara armadilhas e pavio curto acelera a pressao/);
assert.match(pageHtml, /Morte subita fecha as bordas/);
assert.match(pageHtml, /aviso SD aparecer, migre cedo para o centro/);
assert.match(pageHtml, /arena fecha de fora para dentro/);
assert.match(pageHtml, /id="plano"/);
assert.match(pageHtml, /Mova-se assim que a rodada for liberada para ativar o breve impulso de largada/);
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
assert.ok(assetStats.size < 180_000, "how-to-play banner should remain lightweight for onboarding");

console.log("How-to-play page contract ok");
