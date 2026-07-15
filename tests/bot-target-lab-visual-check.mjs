import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../bot-target-lab.html", import.meta.url), "utf8");
const source = await readFile(new URL("../src/UiLayouts/bot-target-lab.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../src/UiLayouts/bot-target-lab.css", import.meta.url), "utf8");

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
  querySelector(selector) { return selector === "#bot-target-lab" ? root : null; },
};

await import("../output/esm/UiLayouts/bot-target-lab.js");

const signals = {
  observedBot: renderedMarkup.includes("Bot P2 · treino"),
  controller: renderedMarkup.includes("IA determinística local"),
  health: renderedMarkup.includes("DECISÃO RESPONDENDO"),
  validity: renderedMarkup.includes("SNAPSHOT VERIFICADO"),
  selectedTarget: renderedMarkup.includes("ALVO P3 · CAPACIDADE OCUPADA"),
  intent: renderedMarkup.includes("Perseguir P3 para a direita"),
  reason: renderedMarkup.includes("mapa atual projeta ETA efetiva de 1,8 s"),
  distance: renderedMarkup.includes("3 passos"),
  commitment: renderedMarkup.includes("ocupada · ETA efetiva 1,8 s · sem remoto"),
  command: renderedMarkup.includes("direita · sem bomba"),
  latency: /mediana \d+,\d{3} ms · p95 \d+,\d{3} ms/.test(renderedMarkup),
  comparison: renderedMarkup.includes("100/100 escolhiam P1") && renderedMarkup.includes("100/100 escolhem P3"),
  honestOutcome: renderedMarkup.includes("NÃO OBSERVADO · snapshot de decisão"),
  modelBoundary: renderedMarkup.includes("Nenhum modelo 9Router participou"),
  humanAction: renderedMarkup.includes("Ação humana: nenhuma"),
  accessible: html.includes('aria-live="polite"') && renderedMarkup.includes('aria-label="Arena e decisão de alvo"'),
  responsive: css.includes("@media (max-width: 760px)") && css.includes("@media (max-width: 600px)") && css.includes("overflow-wrap: anywhere"),
  reducedMotion: css.includes("prefers-reduced-motion: reduce"),
  sharedSignal: source.includes('from "../Engine/bot-target-lab-scenario"'),
};

assert.ok(Object.values(signals).every(Boolean), `contrato visual incompleto: ${JSON.stringify(signals)}`);
assert.equal(typeof replayHandler, "function", "controle de repetição deve estar conectado");
replayHandler();
assert.match(renderedMarkup, /Recalculado às/, "replay deve recalcular a decisão anunciada");

console.log(JSON.stringify({ pass: true, signals, replayPass: true }, null, 2));
