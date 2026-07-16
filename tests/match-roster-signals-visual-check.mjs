import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const entry = await readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/UiLayouts/match-roster-signals.css", import.meta.url), "utf8");
const roster = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");

assert.match(entry, /import ["']\.\/match-roster-signals\.css["'];/);
assert.match(roster, /card\.className = "experience-match__seat"/);
assert.match(roster, /card\.dataset\.ready = "true"/);
assert.match(roster, /card\.dataset\.bot = "true"/);
assert.match(styles, /\.experience-match__panel--info \.experience-match__seat\s*\{/);
assert.match(styles, /content: "READY"/);
assert.match(styles, /content: "BOT"/);
assert.match(styles, /animation: roster-ready-pulse/);
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(styles, /@media \(max-width: 760px\)/);

console.log("match roster signals visual check passed");
