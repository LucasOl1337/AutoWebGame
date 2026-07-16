import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const page = await readFile(new URL("how-to-play.html", root), "utf8");
const styles = await readFile(new URL("src/UiLayouts/how-to-play-fuse-lens.css", root), "utf8");

assert.match(page, /how-to-play-fuse-lens\.css/);
assert.match(page, /id="fuse-lens" class="tile fuse-lens" aria-labelledby="fuse-lens-title"/);
assert.match(page, /id="fuse-lens-title" class="accent-red">Lente do pavio<\/h3>/);
assert.match(page, /aria-label="Ciclo visual do pavio: armar, ler e sair"/);
assert.equal((page.match(/class="fuse-lens__stage fuse-lens__stage--/g) ?? []).length, 3);
assert.match(page, /<strong>ARMAR<\/strong>[\s\S]*<strong>LER<\/strong>[\s\S]*<strong>SAIR<\/strong>/);
assert.match(page, /janela segura <strong>→<\/strong> alcance das flames/);
assert.match(styles, /\.fuse-lens__bomb\s*\{/);
assert.match(styles, /\.fuse-lens__flame::before/);
assert.match(styles, /@media \(max-width: 520px\)/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(styles, /\.fuse-lens__meter-fill[\s\S]*width: 46%/);

console.log(JSON.stringify({ pass: true, component: "Lente do pavio", stages: 3, route: "/how-to-play.html" }, null, 2));
