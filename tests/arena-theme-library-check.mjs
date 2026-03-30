import { access, readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const configPath = path.join(projectRoot, "configs", "arena-theme-library.json");
const raw = await readFile(configPath, "utf8");
const config = JSON.parse(raw);

const themeIds = new Set((config.themes ?? []).map((theme) => theme.id));
const defaultThemeExists = themeIds.has(config.defaultTheme);
const themedEntries = (config.themes ?? []).filter((theme) => typeof theme.assetFolder === "string");
const missingFiles = [];

for (const theme of themedEntries) {
  for (const targetPath of Object.values(theme.tilePaths ?? {})) {
    const absolutePath = path.join(projectRoot, targetPath);
    try {
      await access(absolutePath);
    } catch {
      missingFiles.push(targetPath);
    }
  }
}

const pass = defaultThemeExists
  && themedEntries.length >= 2
  && missingFiles.length === 0
  && (config.themes ?? []).every((theme) => typeof theme.pixellabDescription === "string" && theme.pixellabDescription.length > 40);

console.log(JSON.stringify({
  defaultTheme: config.defaultTheme,
  themeCount: (config.themes ?? []).length,
  themedEntries: themedEntries.length,
  missingFiles,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
