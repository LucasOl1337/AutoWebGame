import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const methodStart = source.indexOf("private renderLanguageSwitcher(): void {");
const methodEnd = methodStart >= 0 ? source.indexOf("\n  }", methodStart) : -1;
const method = methodStart >= 0 && methodEnd >= 0
  ? source.slice(methodStart, methodEnd)
  : "";

const portuguesePressed = 'this.elements.languagePortugueseButton.setAttribute("aria-pressed", this.language === "pt" ? "true" : "false");';
const englishPressed = 'this.elements.languageEnglishButton.setAttribute("aria-pressed", this.language === "en" ? "true" : "false");';

const checks = {
  findsLanguageSwitcher: method.length > 0,
  synchronizesPortuguesePressedState: method.includes(portuguesePressed),
  synchronizesEnglishPressedState: method.includes(englishPressed),
  keepsPressedStateInsideRenderer: !source.slice(0, methodStart).includes(portuguesePressed)
    && !source.slice(methodEnd).includes(portuguesePressed)
    && !source.slice(0, methodStart).includes(englishPressed)
    && !source.slice(methodEnd).includes(englishPressed),
};

const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({ ...checks, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
