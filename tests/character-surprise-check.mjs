import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pickSurpriseCharacterIndex } from "../output/esm/NetCode/character-surprise.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionSource = fs.readFileSync(path.join(root, "src/NetCode/session-client.ts"), "utf8");
const copySource = fs.readFileSync(path.join(root, "src/UiLayouts/i18n.ts"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "src/UiLayouts/main.css"), "utf8");

const samples = [0, 0.2, 0.5, 0.8, 0.999999];
const transitions = [];

for (let current = 0; current < 4; current += 1) {
  for (const sample of samples) {
    const next = pickSurpriseCharacterIndex(current, 4, () => sample);
    transitions.push({ current, sample, next });
  }
}

const report = {
  singleCharacterIsStable: pickSurpriseCharacterIndex(0, 1, () => 0.75) === 0,
  neverRepeatsCurrent: transitions.every(({ current, next }) => current !== next),
  alwaysStaysInRoster: transitions.every(({ next }) => next >= 0 && next < 4),
  reachesFirstAlternate: pickSurpriseCharacterIndex(2, 4, () => 0) === 0,
  reachesLastAlternate: pickSurpriseCharacterIndex(2, 4, () => 0.999999) === 3,
  guardsInvalidRandom: pickSurpriseCharacterIndex(1, 4, () => Number.NaN) === 0,
  landingAndSetupWired: sessionSource.includes('surprisePreferredCharacter("landing")')
    && sessionSource.includes('surprisePreferredCharacter("setup")'),
  localizedCopyPresent: copySource.includes('surpriseAction: "Surpreenda-me"')
    && copySource.includes('surpriseAction: "Surprise me"'),
  visualStylePresent: cssSource.includes(".experience-character-surprise"),
};

report.pass = Object.values(report).every(Boolean);
console.log(JSON.stringify({ ...report, transitions }, null, 2));

if (!report.pass) {
  process.exit(1);
}
