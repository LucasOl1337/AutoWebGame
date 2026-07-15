import fs from "node:fs";
import process from "node:process";

const source = fs.readFileSync(new URL("../src/UiLayouts/i18n.ts", import.meta.url), "utf8");

const checks = {
  ptActionable: source.includes('localControlsUltimate: "Ativar a ultimate do personagem"'),
  enActionable: source.includes('localControlsUltimate: "Activate the character ultimate"'),
  vaguePromiseRemoved: !source.includes('localControlsUltimate: "Virar a rodada"')
    && !source.includes('localControlsUltimate: "Turn the round"'),
  establishedTermPreserved: source.includes('ultimate: "Ultimate do personagem"'),
};

const pass = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ...checks, pass }, null, 2));
process.exit(pass ? 0 : 1);
