import { readFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const specPath = path.join(projectRoot, "configs", "pixellab-pack.v1.json");
const spec = JSON.parse(await readFile(specPath, "utf8"));

const requiredTargets = [
  "public/assets/tiles/floor-base.png",
  "public/assets/tiles/floor-alt.png",
  "public/assets/tiles/floor-spawn.png",
  "public/assets/tiles/wall.png",
  "public/assets/tiles/crate.png",
  "public/assets/sprites/bomb.png",
  "public/assets/sprites/bomb-ruins.png",
  "public/assets/sprites/flame.png",
  "public/assets/sprites/flame-ruins.png",
  "public/assets/ui/power-bomb.png",
  "public/assets/ui/power-flame.png",
  "public/assets/ui/power-speed.png",
  "public/assets/ui/power-remote.png",
  "public/assets/ui/power-shield.png",
  "public/assets/ui/power-bomb-pass.png",
  "public/assets/ui/power-kick.png",
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
