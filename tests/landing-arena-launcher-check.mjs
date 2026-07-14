import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const arenaSection = html.match(/<section\b[^>]*\bid="arenas"[^>]*>([\s\S]*?)<\/section>/i)?.[1];

assert.ok(arenaSection, "landing should keep an identifiable arenas section");

const expectedThemes = [
  ["tournament-clean", "Tournament Clean"],
  ["arcane-citadel", "Arcane Citadel"],
  ["verdant-ruins", "Verdant Ruins"],
  ["skyfoundry-bastion", "Skyfoundry Bastion"],
  ["royal-marble", "Royal Marble"],
  ["glacier-sanctum", "Glacier Sanctum"],
  ["obsidian-garden", "Obsidian Garden"],
];

const themeLinks = [...arenaSection.matchAll(
  /<a\b([^>]*\bclass="[^"]*\barena-row\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi,
)];

assert.equal(themeLinks.length, expectedThemes.length, "landing should expose exactly seven named arena links");

for (const [index, [slug, name]] of expectedThemes.entries()) {
  const [, attributes, content] = themeLinks[index];
  const href = attributes.match(/\bhref="([^"]+)"/i)?.[1];
  const ariaLabel = attributes.match(/\baria-label="([^"]+)"/i)?.[1] ?? "";
  const visibleText = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const accessibleName = ariaLabel || visibleText;

  assert.equal(href, `/game?arenaTheme=${slug}`, `${name} should open its literal arena theme`);
  assert.match(accessibleName, new RegExp(name, "i"), `${name} should have a clear accessible name`);
}

const surpriseLink = arenaSection.match(
  /<a\b([^>]*\bclass="[^"]*\barena-surprise\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/i,
);

assert.ok(surpriseLink, "landing should expose an Arena Surpresa call to action");
assert.equal(
  surpriseLink[1].match(/\bhref="([^"]+)"/i)?.[1],
  "/game?arenaTheme=surprise",
  "Arena Surpresa should delegate arena choice to the existing game route",
);
assert.match(
  `${surpriseLink[1]} ${surpriseLink[2]}`,
  /Arena Surpresa/i,
  "Arena Surpresa should have a human-readable accessible name",
);
assert.match(
  surpriseLink[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
  /O jogo escolhe uma arena para a partida\./i,
  "Arena Surpresa should explain its behavior without promising a reload change",
);

assert.match(html, /\.arena-row:focus-visible\b/);
assert.match(html, /\.arena-surprise:focus-visible\b/);
assert.match(
  html,
  /\.arena-row:focus-visible[\s\S]{0,180}outline:\s*2px\s+solid/i,
  "arena launchers should have a visible keyboard focus outline",
);

console.log("Landing arena launcher contract ok");
