import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../output/esm", import.meta.url));
const jsExtPattern = /(^|\/|\.)(mjs|cjs|js|json)$/i;

function walk(dirPath) {
  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!fullPath.endsWith(".js")) {
      continue;
    }

    const source = readFileSync(fullPath, "utf8");
    const patched = source
      .replace(/from\s+["'](\.{1,2}\/[^"']+)["']/g, (match, specifier) => {
        if (jsExtPattern.test(specifier)) {
          return match;
        }
        return match.replace(specifier, `${specifier}.js`);
      })
      .replace(/import\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g, (match, specifier) => {
        if (jsExtPattern.test(specifier)) {
          return match;
        }
        return match.replace(specifier, `${specifier}.js`);
      });

    if (patched !== source) {
      writeFileSync(fullPath, patched, "utf8");
    }
  }
}

walk(root);
