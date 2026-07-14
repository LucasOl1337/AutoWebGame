import { readFile } from "node:fs/promises";

const [i18n, sessionClient, css] = await Promise.all([
  readFile(new URL("../src/UiLayouts/i18n.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8"),
]);

const checks = {
  hasPortugueseBadge: i18n.includes('releaseBadge: "v0.4.3 no ar"'),
  hasEnglishBadge: i18n.includes('releaseBadge: "v0.4.3 live"'),
  hasPortuguesePatchTitle: i18n.includes('releaseTitle: "Novidades do patch"'),
  hasEnglishPatchTitle: i18n.includes('releaseTitle: "Patch highlights"'),
  rendersReleaseBadge: sessionClient.includes('landingReleaseBadge.className = "experience-release-badge"'),
  rendersReleaseNotes: sessionClient.includes('landingReleaseNotes.className = "experience-release-notes"'),
  stylesReleaseBadge: css.includes(".experience-release-badge"),
  stylesReleaseNotes: css.includes(".experience-release-notes"),
};

const pass = Object.values(checks).every(Boolean);

console.log(JSON.stringify({ checks, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
