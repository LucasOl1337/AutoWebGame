import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const drawBombStart = source.indexOf("  private drawBomb(bomb: BombState): void {");
const drawBombEnd = source.indexOf("  private drawFlame(flame: FlameState): void {", drawBombStart);
const drawBomb = source.slice(drawBombStart, drawBombEnd);

assert.match(drawBomb, /const fuseProgress = 1 - Math\.min\(1, Math\.max\(0, bomb\.fuseMs\) \/ 3000\);/);
assert.match(drawBomb, /const smoothUrgency = fuseProgress \* fuseProgress \* \(3 - 2 \* fuseProgress\);/);
assert.match(drawBomb, /const pulseIntervalMs = 80 - smoothUrgency \* 32;/);
assert.match(drawBomb, /const pulse = 0\.6 \+ 0\.4 \* Math\.sin\(\(bomb\.fuseMs \/ pulseIntervalMs\) \* Math\.PI\);/);
assert.match(drawBomb, /const armedScale = 1 \+ \(pulse - 0\.6\) \* 0\.1;/, "amplitude e escala devem permanecer iguais");
assert.match(drawBomb, /const isFinalFuse = bomb\.fuseMs <= 450;/, "timing do anel final deve permanecer igual");

const pulseInterval = (fuseMs) => {
  const fuseProgress = 1 - Math.min(1, Math.max(0, fuseMs) / 3000);
  const smoothUrgency = fuseProgress * fuseProgress * (3 - 2 * fuseProgress);
  return 80 - smoothUrgency * 32;
};

assert.equal(pulseInterval(3000), 80, "pulso distante preserva o intervalo original");
assert.ok(pulseInterval(1500) < pulseInterval(3000), "pulso acelera durante o pavio");
assert.ok(pulseInterval(0) < pulseInterval(1500), "pulso continua acelerando ate zero");

console.log(JSON.stringify({
  farIntervalMs: pulseInterval(3000),
  middleIntervalMs: pulseInterval(1500),
  finalIntervalMs: pulseInterval(0),
  amplitudeAndScalePreserved: true,
  finalRingTimingPreserved: true,
}, null, 2));
