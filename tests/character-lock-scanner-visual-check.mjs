import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(path.join(root, "src", "UiLayouts", "match-control-experience.css"), "utf8");

assert.match(css, /@keyframes fighter-lock-scan/, "fighter lock should expose a scan animation");
assert.match(css, /fighter-lock-scan 2600ms/, "scanner should remain slow enough to avoid visual noise");
assert.match(css, /outline: 1px dashed rgba\(5, 5, 5, 0\.52\)/, "lock frame should retain a technical targeting reticle");
assert.match(css, /inset 0 222px 0 -218px var\(--mc-signal\)/, "scanner should cross the portrait as a narrow signal band");
assert.match(css, /\.experience-character-strip__item\[data-selected="true"\][\s\S]*?fighter-thumbnail-lock/, "selected thumbnail should echo the locked state");

const reducedMotionBlock = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
assert.match(reducedMotionBlock, /\.experience-character-focus::before[\s\S]*?animation: none/, "scanner must stop for reduced motion");
assert.match(reducedMotionBlock, /\.experience-character-strip__item\[data-selected="true"\][\s\S]*?animation: none/, "thumbnail pulse must stop for reduced motion");

console.log("Character lock scanner visual contract passed.");
