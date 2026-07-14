import { readFile } from "node:fs/promises";

const [packageJsonSource, readmeSource] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../README.md", import.meta.url), "utf8"),
]);

const packageJson = JSON.parse(packageJsonSource);
const scripts = packageJson.scripts ?? {};

function extractSection(source, heading) {
  const headingPattern = new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");
  const headingMatch = source.match(headingPattern);
  if (!headingMatch || headingMatch.index === undefined) {
    throw new Error(`Missing README section: ${heading}`);
  }

  const sectionStart = headingMatch.index + headingMatch[0].length;
  const nextHeadingMatch = source.slice(sectionStart).match(/^## /m);
  const sectionEnd = nextHeadingMatch?.index === undefined
    ? source.length
    : sectionStart + nextHeadingMatch.index;
  return source.slice(sectionStart, sectionEnd);
}

function extractNpmRunCommands(markdownSection) {
  return Array.from(markdownSection.matchAll(/^\s*npm run ([\w:-]+)\s*$/gm), ([, scriptName]) => scriptName);
}

const releaseSection = extractSection(readmeSource, "Release-Oriented Test Commands");
const documentedReleaseScripts = extractNpmRunCommands(releaseSection);
const missingReleaseScripts = documentedReleaseScripts.filter((scriptName) => !scripts[scriptName]);
const deployScriptsInReleaseGate = documentedReleaseScripts.filter((scriptName) => /deploy|publish|seed|migrat/i.test(scriptName));

const result = {
  pass: missingReleaseScripts.length === 0
    && deployScriptsInReleaseGate.length === 0
    && documentedReleaseScripts.includes("build"),
  documentedReleaseScripts,
  missingReleaseScripts,
  deployScriptsInReleaseGate,
  hasBuildGate: documentedReleaseScripts.includes("build"),
};

console.log(JSON.stringify(result, null, 2));

if (!result.pass) {
  process.exit(1);
}
