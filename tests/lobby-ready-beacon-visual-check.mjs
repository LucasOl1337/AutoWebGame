import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [css, bootstrap, client] = await Promise.all([
  readFile(new URL("../src/UiLayouts/lobby-ready-beacon.css", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8"),
]);

assert.match(bootstrap, /import "\.\/lobby-ready-beacon\.css";/, "o bootstrap deve carregar o sinal visual");
assert.match(client, /pill\.dataset\.ready = "true";/, "o estado visual deve consumir prontidão real do lobby");
assert.match(css, /\[data-ready="true"\]::after/, "o assento pronto deve receber confirmação icônica");
assert.match(css, /\[data-self="true"\]/, "o assento local pronto deve permanecer distinguível");
assert.match(css, /prefers-reduced-motion: reduce/, "a animação deve respeitar movimento reduzido");
assert.match(css, /forced-colors: active/, "o estado pronto deve sobreviver a cores forçadas");
assert.match(css, /:not\(:has\(\.experience-seat-pill--loading\)\)/, "o efeito não deve invadir o sequenciador de entrada");

console.log("lobby ready beacon visual check passed");
