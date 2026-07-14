import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(path.join(root, "src", "UiLayouts", "match-control-experience.css"), "utf8");

assert.match(css, /\.experience-character-focus::before\s*\{[^}]*border:\s*2px solid var\(--mc-signal\)/s,
  "the selected fighter portrait must have a high-contrast targeting frame");
assert.match(css, /\.experience-character-focus::after\s*\{[^}]*content:\s*"● FIGHTER LOCKED"/s,
  "the loadout card must explicitly communicate the locked fighter state");
assert.match(css, /@keyframes fighter-lock-pulse/,
  "the lock frame must provide restrained live-state feedback");
assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*\.experience-character-focus::before\s*\{[^}]*animation:\s*none/s,
  "the lock feedback must remain legible without animation");

console.log("Launcher fighter lock visual check ok");
