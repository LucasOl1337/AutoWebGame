import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../how-to-play.html", import.meta.url), "utf8");

assert.match(page, /class="blast-lesson" aria-labelledby="blast-lesson-title"/);
assert.match(page, /A chama vira na bomba, nunca na parede\./);
assert.match(page, /Bomba → linha de fogo → reação em cadeia → casa segura/);
assert.match(page, /class="blast-map" role="img" aria-label="[^"]+"/);
assert.match(page, /\.blast-map__cell--wall\s*\{/);
assert.match(page, /\.blast-map__cell--flame\s*\{/);
assert.match(page, /\.blast-map__cell--bomb\s*\{/);
assert.match(page, /\.blast-map__cell--safe\s*\{/);
assert.match(page, /@media \(max-width: 900px\)[\s\S]*\.blast-lesson \{ grid-template-columns: 1fr; \}/);
assert.match(page, /class="blast-map__legend" aria-hidden="true"/);
assert.match(page, /@media \(max-width: 640px\)[\s\S]*\.blast-map \{[\s\S]*grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);/);
assert.match(page, /\.blast-lesson \{[\s\S]*width: 100vw;[\s\S]*margin-left: calc\(50% - 50vw\);/);

const diagramCells = page.match(/<span class="blast-map__cell/g) ?? [];
assert.equal(diagramCells.length, 21, "the tactical map should keep its 7×3 grid");

console.log("how-to-play chain-reaction visual check passed");
