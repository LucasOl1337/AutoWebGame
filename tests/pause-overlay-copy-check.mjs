import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/UiLayouts/i18n.ts", import.meta.url), "utf8");

const portugueseCopyPass = source.includes('pausedSubtitle: "Esc: continuar"');
const englishCopyPass = source.includes('pausedSubtitle: "Esc: resume"');
const legacyCopyRemoved = !source.includes("Pressione Esc para continuar.")
  && !source.includes("Press Esc to resume.");
const escapeBindingPreserved = source.includes('pausedSubtitle: "Esc: continuar"')
  && source.includes('pausedSubtitle: "Esc: resume"');

const result = {
  portugueseCopyPass,
  englishCopyPass,
  legacyCopyRemoved,
  escapeBindingPreserved,
  pass: portugueseCopyPass && englishCopyPass && legacyCopyRemoved && escapeBindingPreserved,
};

console.log(JSON.stringify(result, null, 2));
if (!result.pass) {
  process.exitCode = 1;
}
