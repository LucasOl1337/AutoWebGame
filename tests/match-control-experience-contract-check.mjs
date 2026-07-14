import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPath = path.join(root, "src", "UiLayouts", "main.ts");
const stylePath = path.join(root, "src", "UiLayouts", "match-control-experience.css");
const assetPath = path.join(root, "public", "Assets", "UiLayouts", "launcher-match-bay-v1.webp");

assert.equal(existsSync(stylePath), true, "the public training route must load its Match Control stylesheet");
assert.equal(existsSync(assetPath), true, "the launcher staging-bay artwork must ship with the game");

const entry = readFileSync(entryPath, "utf8");
const css = readFileSync(stylePath, "utf8");
const blockBody = (source, header) => {
  const headerIndex = source.indexOf(header);
  assert.notEqual(headerIndex, -1, `missing CSS block for ${header}`);
  const openIndex = source.indexOf("{", headerIndex);
  let depth = 1;
  for (let index = openIndex + 1; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openIndex + 1, index);
  }
  assert.fail(`unterminated CSS block for ${header}`);
};

const ruleFrom = (source, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `missing CSS rule for ${selector}`);
  return match[1];
};
const rule = (selector) => ruleFrom(css, selector);

const landingRule = rule(".experience-screen--landing");
const primaryRule = rule(".experience-screen--landing .experience-actions__group--primary .experience-button");
const characterSheetRule = rule(".experience-screen--landing .experience-hero__art");
const summaryFocusRule = rule(".experience-screen--landing .experience-landing-advanced__summary:focus-visible");
const accountInputRule = rule(".experience-screen--landing .experience-account__input");
const characterFocusRule = rule(".experience-screen--landing .experience-character-strip__item:focus-visible");
const tabletCss = blockBody(css, "@media (max-width: 960px)");
const tabletHeroRule = ruleFrom(tabletCss, ".experience-screen--landing .experience-hero");
const mobileCss = blockBody(css, "@media (max-width: 760px)");
const mobileRailRule = ruleFrom(mobileCss, ".experience-shell:has(.experience-screen--landing:not([hidden])) > .experience-rail .experience-rail__item");

assert.match(entry, /import "\.\/match-control-experience\.css";/, "Match Control overrides must load after the base UI");
assert.match(css, /MATCH CONTROL EXPERIENCE: START/, "the redesign must remain an isolated, reviewable layer");
assert.match(css, /--mc-signal:\s*#e61919/, "the launcher must use the safety-red product signal");
assert.match(css, /launcher-match-bay-v1\.webp/, "the pre-match route must use its authored staging-bay art");
assert.match(landingRule, /min-height:\s*100svh/, "the landing must own the full responsive viewport");
assert.match(landingRule, /--accent:\s*#e61919/, "legacy descendants must inherit the safety-red accent");
assert.match(primaryRule, /min-height:\s*72px/, "quick match must remain comfortably tappable");
assert.match(primaryRule, /background:\s*var\(--mc-signal\)/, "quick match must be the unmistakable primary action");
assert.match(characterSheetRule, /background:\s*#eae8e3/, "character selection must read as a light loadout sheet");
assert.match(summaryFocusRule, /outline:\s*3px solid var\(--mc-signal\)/, "advanced match settings must expose keyboard focus");
assert.match(characterFocusRule, /outline:\s*3px solid var\(--mc-signal\)/, "character thumbnails must expose keyboard focus");
assert.match(accountInputRule, /min-height:\s*48px/, "account configuration must keep a usable touch target");
assert.match(css, /env\(safe-area-inset-top/, "the launcher must honor device safe areas");
assert.match(tabletHeroRule, /grid-template-columns:\s*minmax\(0, 1fr\)/, "tablet widths must collapse before the two-column minimum can clip");
assert.match(css, /@media \(max-width:\s*760px\)/, "the launcher must define a narrow-screen composition");
assert.match(mobileRailRule, /width:\s*44px/, "mobile rail controls must keep a 44px width");
assert.match(mobileRailRule, /height:\s*44px/, "mobile rail controls must keep a 44px height");
assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/, "the launcher must respect reduced-motion preferences");
assert.doesNotMatch(css, /linear-gradient|radial-gradient|backdrop-filter:\s*blur/i, "the isolated redesign must not reintroduce generic glass/gradient styling");

console.log("Match Control experience contract ok");
