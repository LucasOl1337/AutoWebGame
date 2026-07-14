import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const botSource = await readFile(new URL("../src/Engine/bot-ai.ts", import.meta.url), "utf8");
const runtimeSource = await readFile(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const dangerMapSource = await readFile(new URL("../src/Engine/danger-map.ts", import.meta.url), "utf8");

const readTick = (source, label) => {
  const match = source.match(/const SUDDEN_DEATH_TICK_MS = (\d+);/);
  assert.ok(match, `${label} deve declarar SUDDEN_DEATH_TICK_MS`);
  return Number(match[1]);
};

const sharedTickMs = readTick(dangerMapSource, "danger map");
const botUsesSharedDangerMap = /buildDangerMap[\s\S]*from "\.\/danger-map"/.test(botSource);
const runtimeImportsSharedTick = /SUDDEN_DEATH_TICK_MS[\s\S]*from "\.\/danger-map"/.test(runtimeSource);

assert.equal(sharedTickMs, 900, "danger map deve sustentar tick de sudden death em 900 ms");
assert.equal(botUsesSharedDangerMap, true, "bot deve usar o danger map compartilhado");
assert.equal(runtimeImportsSharedTick, true, "runtime deve importar o tick compartilhado");

console.log(JSON.stringify({ sharedTickMs, botUsesSharedDangerMap, runtimeImportsSharedTick, aligned: true }));
