import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../danger-chain-lab.html", import.meta.url), "utf8");
const source = await readFile(new URL("../src/UiLayouts/danger-chain-lab.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../src/UiLayouts/danger-chain-lab.css", import.meta.url), "utf8");

let renderedMarkup = "";
let replayHandler = null;
const replayButton = {
  addEventListener(type, handler) {
    if (type === "click") replayHandler = handler;
  },
};
const root = {
  set innerHTML(value) { renderedMarkup = value; },
  get innerHTML() { return renderedMarkup; },
  querySelector(selector) { return selector === "[data-replay]" ? replayButton : null; },
};
globalThis.document = {
  querySelector(selector) { return selector === "#danger-chain-lab" ? root : null; },
};

await import("../output/esm/UiLayouts/danger-chain-lab.js");

const signals = {
  controlledPeak: renderedMarkup.includes("pico jogável (4 × 5 bombas)"),
  observedBot: renderedMarkup.includes("Bot P2"),
  controller: renderedMarkup.includes("IA determinística local"),
  etaContract: renderedMarkup.includes("ETAs PRESERVADAS") && renderedMarkup.includes("neste cenário"),
  observedSignal: renderedMarkup.includes("Mapa de perigo atualizado"),
  honestDecisionBoundary: renderedMarkup.includes("Decisão do bot:") && renderedMarkup.includes("não avaliada"),
  sampleValidity: renderedMarkup.includes("Esta amostra"),
  measuredCost: renderedMarkup.includes("Custo do mapa") && renderedMarkup.includes("Medido às"),
  outcome: renderedMarkup.includes("20/20 bombas sincronizadas") && renderedMarkup.includes("20/20 ETAs idênticas"),
  comparison: renderedMarkup.includes("ANTES · REVARREDURA") && renderedMarkup.includes("AGORA · FILA DE EVENTOS"),
  signedBenchmark: /menos tempo|regressão observada|variação inconclusiva/.test(renderedMarkup),
  signedSummary: /menor custo computacional nesta amostra|regressão de custo nesta amostra|variação de custo inconclusiva/.test(renderedMarkup),
  benchmarkMethod: renderedMarkup.includes("17 lotes alternados de 30 execuções"),
  modelBoundary: renderedMarkup.includes("não compara modelos 9Router"),
  responsive: css.includes("repeat(20, minmax(0, 1fr))") && css.includes("@media (max-width: 460px)"),
  accessibleRoot: html.includes('aria-live="polite"') && renderedMarkup.includes('aria-label="Sinal atual do mapa de perigo"'),
};

assert.ok(Object.values(signals).every(Boolean), `contrato visual incompleto: ${JSON.stringify(signals)}`);
assert.doesNotMatch(renderedMarkup, /ÚLTIMA INTENÇÃO|Evacuar o corredor|Mesma decisão|SAUDÁVEL/);
assert.match(source, /const resultSummary = !parity[\s\S]*regressão de custo[\s\S]*variação de custo inconclusiva/, "resumo deve acompanhar o resultado assinado");
assert.match(source, /deltaPercent >= 5[\s\S]*regressão observada/, "regressão não pode ser mascarada como ganho");
assert.equal(typeof replayHandler, "function", "controle de repetição deve estar conectado");
const firstMarkup = renderedMarkup;
replayHandler();
assert.notEqual(renderedMarkup, "", "replay deve renderizar uma nova medição");
assert.match(renderedMarkup, /Medido às/, "replay deve preservar timestamp visível");
assert.ok(firstMarkup.includes("Bot P2"), "primeira renderização deve ser completa");

console.log(JSON.stringify({ pass: true, signals, replayPass: true }, null, 2));
