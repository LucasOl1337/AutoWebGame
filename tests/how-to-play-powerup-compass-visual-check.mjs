import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const page = await readFile(new URL("../how-to-play.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/UiLayouts/how-to-play-powerup-compass.css", import.meta.url), "utf8");

assert.match(page, /href="\/src\/UiLayouts\/how-to-play-powerup-compass\.css"/);
assert.match(page, /class="tile powerup-compass" aria-labelledby="powerup-compass-title"/);
assert.match(page, /Bússola de power-ups/);
assert.match(page, /3 tipos em 4,2 s <strong>→ GUARD 1\.4s<\/strong>/);

const iconPaths = [...page.matchAll(/<img src="(\/Assets\/UiLayouts\/power-[^"]+\.png)"/g)].map((match) => match[1]);
assert.equal(iconPaths.length, 6, "the compass should show six readable power-up choices");
await Promise.all(iconPaths.map((path) => access(new URL(`../public${path}`, import.meta.url))));

assert.match(styles, /\.powerup-compass\s*\{[\s\S]*grid-column: 1 \/ -1/);
assert.match(styles, /\.powerup-compass__grid\s*\{[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(styles, /image-rendering: pixelated/);
assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.powerup-compass__grid \{ grid-template-columns: 1fr; \}/);

console.log("how-to-play power-up compass visual check passed");
