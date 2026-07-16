import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, css, bootstrap] = await Promise.all([
  readFile(new URL("../game.html", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/game-battlefield-horizon.css", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/legacy-bootstrap.ts", import.meta.url), "utf8"),
]);

assert.match(page, /game-battlefield-horizon\.css/, "a rota de partida deve carregar a lente");
assert.match(bootstrap, /className = "bootstrap-state__indicator"/, "a lente deve consumir o indicador real");
assert.match(css, /conic-gradient\(/, "o indicador precisa de segmentos orbitais legiveis");
assert.match(css, /indicator::before[\s\S]*arena-boot-lens-orbit/, "o anel interno deve varrer o indicador");
assert.match(css, /indicator::after[\s\S]*border-style: dashed/, "o anel externo deve criar profundidade sem asset");
assert.match(css, /data-state="error"[\s\S]*rgba\(255, 116, 116/, "o erro deve trocar para a linguagem de falha");
assert.match(css, /@media \(max-width: 480px\)/, "a malha deve continuar responsiva");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*indicator::before[\s\S]*animation: none !important/, "movimento reduzido deve congelar a lente");

console.log(JSON.stringify({
  pass: true,
  delivery: "Lente de arranque da arena",
  consumer: "bootstrap-state__indicator",
  states: ["loading", "error", "reduced-motion"],
}, null, 2));
