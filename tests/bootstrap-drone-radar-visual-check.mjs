import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/UiLayouts/bootstrap-drone.css", import.meta.url), "utf8");

assert.match(
  css,
  /\.bootstrap-state:not\(\[data-state="error"\]\) \.bootstrap-state__indicator/,
  "o radar deve existir apenas no carregamento normal",
);
assert.match(css, /outline: 1px dashed rgba\(112, 229, 255, 0\.62\)/, "o radar deve ter leitura tracejada");
assert.match(css, /bootstrap-readiness-pulse 2\.2s ease-in-out infinite/, "o radar deve pulsar suavemente");
assert.match(css, /@keyframes bootstrap-readiness-pulse/, "a pulsacao do radar deve estar definida");
assert.match(
  css,
  /\.bootstrap-state:not\(\[data-state="error"\]\) \.bootstrap-state__indicator \{[\s\S]*?animation: none;/,
  "o radar deve respeitar movimento reduzido",
);
assert.match(
  css,
  /\.bootstrap-state\[data-state="error"\] \.bootstrap-state__indicator \{[\s\S]*?animation: none;/,
  "o erro deve continuar sem a animacao de prontidao",
);

console.log("bootstrap drone readiness radar visual contract ok");
