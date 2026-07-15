import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../src/Engine/sound-manager.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const matchStartLine = source
  .split(/\r?\n/)
  .find((line) => line.includes("matchStart:") && line.includes("match_start.mp3"));

assert.ok(matchStartLine, "matchStart deve permanecer declarado no manifesto de SFX");
assert.match(
  matchStartLine,
  /volume:\s*0\.84\s*\*\s*0\.45\s*\*\s*MASTER_VOLUME/,
  "matchStart deve usar exclusivamente o multiplicador de clareza 0.45",
);
assert.doesNotMatch(
  matchStartLine,
  /volume:\s*0\.84\s*\*\s*0\.2\s*\*\s*MASTER_VOLUME/,
  "o multiplicador anterior 0.2 não deve permanecer",
);

const effectiveVolume = 0.84 * 0.45 * 0.38;
assert.equal(effectiveVolume, 0.14364);

console.log(JSON.stringify({
  matchStartMultiplier: 0.45,
  previousMultiplier: 0.2,
  effectiveVolume,
  pass: true,
}, null, 2));
