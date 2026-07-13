import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const i18nSource = await readFile(new URL("../src/UiLayouts/i18n.ts", import.meta.url), "utf8");
const sessionSource = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");

assert.match(i18nSource, /localControlsRemote: string;/, "copy contract should expose remote detonation");
assert.match(i18nSource, /localControlsRemote: "Detonar bomba remota"/, "PT copy should name remote detonation");
assert.match(i18nSource, /localControlsRemote: "Detonate remote bomb"/, "EN copy should name remote detonation");
assert.match(sessionSource, /key: "R",\s*label: copy\.landing\.localControlsRemote/, "landing should show the real Player 1 R key");
assert.match(sessionSource, /"Jogador 1 · requer controle remoto", "Player 1 · requires remote control"/, "landing should localize the Player 1 requirement");

console.log(JSON.stringify({ pt: true, en: true, player1Key: "R", pass: true }));
