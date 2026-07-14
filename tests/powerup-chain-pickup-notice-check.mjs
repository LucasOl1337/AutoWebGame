import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const sourcePath = path.resolve("src/Engine/game-app.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const methodStart = source.indexOf("private formatPowerUpPickupNotice(");
const methodEnd = source.indexOf("private getDetonateHudKeyLabel(", methodStart);
const method = methodStart >= 0 && methodEnd > methodStart
  ? source.slice(methodStart, methodEnd)
  : "";

const compactPass = method.includes('maxLength <= 8 ? "CHAIN!"');
const expandedPass = method.includes('`CHAIN ${definition.shortLabel} ${notice.valueLabel}`');
const definitionAvailablePass = method.indexOf("const definition = getPowerUpDefinition(notice.type);")
  < method.indexOf("if (notice.chainGuard)");
const legacyHiddenItemRemovedPass = !method.includes('"CHAIN GUARD"');
const pass = compactPass
  && expandedPass
  && definitionAvailablePass
  && legacyHiddenItemRemovedPass;

console.log(JSON.stringify({
  compactPass,
  expandedPass,
  definitionAvailablePass,
  legacyHiddenItemRemovedPass,
  pass,
}, null, 2));

if (!pass) process.exit(1);
