import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const docsIndexPath = path.join(repoRoot, "docs", "INDEX.md");
const docsIndexSource = await readFile(docsIndexPath, "utf8");

const links = Array.from(
  docsIndexSource.matchAll(/\[[^\]]+\]\(([^)]+)\)/g),
  ([, target]) => target.trim(),
).filter((target) => target && !/^(?:https?:|mailto:|#)/i.test(target));

const missingLinks = [];

for (const target of links) {
  const [targetPath] = target.split("#", 1);
  const resolvedPath = path.resolve(path.dirname(docsIndexPath), decodeURI(targetPath));

  try {
    await access(resolvedPath);
  } catch {
    missingLinks.push({
      target,
      resolvedPath: path.relative(repoRoot, resolvedPath),
    });
  }
}

const result = {
  pass: missingLinks.length === 0 && links.length > 0,
  checkedLinks: links.length,
  missingLinks,
};

console.log(JSON.stringify(result, null, 2));

if (!result.pass) {
  process.exit(1);
}
