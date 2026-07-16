import assert from "node:assert/strict";

Object.defineProperty(globalThis, "navigator", { value: { webdriver: false }, configurable: true });
globalThis.HTMLElement = class {};
globalThis.window = { addEventListener() {} };
globalThis.document = {};

const { formatLobbyEntryError } = await import("../output/esm/NetCode/session-client.js");

const cases = [
  ["Lobby not found.", "Lobby nao encontrado."],
  ["Match already in progress. Pick another open room.", "Partida ja em andamento. Escolha outra sala aberta."],
  ["Lobby full. Pick another room or wait for a slot.", "Lobby lotado. Escolha outra sala ou aguarde uma vaga."],
];

for (const [workerMessage, portugueseMessage] of cases) {
  assert.equal(formatLobbyEntryError(workerMessage, "pt"), portugueseMessage);
  assert.equal(formatLobbyEntryError(workerMessage, "en"), workerMessage);
}

const unrelatedError = "Connection interrupted.";
assert.equal(formatLobbyEntryError(unrelatedError, "pt"), unrelatedError);
assert.equal(formatLobbyEntryError(unrelatedError, "en"), unrelatedError);

console.log("lobby-entry-error-localization-check: ok");
