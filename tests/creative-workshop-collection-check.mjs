import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);

const deliveries = [
  ["Portal da arena", "public/Assets/UiLayouts/arena-portal-emblem.webp", "src/UiLayouts/launcher-shell.ts", "/Assets/UiLayouts/arena-portal-emblem.webp"],
  ["Planta de demolicao", "public/Assets/UiLayouts/launcher-demolition-blueprint.webp", "src/UiLayouts/launcher-shell.css", "/Assets/UiLayouts/launcher-demolition-blueprint.webp"],
  ["Drone Estopim", "public/Assets/UiLayouts/bootstrap-drone-estopim.png", "src/UiLayouts/bootstrap-drone.css", "/Assets/UiLayouts/bootstrap-drone-estopim.png"],
  ["Selo da arena", "public/Assets/marketing/hero-arena-sigil.webp", "src/UiLayouts/launcher-shell.ts", "/Assets/marketing/hero-arena-sigil.webp"],
  ["Bomba extra", "public/Assets/UiLayouts/power-bomb.png", "src/Engine/assets.ts", "/Assets/UiLayouts/power-bomb.png"],
  ["Alcance de chama", "public/Assets/UiLayouts/power-flame.png", "src/Engine/assets.ts", "/Assets/UiLayouts/power-flame.png"],
  ["Detonador remoto", "public/Assets/UiLayouts/power-remote.png", "src/Engine/assets.ts", "/Assets/UiLayouts/power-remote.png"],
  ["Escudo arcano", "public/Assets/UiLayouts/power-shield.png", "src/Engine/assets.ts", "/Assets/UiLayouts/power-shield.png"],
  ["Caixote Mare de Bronze", "public/Assets/TileMaps/themes/tidal-foundry/crate-mare-de-bronze.png", "src/Arenas/arena-theme-library.ts", "/Assets/TileMaps/themes/tidal-foundry/crate-mare-de-bronze.png"],
  ["Nucleo de ignicao", "public/Assets/ui/arena-ignition-core.webp", "src/NetCode/session-client.ts", "/Assets/ui/arena-ignition-core.webp"],
  ["Emblema de vitoria", "public/Assets/UiLayouts/arena-victory-emblem.webp", "src/Engine/assets.ts", "/Assets/UiLayouts/arena-victory-emblem.webp"],
  ["Arte do guia", "public/Assets/UiLayouts/how-to-play-arena-tactical.webp", "how-to-play.html", "/Assets/UiLayouts/how-to-play-arena-tactical.webp"],
  ["Icone do jogo", "public/Assets/UiLayouts/favicon-bomba-coroa.png", "game.html", "/Assets/UiLayouts/favicon-bomba-coroa.png"],
  ["Icone PWA", "public/brand/bomba-prism-icon-512.png", "index.html", "/brand/bomba-prism-icon-512.png"],
  ["Rastro Relampago", "public/Assets/UiLayouts/power-speed-rastro-relampago.png", "src/Engine/assets.ts", "/Assets/UiLayouts/power-speed-rastro-relampago.png"],
];

for (const [name, assetPath, consumerPath, needle] of deliveries) {
  const [assetInfo, consumer] = await Promise.all([
    stat(new URL(assetPath, root)),
    readFile(new URL(consumerPath, root), "utf8"),
  ]);
  assert.ok(assetInfo.size > 0, `${name}: o arquivo final esta vazio`);
  assert.ok(consumer.includes(needle), `${name}: existe como arquivo, mas nao esta ligado ao produto`);
}

const approvedManifest = JSON.parse(
  await readFile(new URL("public/Assets/Characters/Animations/manifest.approved.json", root), "utf8"),
);
const nico = approvedManifest.characters.find(
  (character) => character.id === "5474c45c-2987-43e0-af2c-a6500c836881",
);
assert.equal(nico?.animations?.death, true, "Nico: a animacao de derrota precisa estar habilitada no manifesto aprovado");

const collectionReport = await readFile(
  new URL("DocsDev/oficina-criativa-visual-coleta.md", root),
  "utf8",
);
for (const [name] of deliveries) {
  assert.ok(collectionReport.includes(name), `${name}: falta explicar a entrega no relatorio humano`);
}
assert.ok(collectionReport.includes("Animacao de derrota do Nico"));

console.log(JSON.stringify({
  pass: true,
  integratedDeliveries: deliveries.length + 1,
  orphanedFinalAssets: 0,
}, null, 2));
