import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/Engine/game-app.ts", import.meta.url), "utf8");
const drawPowerUpStart = source.indexOf("private drawPowerUp(powerUp: PowerUpState): void {");
const drawPowerUpEnd = source.indexOf("private drawBomb(bomb: BombState): void {", drawPowerUpStart);
const drawPowerUp = drawPowerUpStart >= 0 && drawPowerUpEnd > drawPowerUpStart
  ? source.slice(drawPowerUpStart, drawPowerUpEnd)
  : "";

assert.ok(drawPowerUp, "drawPowerUp deve existir");
assert.match(drawPowerUp, /if \(sprite\) \{[\s\S]*?this\.ctx\.save\(\)/, "sprite deve isolar estado do canvas");
assert.match(drawPowerUp, /fillStyle = "rgba\(8, 10, 14, 0\.66\)"[\s\S]*?arc\(x \+ 16, y \+ 16, 13, 0, Math\.PI \* 2\)[\s\S]*?fill\(\)/, "sprite deve ganhar fundo circular escuro");
assert.match(drawPowerUp, /strokeStyle = "rgba\(255, 244, 214, 0\.82\)"[\s\S]*?lineWidth = 1\.5[\s\S]*?stroke\(\)/, "silhueta deve ter contorno claro");
assert.match(drawPowerUp, /drawImage\(sprite, x \+ 2, y \+ 2, TILE_SIZE - 4, TILE_SIZE - 4\)/, "sprite deve manter margem interna legível");
assert.match(drawPowerUp, /drawImage[\s\S]*?this\.ctx\.restore\(\)[\s\S]*?return;/, "estado do canvas deve ser restaurado");
assert.doesNotMatch(drawPowerUp, /powerUp\.(?:collected|revealed|type)\s*=/, "render não deve alterar estado do power-up");

console.log(JSON.stringify({
  hasDarkSilhouette: true,
  hasLightOutline: true,
  spriteInsetPx: 2,
  stateMutation: false,
  pass: true,
}));
