import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const start = source.indexOf("  private drawBomb(bomb: BombState): void {");
const end = source.indexOf("\n  private drawFlame(", start);

assert.notEqual(start, -1, "drawBomb deve existir");
assert.notEqual(end, -1, "drawBomb deve terminar antes de drawFlame");

const drawBomb = source.slice(start, end);
assert.match(drawBomb, /const isFinalFuse = bomb\.fuseMs <= 450;/, "janela final deve ser exatamente 450ms");
assert.match(drawBomb, /if \(isFinalFuse\) \{[\s\S]*?strokeStyle = `rgba\(255, 74, 42,/, "janela final deve ganhar anel vermelho");
assert.match(drawBomb, /const urgency = 1 - Math\.max\(0, bomb\.fuseMs\) \/ 450;/, "telegraph deve intensificar conforme o fuse termina");
assert.match(drawBomb, /if \(isFinalFuse\)[\s\S]*?if \(this\.assets\.props\.bomb\)/, "telegraph deve funcionar também com sprite de bomba");
assert.doesNotMatch(drawBomb, /bomb\.fuseMs\s*[-+*/]?=/, "drawBomb não deve alterar o fuse/gameplay");

console.log("bomb final telegraph check passed");
