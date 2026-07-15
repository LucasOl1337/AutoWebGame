import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [page, css] = await Promise.all([
  readFile(new URL("../game.html", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/game-battlefield-horizon.css", import.meta.url), "utf8"),
]);

assert.ok(page.includes("/src/UiLayouts/game-battlefield-horizon.css"), "a rota de partida deve consumir o horizonte");
assert.ok(css.includes("#app:has(.bootstrap-state)::before"), "a malha deve existir apenas durante o bootstrap");
assert.ok(css.includes("perspective(440px) rotateX(58deg)"), "a malha deve formar um horizonte legivel");
assert.ok(css.includes('data-state="error"'), "o estado de falha deve receber telemetria propria");
assert.ok(css.includes("prefers-reduced-motion: reduce"), "a pulsacao deve respeitar movimento reduzido");
assert.ok(css.includes("@media (max-width: 480px)"), "a densidade da malha deve se adaptar ao celular");

console.log(JSON.stringify({ pass: true, delivery: "Horizonte tatico da arena" }, null, 2));
