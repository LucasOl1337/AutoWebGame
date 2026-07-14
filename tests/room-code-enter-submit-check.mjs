import { readFile } from "node:fs/promises";

const {
  resolveManualLobbyJoinCode,
  resolvePastedLobbyJoinCode,
} = await import("../output/esm/NetCode/room-invite.js");

const entryCases = [
  {
    name: "joins from a typed room code",
    actual: resolveManualLobbyJoinCode(" ab-12 c "),
    expected: "AB12C",
  },
  {
    name: "joins from a pasted invite URL",
    actual: resolveManualLobbyJoinCode("https://bomba.test/en/play?room=cd-34ef&utm=friend"),
    expected: "CD34EF",
  },
  {
    name: "joins from a chat message with a standalone code",
    actual: resolveManualLobbyJoinCode("entra ai: sala GH78JK"),
    expected: "GH78JK",
  },
  {
    name: "joins from a chat message with a separated code",
    actual: resolveManualLobbyJoinCode("codigo da sala: zx-91-km"),
    expected: "ZX91KM",
  },
  {
    name: "ignores empty manual input",
    actual: resolveManualLobbyJoinCode("   "),
    expected: null,
  },
];

const pasteCases = [
  {
    name: "auto-joins a complete pasted room code",
    actual: resolvePastedLobbyJoinCode(" ab-12 cd "),
    expected: "AB12CD",
  },
  {
    name: "auto-joins a pasted invite URL",
    actual: resolvePastedLobbyJoinCode("https://bomba.test/en/play?room=cd-34ef&utm=friend"),
    expected: "CD34EF",
  },
  {
    name: "keeps partial pasted input editable",
    actual: resolvePastedLobbyJoinCode("AB12"),
    expected: null,
  },
];

const source = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const formSubmitPreventsNavigation = /lobbyCodeForm\.addEventListener\("submit",\s*\(event\)\s*=>\s*\{\s*event\.preventDefault\(\);\s*this\.joinLobbyFromCodeEntry\(\);/m.test(source);
const sourceChecks = {
  formSubmitHandler: source.includes("this.elements.lobbyCodeForm.addEventListener(\"submit\""),
  submitPreventsNavigation: formSubmitPreventsNavigation,
  submitButton: source.includes("lobbyCodeSubmitButton.type = \"submit\";"),
  joinUsesSharedResolver: source.includes("resolveManualLobbyJoinCode(this.elements.lobbyCodeInput.value)"),
  pasteHandler: source.includes("this.elements.lobbyCodeInput.addEventListener(\"paste\""),
  pasteUsesStrictResolver: source.includes("resolvePastedLobbyJoinCode(event.clipboardData?.getData(\"text\"))"),
  pasteReplacesAndJoins: /event\.preventDefault\(\);\s*this\.elements\.lobbyCodeInput\.value = roomCode;\s*this\.joinLobbyFromCodeEntry\(\);/m.test(source),
  disablesAutocomplete: source.includes("lobbyCodeInput.autocomplete = \"off\";"),
  disablesSpellcheck: source.includes("lobbyCodeInput.spellcheck = false;"),
  keepsTextInputMode: source.includes("lobbyCodeInput.inputMode = \"text\";"),
  usesCharacterAutocapitalize: source.includes("lobbyCodeInput.setAttribute(\"autocapitalize\", \"characters\")"),
  disablesMobileAutocorrect: source.includes("lobbyCodeInput.setAttribute(\"autocorrect\", \"off\")"),
  showsJoinEnterKeyHint: source.includes("lobbyCodeInput.setAttribute(\"enterkeyhint\", \"join\")"),
};

const failedEntryCases = entryCases.filter((entry) => entry.actual !== entry.expected);
const failedPasteCases = pasteCases.filter((entry) => entry.actual !== entry.expected);
const failedSourceChecks = Object.entries(sourceChecks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

const pass = failedEntryCases.length === 0 && failedPasteCases.length === 0 && failedSourceChecks.length === 0;

console.log(JSON.stringify({
  entryCases,
  pasteCases,
  sourceChecks,
  failedEntryCases,
  failedPasteCases,
  failedSourceChecks,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
