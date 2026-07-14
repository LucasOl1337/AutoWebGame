import { access, readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const themeSourcePath = path.join(projectRoot, "src", "Arenas", "arena-theme-library.ts");
const crateRelativePath = "public/Assets/TileMaps/themes/tidal-foundry/crate-mare-de-bronze.png";
const crateRuntimePath = "/Assets/TileMaps/themes/tidal-foundry/crate-mare-de-bronze.png";
const cratePath = path.join(projectRoot, crateRelativePath);

const themeSource = await readFile(themeSourcePath, "utf8");
await access(cratePath);
const png = await readFile(cratePath);

const hasPngSignature = png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
const tidalThemeStart = themeSource.indexOf('id: "tidal-foundry"');
const nextThemeStart = themeSource.indexOf('\n  {', tidalThemeStart + 1);
const tidalThemeSource = themeSource.slice(tidalThemeStart, nextThemeStart);
const usesFinalCrate = tidalThemeSource.includes(`crate: "${crateRuntimePath}"`);
const pass = hasPngSignature && width === 32 && height === 32 && usesFinalCrate;

console.log(JSON.stringify({
  crateRelativePath,
  dimensions: `${width}x${height}`,
  hasPngSignature,
  usesFinalCrate,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
