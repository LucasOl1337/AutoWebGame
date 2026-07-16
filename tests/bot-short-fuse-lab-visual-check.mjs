import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rootUrl = new URL("../", import.meta.url);
const source = await readFile(new URL("src/UiLayouts/bot-short-fuse-lab.ts", rootUrl), "utf8");
const styles = await readFile(new URL("src/UiLayouts/bot-short-fuse-lab.css", rootUrl), "utf8");

const elements = new Map();
const replay = { addEventListener(type, handler) { if (type === "click") this.handler = handler; } };
const createElement = () => ({
  dataset: {},
  textContent: "",
  style: { values: new Map(), setProperty(name, value) { this.values.set(name, value); } },
});
const root = {
  innerHTML: "",
  querySelector(selector) {
    if (selector === "[data-replay]") return replay;
    if (!elements.has(selector)) elements.set(selector, createElement());
    return elements.get(selector);
  },
};
globalThis.document = { querySelector(selector) { return selector === "#bot-short-fuse-lab" ? root : null; } };

await import("../output/esm/UiLayouts/bot-short-fuse-lab.js");

const dial = elements.get("[data-budget-dial]");
const state = elements.get("[data-budget-state]");
const readout = elements.get("[data-budget-read]");
const percent = elements.get("[data-budget-percent]");
const signals = {
  dialMarkup: source.includes('data-budget-dial') && source.includes('aria-label="Leitura visual do orçamento do pavio"'),
  conicDial: styles.includes("conic-gradient") && styles.includes("calc(var(--budget-ratio) * 1turn)"),
  responsiveDial: styles.includes(".fuse-lab__telemetry") && styles.includes("max-width: 420px"),
  reducedMotion: styles.includes("prefers-reduced-motion: reduce"),
  runtimeRatio: dial?.style.values.get("--budget-ratio") === "0.6666666666666666",
  runtimePercent: percent?.textContent === "67%",
  runtimeState: state?.dataset.state === "critical" && state?.textContent === "ROTA ACIMA DO FUSE",
  runtimeReadout: /\d+\/\d+ passos cobertos/.test(readout?.textContent ?? ""),
  replayBound: typeof replay.handler === "function",
};

assert.ok(Object.values(signals).every(Boolean), `contrato visual incompleto: ${JSON.stringify(signals)}`);
replay.handler();
assert.equal(elements.get("[data-budget-percent]").textContent, "67%", "replay deve manter o mesmo snapshot visual");

console.log(JSON.stringify({ pass: true, component: "Anel de orçamento do pavio", signals, replayPass: true }, null, 2));
