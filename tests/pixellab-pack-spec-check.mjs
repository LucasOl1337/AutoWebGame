import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const specPath = path.join(projectRoot, "configs", "pixellab-pack.v1.json");
const spec = JSON.parse(await readFile(specPath, "utf8"));

const requiredTargets = [
  "public/Assets/TileMaps/floor-base.png",
  "public/Assets/TileMaps/floor-alt.png",
  "public/Assets/TileMaps/floor-spawn.png",
  "public/Assets/TileMaps/wall.png",
  "public/Assets/TileMaps/crate.png",
  "public/Assets/VisualEffects/bomb.png",
  "public/Assets/VisualEffects/bomb-ruins.png",
  "public/Assets/VisualEffects/flame.png",
  "public/Assets/VisualEffects/flame-ruins.png",
  "public/Assets/UiLayouts/power-bomb.png",
  "public/Assets/UiLayouts/power-flame.png",
  "public/Assets/UiLayouts/power-speed.png",
  "public/Assets/UiLayouts/power-remote.png",
];

const targetPaths = spec.assets.flatMap((asset) => (asset.outputs ?? []).map((output) => output.targetPath));
const missingTargets = requiredTargets.filter((target) => !targetPaths.includes(target));
const pinnedCharactersValid = Array.isArray(spec.pinnedCharacters)
  && spec.pinnedCharacters.length === 2
  && spec.pinnedCharacters[0]?.defaultSlot === 1
  && spec.pinnedCharacters[1]?.defaultSlot === 2;

const pass = missingTargets.length === 0 && pinnedCharactersValid;

console.log(JSON.stringify({
  missingTargets,
  pinnedCharacters: spec.pinnedCharacters,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
