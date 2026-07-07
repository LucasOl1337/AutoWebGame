import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");

const focusSelectors = [
  ".experience-button:focus-visible",
  ".experience-character-option:focus-visible",
  ".experience-character-strip__item:focus-visible",
  ".experience-language-switcher__option:focus-visible",
  ".experience-match__toggle:focus-visible",
  ".experience-room-card:focus-visible",
  ".experience-account__input:focus-visible",
  ".experience-feedback__textarea:focus-visible",
  ".experience-match__chat-input:focus-visible",
];

const coarsePointerStart = css.indexOf("@media (any-pointer: coarse)");
const coarsePointerCss = coarsePointerStart >= 0 ? css.slice(coarsePointerStart) : "";
const coarsePointerSelectors = [
  ".experience-button",
  ".experience-language-switcher__option",
  ".experience-match__toggle",
  ".experience-match__chat-input",
  ".experience-match__stage[data-fullscreen=\"true\"] .experience-match__actions .experience-button",
  ".experience-match__stage[data-fullscreen=\"true\"] .experience-match__toggle",
  ".experience-character-strip__item",
];

const missingFocusSelectors = focusSelectors.filter((selector) => !css.includes(selector));
const missingCoarseSelectors = coarsePointerSelectors.filter((selector) => !coarsePointerCss.includes(selector));
const minHeight44Count = (coarsePointerCss.match(/min-height:\s*44px/g) ?? []).length;

const checks = {
  missingFocusSelectors,
  keepsLanguageSwitcherVisibleOnKeyboardFocus: css.includes(".experience-language-switcher:focus-within")
    && css.includes("opacity: 1;"),
  hasCoarsePointerMedia: coarsePointerStart >= 0,
  missingCoarseSelectors,
  has44PixelTouchFloor: minHeight44Count >= 2,
  expandsTouchPortraitStrip: coarsePointerCss.includes("width: 60px;")
    && coarsePointerCss.includes("height: 60px;"),
};

const pass = checks.missingFocusSelectors.length === 0
  && checks.keepsLanguageSwitcherVisibleOnKeyboardFocus
  && checks.hasCoarsePointerMedia
  && checks.missingCoarseSelectors.length === 0
  && checks.has44PixelTouchFloor
  && checks.expandsTouchPortraitStrip;

console.log(JSON.stringify({ ...checks, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
