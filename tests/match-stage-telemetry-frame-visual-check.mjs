import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [styles, bootstrap, sessionClient] = await Promise.all([
  readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/legacy-bootstrap.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8"),
]);

assert.match(bootstrap, /import "\.\/main\.css";/, "a rota legacy precisa carregar o contrato visual da partida");
assert.match(sessionClient, /className = "experience-match__stage"/, "o cliente precisa montar o palco real do combate");
assert.match(styles, /\.experience-match__stage::before\s*\{[\s\S]*pointer-events: none;/, "a moldura deve ser uma camada passiva");
assert.match(styles, /\.experience-match__stage::before\s*\{[\s\S]*z-index: 4;/, "a moldura deve permanecer legivel sobre o canvas");
assert.match(styles, /content: "ARENA FEED \/\/ LIVE";/, "o palco deve declarar seu estado visual ao jogador");
assert.match(styles, /data-fullscreen="true"\]::before/, "a moldura precisa acompanhar tela cheia");
assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.experience-match__stage::before/, "a moldura deve reduzir a escala no celular");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.experience-match__stage::before/, "o tratamento deve respeitar movimento reduzido");

console.log(JSON.stringify({
  pass: true,
  delivery: "Moldura de telemetria da partida",
  consumer: "experience-match__stage",
}, null, 2));
