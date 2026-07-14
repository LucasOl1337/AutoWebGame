import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const launcher = await readFile(new URL("../src/UiLayouts/launcher-shell.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../src/UiLayouts/launcher-shell.css", import.meta.url), "utf8");
const arenaThemes = await readFile(new URL("../src/Arenas/arena-theme-library.ts", import.meta.url), "utf8");
const gameHtml = await readFile(new URL("../game.html", import.meta.url), "utf8");
await access(new URL("../public/Assets/UiLayouts/arena-portal-emblem.webp", import.meta.url));

assert.match(
  launcher,
  /shell\.className = "launcher-shell launcher-shell--control"/,
  "the player launcher should opt into the Match Control Sheet skin without changing LabShell",
);
assert.match(launcher, /class="launcher-commandbar"/);
assert.match(launcher, /class="launcher-mode-index"/);
assert.match(launcher, /aria-pressed="\$\{state\.selectedMode === mode\.id \? "true" : "false"\}"/);
assert.match(launcher, /Partida rápida/);
assert.match(launcher, /class="launcher-primary" data-route="play"/);
assert.doesNotMatch(launcher, /addEventListener\("focus", \(\) => this\.store\.selectMode/);
assert.doesNotMatch(launcher, /<dt>(?:Rede|Região|Status)<\/dt>/);
assert.match(launcher, /class="launcher-material-index"/);

for (const asset of [
  "/Assets/TileMaps/themes/ember-kiln/floor-base.png",
  "/Assets/TileMaps/themes/skyfoundry-bastion/floor-base.png",
  "/Assets/TileMaps/themes/tidal-foundry/floor-base.png",
]) {
  assert.match(arenaThemes, new RegExp(asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(launcher, /import \{ ARENA_THEME_LIBRARY \}/);
assert.match(launcher, /const MATERIAL_THEMES = ARENA_THEME_LIBRARY\.map/);
assert.doesNotMatch(launcher, /\/Assets\/TileMaps\/themes\//);

const controlBlock = css.match(
  /\/\* MATCH CONTROL SHEET: START \*\/([\s\S]*?)\/\* MATCH CONTROL SHEET: END \*\//,
)?.[1];

assert.ok(controlBlock, "the control launcher should have an auditable, isolated style block");
assert.match(controlBlock, /--control-paper:\s*#eae8e3/i);
assert.match(controlBlock, /--control-ink:\s*#050505/i);
assert.match(controlBlock, /--control-signal:\s*#e61919/i);
assert.match(controlBlock, /env\(safe-area-inset-(?:top|right|bottom|left)/i);
assert.match(controlBlock, /font-family:\s*"JetBrains Mono"/i);
assert.match(controlBlock, /font:[^;]*"Archivo Black"/i);
assert.match(gameHtml, /family=Archivo\+Black/);
assert.match(gameHtml, /family=JetBrains\+Mono/);
assert.match(gameHtml, /family=Playfair\+Display/);
assert.match(gameHtml, /Inter:wght@400;500;600;700;800;900/);
assert.doesNotMatch(controlBlock, /--control-signal-on-ink/);
assert.match(controlBlock, /grid-template-columns:\s*minmax\(0,\s*220px\)\s+minmax\(0,\s*1fr\)/i);
assert.match(controlBlock, /@media\s*\(max-width:\s*720px\)/i);
assert.match(controlBlock, /focus-visible/i);
const nonZeroRadii = [...controlBlock.matchAll(/border-radius\s*:\s*([^;]+)/gi)]
  .map((match) => match[1].trim())
  .filter((value) => !/^0(?:px)?$/i.test(value));
assert.deepEqual(nonZeroRadii, [], "the approved launcher must keep every corner square");
assert.doesNotMatch(
  controlBlock,
  /box-shadow|linear-gradient|radial-gradient|backdrop-filter|filter\s*:\s*blur/i,
  "the approved launcher must not reintroduce shadows, gradients, glass, or blur",
);

console.log("Match Control Sheet launcher contract ok");
