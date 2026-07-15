import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [html, source, css, vite] = await Promise.all([
  readFile(new URL("bot-stability-lab.html", root), "utf8"),
  readFile(new URL("src/UiLayouts/bot-stability-lab.ts", root), "utf8"),
  readFile(new URL("src/UiLayouts/bot-stability-lab.css", root), "utf8"),
  readFile(new URL("vite.config.ts", root), "utf8"),
]);

assert.match(html, /id="bot-stability-lab"/);
assert.match(source, /IA DETERMINÍSTICA LOCAL/);
assert.match(source, /CENÁRIO CONTROLADO/);
assert.match(source, /Bot observado/);
assert.match(source, /Saúde/);
assert.match(source, /Decisão válida/);
assert.match(source, /Custo da decisão/);
assert.match(source, /Direção executada/);
assert.match(source, /Direção solicitada/);
assert.match(source, /ESTABILIZANDO ROTA/);
assert.match(source, /REFERÊNCIA ANTES/);
assert.match(source, /POLÍTICA ATUAL/);
assert.match(source, /O que o operador precisa fazer/);
assert.match(css, /data-phase="holding-route"/);
assert.match(css, /prefers-reduced-motion/);
assert.match(vite, /botStabilityLab:\s*"\.\/bot-stability-lab\.html"/);

console.log(JSON.stringify({
  pass: true,
  surface: "bot-stability-lab",
  humanSignals: ["bot", "controller", "health", "validity", "latency", "intent", "outcome", "comparison", "action"],
}, null, 2));
