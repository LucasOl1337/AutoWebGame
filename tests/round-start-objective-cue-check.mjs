import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/UiLayouts/i18n.ts", import.meta.url), "utf8");

assert.match(source, /roundStartSubtitle: "Seja o ultimo bomber vivo\."/);
assert.match(source, /roundStartSubtitle: "Be the last bomber alive\."/);
assert.doesNotMatch(source, /roundStartSubtitle: "(?:Acao liberada|Action is live)\."/);

console.log("round-start-objective-cue-check: ok");
