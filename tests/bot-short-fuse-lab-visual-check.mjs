import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [html, source, css, vite] = await Promise.all([
  readFile(new URL("bot-short-fuse-lab.html", root), "utf8"),
  readFile(new URL("src/UiLayouts/bot-short-fuse-lab.ts", root), "utf8"),
  readFile(new URL("src/UiLayouts/bot-short-fuse-lab.css", root), "utf8"),
  readFile(new URL("vite.config.ts", root), "utf8"),
]);

assert.match(html, /id="bot-short-fuse-lab"/);
assert.match(source, /IA DETERMINÍSTICA LOCAL/);
assert.match(source, /CENÁRIO CONTROLADO/);
assert.match(source, /Bot observado/);
assert.match(source, /Controlador/);
assert.match(source, /Saúde/);
assert.match(source, /Decisão válida/);
assert.match(source, /Custo/);
assert.match(source, /Fuse real/);
assert.match(source, /Passos disponíveis/);
assert.match(source, /Comando emitido/);
assert.match(source, /Pós-comando/);
assert.match(source, /REFERÊNCIA ANTES/);
assert.match(source, /data-peer-card/);
assert.match(source, /peer\.speedLevel/);
assert.match(source, /Ação humana/);
assert.match(source, /referenceBeforeDecision/);
assert.match(source, /NÃO OBSERVADO · snapshot de decisão/);
assert.match(source, /runBotShortFuseLabScenario/);
assert.match(css, /data-state="refused"/);
assert.match(css, /prefers-reduced-motion/);
assert.match(vite, /botShortFuseLab:\s*"\.\/bot-short-fuse-lab\.html"/);

console.log(JSON.stringify({
  pass: true,
  surface: "bot-short-fuse-lab",
  humanSignals: ["bot", "controller", "health", "validity", "latency", "intent", "fuse", "budget", "outcome", "comparison", "action"],
}, null, 2));
