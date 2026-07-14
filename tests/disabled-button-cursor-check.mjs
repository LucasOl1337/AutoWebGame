import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");
const disabledSelector = ".experience-button:disabled";
const disabledStart = css.indexOf(disabledSelector);
const disabledRule = disabledStart >= 0
  ? css.slice(disabledStart, css.indexOf("}", disabledStart) + 1)
  : "";

const checks = {
  hasDisabledRule: disabledStart >= 0,
  communicatesUnavailableCursor: disabledRule.includes("cursor: not-allowed;"),
  preservesDimmedState: disabledRule.includes("opacity: 0.52;"),
  hoverExcludesDisabled: css.includes(".experience-button:hover:not(:disabled)"),
  activeExcludesDisabled: css.includes(".experience-button:active:not(:disabled)"),
};

const pass = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ...checks, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
