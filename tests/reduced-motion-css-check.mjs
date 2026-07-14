import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");
const mediaStart = css.indexOf("@media (prefers-reduced-motion: reduce)");
const reducedMotionCss = mediaStart >= 0 ? css.slice(mediaStart) : "";

const checks = {
  hasReducedMotionMedia: mediaStart >= 0,
  scopesReductionToShell: reducedMotionCss.includes(".experience-shell *:not(canvas)"),
  excludesGameplayCanvas: !reducedMotionCss.includes(".experience-shell canvas,")
    && !reducedMotionCss.includes(".experience-shell * {")
    && reducedMotionCss.includes(":not(canvas)"),
  disablesShellAnimation: reducedMotionCss.includes("animation: none !important;"),
  disablesShellTransitions: reducedMotionCss.includes("transition: none !important;"),
  disablesSmoothScroll: reducedMotionCss.includes("scroll-behavior: auto !important;"),
  removesHoverMovement: reducedMotionCss.includes(".experience-button:hover:not(:disabled)")
    && reducedMotionCss.includes(".experience-match__toggle:hover")
    && reducedMotionCss.includes(".experience-character-strip__item:hover")
    && reducedMotionCss.includes("transform: none;"),
  removesPanelMovement: reducedMotionCss.includes(".experience-match__panel")
    && reducedMotionCss.includes("transform: none;"),
};

const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({ ...checks, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
