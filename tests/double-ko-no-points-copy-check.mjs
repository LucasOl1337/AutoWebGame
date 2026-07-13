import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const i18nPath = path.resolve(testDir, "../src/UiLayouts/i18n.ts");
const source = fs.readFileSync(i18nPath, "utf8");

const checks = {
  portugueseExplicitlySaysNobodyScores: source.includes(
    'doubleKo: "Eliminacao simultanea: os dois nucleos explodiram e ninguem pontua.",',
  ),
  englishExplicitlySaysNobodyScores: source.includes(
    'doubleKo: "Simultaneous elimination: both cores overloaded and no one scores.",',
  ),
};

const pass = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ checks, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
