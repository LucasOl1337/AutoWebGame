import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const drawBombStart = source.indexOf("  private drawBomb(bomb: BombState): void {");
const drawBombEnd = source.indexOf("  private drawFlame(flame: FlameState): void {", drawBombStart);
const drawBomb = source.slice(drawBombStart, drawBombEnd);

const hasSubtleScale = /const armedScale = 1 \+ \(pulse - 0\.6\) \* 0\.1;/.test(drawBomb);
const centersTransform = /translate\(x \+ TILE_SIZE \/ 2, y \+ TILE_SIZE \/ 2\);[\s\S]*scale\(armedScale, armedScale\);[\s\S]*translate\(-TILE_SIZE \/ 2, -TILE_SIZE \/ 2\);/.test(drawBomb);
const spriteUsesTransform = /translate\(x \+ TILE_SIZE \/ 2, y \+ TILE_SIZE \/ 2\);[\s\S]*drawImage\(this\.assets\.props\.bomb, 0, 0, TILE_SIZE, TILE_SIZE\)/.test(drawBomb);
const fallbackUsesTransform = /this\.ctx\.translate\(x \+ TILE_SIZE \/ 2, y \+ TILE_SIZE \/ 2\);[\s\S]*this\.ctx\.arc\(0, 2, 10, 0, Math\.PI \* 2\)/.test(drawBomb);
const preservesFuseThreshold = /bomb\.fuseMs <= 450/.test(drawBomb);

const result = {
  hasSubtleScale,
  centersTransform,
  spriteUsesTransform,
  fallbackUsesTransform,
  preservesFuseThreshold,
};

console.log(JSON.stringify(result, null, 2));
assert.deepEqual(result, {
  hasSubtleScale: true,
  centersTransform: true,
  spriteUsesTransform: true,
  fallbackUsesTransform: true,
  preservesFuseThreshold: true,
});
