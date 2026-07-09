import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(testDir, "..");
const landingPath = path.join(root, "index.html");
const html = fs.readFileSync(landingPath, "utf8");

const rootBlock = html.match(/:root\s*\{([\s\S]*?)\n\s*\}/);
assert.ok(rootBlock, "landing should define a :root token block");

const rootCss = rootBlock[1];

const requiredTokens = [
  "--accent-rgb",
  "--accent-deep-rgb",
  "--steel-rgb",
  "--bg",
  "--bg-1",
  "--bg-2",
  "--border",
  "--border-gold",
  "--text",
  "--muted",
  "--muted-2",
  "--gold",
  "--gold-bright",
  "--gold-dim",
  "--gold-soft",
  "--serif",
  "--sans",
  "--max-w",
];

for (const token of requiredTokens) {
  assert.match(rootCss, new RegExp(`${token}:\\s*[^;]+;`), `missing landing visual token ${token}`);
}

const semanticUsageSelectors = [
  [".hero", "rgba(var(--accent-rgb),0.09)"],
  [".topbar-cta", "var(--gold-bright)"],
  [".skip-link:focus-visible", "var(--gold-bright)"],
  ["footer a", "var(--gold-dim)"],
];

for (const [selector, expectedToken] of semanticUsageSelectors) {
  assert.ok(html.includes(selector), `missing selector ${selector}`);
  assert.ok(html.includes(expectedToken), `selector ${selector} should use ${expectedToken}`);
}

const deprecatedLandingColors = [
  "#d4af37",
  "#c9a227",
  "#f5d76e",
];

for (const color of deprecatedLandingColors) {
  assert.ok(!html.toLowerCase().includes(color), `landing should not reintroduce legacy gold ${color}`);
}

console.log("Landing visual token contract ok");
