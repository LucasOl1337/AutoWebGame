import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [entry, css, game] = await Promise.all([
  readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/prismatic-combat-frame.css", import.meta.url), "utf8"),
  readFile(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8"),
]);

assert.ok(entry.includes('import "./prismatic-combat-frame.css"'), "o frontend deve importar a moldura");
assert.ok(game.includes('this.canvas.dataset.gameCanvas = "true"'), "o canvas real deve expor o gancho visual");
assert.ok(css.includes('.experience-shell[data-screen="match"]'), "a moldura deve ficar restrita a partida");
assert.ok(css.includes(':has(canvas[data-game-canvas="true"])::before'), "os cantos devem depender do canvas montado");
assert.ok(css.includes("pointer-events: none"), "a moldura nao deve bloquear controles");
assert.ok(css.includes("@media (max-width: 760px)"), "a composicao deve se adaptar ao celular");
assert.ok(css.includes("prefers-reduced-motion: reduce"), "o pulso deve respeitar movimento reduzido");
assert.ok(css.includes("forced-colors: active"), "a moldura deve preservar leitura em alto contraste");

console.log(JSON.stringify({ pass: true, delivery: "Moldura de Combate Prismatica" }, null, 2));
