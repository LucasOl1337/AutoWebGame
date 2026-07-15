import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, css] = await Promise.all([
  readFile(new URL("../game.html", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/game-battlefield-horizon.css", import.meta.url), "utf8"),
]);

assert.ok(page.includes("/src/UiLayouts/game-battlefield-horizon.css"), "a rota de partida deve consumir o radar");
assert.ok(css.includes("Readiness radar"), "o radar deve estar documentado no consumidor visual");
assert.ok(css.includes('not([data-state="error"]) .bootstrap-state__indicator'), "o estado normal deve ter anel proprio");
assert.ok(css.includes('data-state="error"] .bootstrap-state__indicator'), "o estado de falha deve ter anel distinto");
assert.ok(css.includes("outline-offset: 10px"), "o anel deve preservar a leitura do drone");
assert.ok(css.includes("readiness-radar-beacon"), "a telemetria deve receber balizas visuais");
assert.ok(css.includes("prefers-reduced-motion: reduce"), "as balizas devem respeitar movimento reduzido");

console.log(JSON.stringify({ pass: true, delivery: "Radar de prontidao" }, null, 2));
