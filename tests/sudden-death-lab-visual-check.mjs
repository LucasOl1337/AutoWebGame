import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../sudden-death-lab.html", import.meta.url), "utf8");
const source = await readFile(new URL("../src/UiLayouts/sudden-death-lab.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../src/UiLayouts/sudden-death-lab.css", import.meta.url), "utf8");

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
  querySelector(selector) { return selector === "#sudden-death-lab" ? root : null; },
};

await import("../output/esm/UiLayouts/sudden-death-lab.js");

const signals = {
  observedBot: renderedMarkup.includes("Bot P2 · treino"),
  controller: renderedMarkup.includes("IA determinística local"),
  health: renderedMarkup.includes("BENCHMARK VERIFICADO"),
  intention: renderedMarkup.includes("ÚLTIMA INTENÇÃO") && renderedMarkup.includes("Contornar a borda"),
  dangerZone: renderedMarkup.includes("Passagem (2,2) fechando"),
  eta: renderedMarkup.includes("850 ms"),
  executedDirection: renderedMarkup.includes("esquerda → baixo"),
  validity: renderedMarkup.includes("saída prevista antes do impacto"),
  latency: renderedMarkup.includes("Custo deste sinal") && /(?:&lt;|<)0,01 ms|\d+,\d{2} ms/.test(renderedMarkup),
  outcome: renderedMarkup.includes("Fuga concluída · P2 vivo"),
  comparison: renderedMarkup.includes("0/3 sobreviveram") && renderedMarkup.includes("3/3 sobreviveram"),
  modelBoundary: renderedMarkup.includes("Nenhum modelo 9Router participou"),
  humanAction: renderedMarkup.includes("Ação humana: nenhuma"),
  accessible: html.includes('aria-live="polite"') && renderedMarkup.includes('aria-label="Zona de fechamento e rota escolhida"'),
  responsive: css.includes("@media (max-width: 760px)") && css.includes("@media (max-width: 460px)"),
  sharedSignal: source.includes('from "../Engine/bot-sudden-death-pressure"'),
  sharedEvidence: source.includes('from "./sudden-death-lab-evidence"'),
  destinationSignal: source.includes("candidateTile: scenario.destinationTile")
    && renderedMarkup.includes("destino pontuado: (2,3)"),
};

assert.ok(Object.values(signals).every(Boolean), `contrato visual incompleto: ${JSON.stringify(signals)}`);
assert.equal(typeof replayHandler, "function", "controle de repetição deve estar conectado");
replayHandler();
assert.match(renderedMarkup, /Sinal recalculado às/, "replay deve atualizar apenas o sinal anunciado");

console.log(JSON.stringify({ pass: true, signals, replayPass: true }, null, 2));
