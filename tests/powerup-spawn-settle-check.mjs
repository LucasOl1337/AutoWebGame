import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");

const durationMatch = source.match(/const POWER_UP_SPAWN_POP_MS = (\d+);/);
const peakProgressMatch = source.match(/const revealPeakProgress = ([\d.]+);/);
const twoStageScale = /const popScale = revealProgress < revealPeakProgress[\s\S]*?0\.72 \+ \(0\.36 \* Math\.sin[\s\S]*?: 1 \+ \(0\.08 \* Math\.cos/.test(source);
const continuousSettle = /\(\(revealProgress - revealPeakProgress\) \/ \(1 - revealPeakProgress\)\) \* Math\.PI \* 0\.5/.test(source);

assert.ok(durationMatch, "a duração visual existente deve continuar explícita");
assert.ok(peakProgressMatch, "o instante do pico deve ser explícito");
assert.equal(Number(durationMatch[1]), 120, "o reveal deve permanecer nos 120 ms existentes");
assert.equal(twoStageScale, true, "o reveal deve ter subida e assentamento separados");
assert.equal(continuousSettle, true, "o segundo tempo deve assentar continuamente até o fim");

const peakProgress = Number(peakProgressMatch[1]);
const scaleAt = (progress) => progress < peakProgress
  ? 0.72 + (0.36 * Math.sin((progress / peakProgress) * Math.PI * 0.5))
  : 1 + (0.08 * Math.cos(((progress - peakProgress) / (1 - peakProgress)) * Math.PI * 0.5));

const beforePeak = scaleAt(peakProgress - 1e-7);
const atPeak = scaleAt(peakProgress);
const afterPeak = scaleAt(peakProgress + 1e-7);
const settled = scaleAt(1);

assert.ok(Math.abs(atPeak - 1.08) < 1e-12, "o pico deve ser 1.08");
assert.ok(Math.abs(beforePeak - atPeak) < 1e-6, "a chegada ao pico deve ser contínua");
assert.ok(Math.abs(afterPeak - atPeak) < 1e-6, "a saída do pico deve ser contínua");
assert.ok(scaleAt(0.8) < atPeak && scaleAt(0.8) > settled, "o segundo tempo deve assentar sem salto");
assert.ok(Math.abs(settled - 1) < 1e-12, "o reveal deve terminar exatamente em 1.00");

console.log(JSON.stringify({
  durationMs: Number(durationMatch[1]),
  peakProgress,
  peakScale: atPeak,
  settledScale: settled,
  twoStageScale,
  continuousSettle,
  pass: true,
}, null, 2));
