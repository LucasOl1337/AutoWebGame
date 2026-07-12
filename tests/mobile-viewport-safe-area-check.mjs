import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const css = await readFile(new URL("src/UiLayouts/main.css", root), "utf8");
const htmlFiles = ["index.html", "game.html", "how-to-play.html", "privacy.html", "terms.html"];
const htmlEntries = await Promise.all(htmlFiles.map(async (file) => ({
  file,
  source: await readFile(new URL(file, root), "utf8"),
})));

const checks = {
  allPagesEnableViewportFit: htmlEntries.every(({ source }) => source.includes("viewport-fit=cover")),
  hasViewportFallbacks: css.includes("--experience-viewport-height: 100vh;")
    && css.includes("--experience-small-viewport-height: 100vh;"),
  upgradesViewportUnits: css.includes("@supports (height: 100svh)")
    && css.includes("--experience-small-viewport-height: 100svh;")
    && css.includes("@supports (height: 100dvh)")
    && css.includes("--experience-viewport-height: 100dvh;"),
  hasSafeAreaTokens: ["top", "right", "bottom", "left"].every((side) => (
    css.includes(`--experience-safe-area-${side}: env(safe-area-inset-${side}, 0px);`)
  )),
  shellUsesViewportVars: css.includes("min-height: var(--experience-small-viewport-height);")
    && css.includes("height: var(--experience-viewport-height);"),
  gameplayUsesSafeAreas: css.includes("var(--experience-safe-area-top)")
    && css.includes("var(--experience-safe-area-right)")
    && css.includes("var(--experience-safe-area-bottom)")
    && css.includes("var(--experience-safe-area-left)"),
};

const failedChecks = Object.entries(checks).filter(([, pass]) => !pass).map(([name]) => name);
const pass = failedChecks.length === 0;

console.log(JSON.stringify({ checks, failedChecks, htmlFiles, pass }, null, 2));
if (!pass) process.exit(1);
