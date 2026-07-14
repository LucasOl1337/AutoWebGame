import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
await access(new URL("../public/Assets/marketing/hero-match-control-v2.webp", import.meta.url));

assert.match(index, /\/Assets\/marketing\/hero-match-control-v2\.webp/);
assert.doesNotMatch(index, /hero-arena-sigil\.webp/);
assert.match(index, /class="hero-control-grid"/);
assert.match(index, /class="hero-match-sheet"/);
assert.match(index, /PLANTE\./);
assert.match(index, /CERQUE\./);
assert.match(index, /SOBREVIVA\./);
assert.match(index, /class="btn-play"[^>]*>\s*Partida rápida/);
assert.doesNotMatch(index, /class="stats-row"/);

const block = index.match(
  /\/\* MATCH CONTROL LANDING: START \*\/([\s\S]*?)\/\* MATCH CONTROL LANDING: END \*\//,
)?.[1];

assert.ok(block, "landing should expose one isolated Match Control style block");
assert.match(block, /--landing-paper:\s*#eae8e3/i);
assert.match(block, /--landing-ink:\s*#050505/i);
assert.match(block, /--landing-signal:\s*#e61919/i);
assert.match(block, /grid-template-columns:/i);
assert.match(block, /safe-area-inset-(?:top|right|bottom|left)/i);
assert.match(block, /@media\s*\(max-width:\s*760px\)/i);
assert.match(block, /prefers-reduced-motion/i);

const nonZeroRadii = [...block.matchAll(/border-radius\s*:\s*([^;]+)/gi)]
  .map((match) => match[1].trim())
  .filter((value) => !/^0(?:px)?$/i.test(value));
assert.deepEqual(nonZeroRadii, []);
assert.doesNotMatch(block, /linear-gradient|radial-gradient|filter\s*:\s*blur/i);
for (const property of ["box-shadow", "backdrop-filter"]) {
  const activeValues = [...block.matchAll(new RegExp(`${property}\\s*:\\s*([^;]+)`, "gi"))]
    .map((match) => match[1].trim())
    .filter((value) => value !== "none");
  assert.deepEqual(activeValues, [], `${property} must only neutralize inherited decoration`);
}

console.log("Match Control landing contract ok");
