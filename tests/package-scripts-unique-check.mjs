import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packageJsonUrl = new URL("../package.json", import.meta.url);
const source = await readFile(packageJsonUrl, "utf8");
const scriptsMatch = source.match(/"scripts"\s*:\s*\{([\s\S]*?)\r?\n\s*\},\r?\n\s*"(?:devD|d)ependencies"/);

assert.ok(scriptsMatch, "package.json must contain a scripts object");

const scriptNames = [...scriptsMatch[1].matchAll(/^\s*"([^"]+)"\s*:/gm)].map((match) => match[1]);
const duplicates = [...new Set(scriptNames.filter((name, index) => scriptNames.indexOf(name) !== index))].sort();

assert.deepEqual(duplicates, [], `package.json scripts must be unique; duplicates: ${duplicates.join(", ")}`);
console.log(`package scripts uniqueness check passed (${scriptNames.length} scripts)`);
