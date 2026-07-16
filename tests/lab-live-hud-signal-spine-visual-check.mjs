import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const [css, bridge] = await Promise.all([
  readFile(new URL("src/UiLayouts/lab-live-hud.css", root), "utf8"),
  readFile(new URL("src/Engine/auto-improvement-bridge.ts", root), "utf8"),
]);

assert.match(bridge, /data-signal data-state="lost"/, "cada painel precisa montar a regua de sinal desde o estado seguro");
assert.match(bridge, /panel\.signal\.dataset\.state = signalState/, "o consumidor real precisa atualizar o estado da regua");
assert.match(bridge, /heartbeatAgeMs < 2_500/, "heartbeat recente precisa acender a regua forte");
assert.match(bridge, /heartbeatAgeMs < 10_000/, "heartbeat envelhecendo precisa ter uma faixa intermediaria");
assert.match(css, /lab-live-player__signal\[data-state="live"\]/, "o estado vivo precisa de contraste ciano");
assert.match(css, /lab-live-player__signal\[data-state="aging"\]/, "o estado envelhecendo precisa de contraste amarelo");
assert.match(css, /lab-live-player__signal\[data-state="lost"\]/, "o estado perdido precisa permanecer legivel");
assert.match(css, /lab-live-signal-bar/, "o quarto segmento precisa comunicar atividade sem texto extra");
assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*lab-live-player__signal/, "movimento reduzido precisa congelar o segmento animado");

console.log(JSON.stringify({ pass: true, surface: "lab-live-hud", feature: "heartbeat-signal-spine", states: ["live", "aging", "lost"] }, null, 2));
