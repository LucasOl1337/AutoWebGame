import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");
const activeSelector = ".experience-button:active:not(:disabled)";
const activeStart = css.indexOf(activeSelector);
const activeRule = activeStart >= 0
  ? css.slice(activeStart, css.indexOf("}", activeStart) + 1)
  : "";
const reducedMotionStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
const reducedMotionCss = reducedMotionStart >= 0 ? css.slice(reducedMotionStart) : "";

const checks = {
  targetsOnlyEnabledButtons: activeStart >= 0
    && !css.includes(".experience-button:active {")
    && !css.includes(".experience-button:active:disabled"),
  providesPressedPosition: activeRule.includes("transform: translateY(1px);"),
  providesPressedTone: activeRule.includes("filter: brightness(0.94);"),
  reducedMotionNeutralizesMovement: reducedMotionCss.includes(activeSelector)
    && reducedMotionCss.includes("transform: none;"),
};

const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({ ...checks, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
