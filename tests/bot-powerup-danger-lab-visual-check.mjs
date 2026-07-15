import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../bot-powerup-danger-lab.html", import.meta.url), "utf8");
const source = await readFile(new URL("../src/UiLayouts/bot-powerup-danger-lab.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../src/UiLayouts/bot-powerup-danger-lab.css", import.meta.url), "utf8");

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
  querySelector(selector) { return selector === "#bot-powerup-danger-lab" ? root : null; },
};

await import("../output/esm/UiLayouts/bot-powerup-danger-lab.js");

const signals = {
  observedBot: renderedMarkup.includes("Bot P2 · treino"),
  controller: renderedMarkup.includes("IA determinística local"),
  objective: renderedMarkup.includes("Shield Charge · tile (3,4)"),
  utility: renderedMarkup.includes("500 pontos ordinais"),
  plannedEta: renderedMarkup.includes("1 passo · 320 ms"),
  danger: renderedMarkup.includes("explosão em 1.000 ms"),
  margin: renderedMarkup.includes("+680 ms"),
  safetyTopology: renderedMarkup.includes("4 na rota com escudo · 4 na vazia"),
  intent: renderedMarkup.includes("FUGIR COLETANDO ESCUDO"),
  command: renderedMarkup.includes("baixo · sem bomba"),
  validity: renderedMarkup.includes("SNAPSHOT VERIFICADO"),
  health: renderedMarkup.includes("DECISÃO RESPONDENDO"),
  latency: renderedMarkup.includes("Custo por decisão") && /mediana \d+,\d{3} ms · p95 \d+,\d{3} ms/.test(renderedMarkup),
  comparison: renderedMarkup.includes("0/100 fugas pelo escudo") && renderedMarkup.includes("100/100 fugas pelo escudo"),
  honestOutcome: renderedMarkup.includes("NÃO OBSERVADO · snapshot de decisão"),
  modelBoundary: renderedMarkup.includes("Nenhum modelo 9Router participou"),
  humanAction: renderedMarkup.includes("Ação humana: nenhuma"),
  accessible: html.includes('aria-live="polite"') && renderedMarkup.includes('aria-label="Perigo, rotas seguras e objetivo"'),
  responsive: css.includes("@media (max-width: 760px)") && css.includes("@media (max-width: 460px)"),
  reducedMotion: css.includes("prefers-reduced-motion: reduce"),
  sharedSignal: source.includes('from "../Engine/bot-powerup-danger-lab-scenario"'),
  noRawEnum: !renderedMarkup.includes("escape-via-power-up"),
};

assert.ok(Object.values(signals).every(Boolean), `contrato visual incompleto: ${JSON.stringify(signals)}`);
assert.equal(typeof replayHandler, "function", "controle de repetição deve estar conectado");
replayHandler();
assert.match(renderedMarkup, /Recalculado às/, "replay deve atualizar apenas o sinal anunciado");

console.log(JSON.stringify({ pass: true, signals, replayPass: true }, null, 2));
