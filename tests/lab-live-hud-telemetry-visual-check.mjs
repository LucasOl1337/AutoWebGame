import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [css, entrypoint, consumer] = await Promise.all([
  readFile(new URL("src/UiLayouts/lab-live-hud.css", root), "utf8"),
  readFile(new URL("src/UiLayouts/main.ts", root), "utf8"),
  readFile(new URL("src/Engine/auto-improvement-bridge.ts", root), "utf8"),
]);

assert.match(entrypoint, /import\s+["']\.\/lab-live-hud\.css["']/, "o CSS precisa continuar carregado na aplicacao");
assert.match(consumer, /className\s*=\s*["']lab-live-hud["']/, "o HUD precisa continuar montado pelo consumidor real");
assert.match(css, /data-online="true"/, "a sessao online precisa ter sinal visual proprio");
assert.match(css, /data-tone="live"/, "o heartbeat ativo precisa ter tratamento visual");
assert.match(css, /data-tone="danger"/, "o estado de perigo precisa ser distinguivel sem depender apenas de texto");
assert.match(css, /--player-accent-rgb/, "os paineis precisam preservar identidade cromatica por jogador");
assert.match(css, /prefers-reduced-motion:\s*reduce/, "os pulsos precisam respeitar movimento reduzido");

console.log(JSON.stringify({ pass: true, surface: "lab-live-hud", states: ["online", "live", "danger"] }, null, 2));
