import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const botSource = await readFile(new URL("../src/Engine/bot-ai.ts", import.meta.url), "utf8");
const runtimeSource = await readFile(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");

const readTick = (source, label) => {
  const match = source.match(/const SUDDEN_DEATH_TICK_MS = (\d+);/);
  assert.ok(match, `${label} deve declarar SUDDEN_DEATH_TICK_MS`);
  return Number(match[1]);
};

const botTickMs = readTick(botSource, "bot");
const runtimeTickMs = readTick(runtimeSource, "runtime");

assert.equal(runtimeTickMs, 900, "runtime deve sustentar tick de sudden death em 900 ms");
assert.equal(botTickMs, runtimeTickMs, "bot deve projetar sudden death com o mesmo tick do runtime");

console.log(JSON.stringify({ botTickMs, runtimeTickMs, aligned: true }));
