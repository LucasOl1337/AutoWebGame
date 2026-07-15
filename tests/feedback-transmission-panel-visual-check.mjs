import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const entry = readFileSync(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/UiLayouts/feedback-transmission-panel.css", import.meta.url), "utf8");

assert.match(entry, /import "\.\/feedback-transmission-panel\.css";/, "o painel deve estar integrado ao bundle ativo");
assert.match(css, /\.experience-feedback__card::before/, "o dialogo deve exibir o indicador de canal");
assert.match(css, /\.experience-feedback__textarea:focus/, "o campo precisa de feedback de foco");
assert.match(css, /\.experience-feedback__status:not\(:empty\)/, "o envio precisa de estado visual sem falsos positivos");
assert.doesNotMatch(css, /:has\([^}]*:disabled/, "um campo vazio nao pode parecer estar transmitindo");
assert.match(css, /@media \(max-width: 560px\)/, "o painel deve adaptar-se a telas estreitas");
assert.match(css, /max-height: calc\(100dvh - 24px\)/, "o card deve permanecer contido no viewport movel");
assert.match(css, /env\(safe-area-inset-bottom\)/, "a composicao deve respeitar a area segura inferior");
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, "a animacao deve respeitar movimento reduzido");

console.log("feedback transmission panel visual contract: ok");
