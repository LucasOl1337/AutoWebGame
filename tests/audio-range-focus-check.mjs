import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");
const selector = ".experience-audio__range:focus-visible";
const rulePattern = /([^{}]*\.experience-audio__range:focus-visible[^{}]*)\{([^{}]*)\}/;
const ruleMatch = css.match(rulePattern);
const declarations = ruleMatch?.[2] ?? "";

const checks = {
  hasFocusVisibleSelector: css.includes(selector),
  hasTwoPixelOutline: /outline:\s*2px\s+solid\s+rgba\(var\(--accent-rgb\),\s*0\.82\);/.test(declarations),
  hasTwoPixelOutlineOffset: /outline-offset:\s*2px;/.test(declarations),
};

const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({ ...checks, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
