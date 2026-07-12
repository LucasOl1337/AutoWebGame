import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");

const hasDuration = /const POWER_UP_SPAWN_POP_MS = 120;/.test(source);
const tracksRevealOnlyOnTransition = /if \(item && !item\.revealed\)[\s\S]*?item\.revealed = true;[\s\S]*?powerUpRevealStartedAtMs\.set\(item, this\.animationClockMs\)/.test(source);
const renderOnlyTransform = /private drawPowerUp[\s\S]*?revealElapsedMs[\s\S]*?ctx\.translate[\s\S]*?ctx\.scale\(popScale, popScale\)/.test(source);
const preservesFallback = /const definition = getPowerUpDefinition\(powerUp\.type\);[\s\S]*?fillText\(definition\.shortLabel/.test(source);
const doesNotChangeGeometry = !/private drawPowerUp[\s\S]*?(powerUp\.tile\.[xy]\s*=|powerUp\.collected\s*=)/.test(source);

assert.equal(hasDuration, true, "o pop deve durar 120 ms");
assert.equal(tracksRevealOnlyOnTransition, true, "o relógio visual deve iniciar apenas na revelação local");
assert.equal(renderOnlyTransform, true, "o pop deve ser uma transformação exclusiva de render");
assert.equal(preservesFallback, true, "o fallback textual deve permanecer disponível");
assert.equal(doesNotChangeGeometry, true, "drawPowerUp não deve alterar tile ou coleta");

console.log(JSON.stringify({
  durationMs: 120,
  tracksRevealOnlyOnTransition,
  renderOnlyTransform,
  preservesFallback,
  doesNotChangeGeometry,
  pass: true,
}, null, 2));
