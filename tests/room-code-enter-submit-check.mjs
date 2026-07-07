import { readFile } from "node:fs/promises";

const {
  resolveManualLobbyJoinCode,
} = await import("../output/esm/NetCode/session-client.js");

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
    name: "ignores empty manual input",
    actual: resolveManualLobbyJoinCode("   "),
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
};

const failedEntryCases = entryCases.filter((entry) => entry.actual !== entry.expected);
const failedSourceChecks = Object.entries(sourceChecks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

const pass = failedEntryCases.length === 0 && failedSourceChecks.length === 0;

console.log(JSON.stringify({
  entryCases,
  sourceChecks,
  failedEntryCases,
  failedSourceChecks,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
