const imageRequests = [];

class FakeImage {
  onload = null;
  onerror = null;
  naturalWidth = 124;
  naturalHeight = 124;
  width = 124;
  height = 124;
  #src = "";

  get src() {
    return this.#src;
  }

  set src(value) {
    this.#src = String(value);
    imageRequests.push(this.#src);
    const isDefaultPlayerBaseSprite =
      /\/Assets\/Characters\/Animations\/default-players\/player[12]-(south|east|north|west)(-hires)?\.png$/.test(this.#src);

    queueMicrotask(() => {
      if (isDefaultPlayerBaseSprite) {
        this.onload?.();
        return;
      }
      this.onerror?.();
    });
  }

  async decode() {}
}

globalThis.Image = FakeImage;

const { CHARACTER_ROSTER_MANIFEST } = await import("../output/esm/Characters/Animations/character-roster-manifest.js");

const manifestFetches = [];
globalThis.fetch = async (url) => {
  manifestFetches.push(String(url));
  return {
    ok: true,
    async json() {
      return {
        generatedAt: "sprite-fallback-check",
        characters: CHARACTER_ROSTER_MANIFEST,
      };
    },
  };
};

const { loadGameAssets } = await import("../output/esm/Engine/assets.js");

const assets = await loadGameAssets();
const roster = assets.characterRoster ?? [];
const ranni = roster.find((entry) => entry.name === "Ranni");
const killerBee = roster.find((entry) => entry.name === "Killer Bee");
const ranniSprites = ranni ? await assets.characterSpriteLoader(ranni) : null;
const killerBeeSprites = killerBee ? await assets.characterSpriteLoader(killerBee) : null;

const ranniCharacterRequests = imageRequests.filter((request) => request.includes(CHARACTER_ROSTER_MANIFEST[0].id));
const killerBeeCharacterRequests = imageRequests.filter((request) => request.includes(CHARACTER_ROSTER_MANIFEST[1].id));

const pass =
  manifestFetches.length === 1
  && roster.length === CHARACTER_ROSTER_MANIFEST.length
  && !roster.some((entry) => entry.id === "default-p1" || entry.id === "default-p2")
  && ranniCharacterRequests.some((request) => request.includes("/south.png?v=sprite-fallback-check"))
  && killerBeeCharacterRequests.some((request) => request.includes("/south.png?v=sprite-fallback-check"))
  && ranniSprites?.down?.src === "/Assets/Characters/Animations/default-players/player1-south-hires.png"
  && ranniSprites?.right?.src === "/Assets/Characters/Animations/default-players/player1-east-hires.png"
  && killerBeeSprites?.down?.src === "/Assets/Characters/Animations/default-players/player2-south.png"
  && killerBeeSprites?.right?.src === "/Assets/Characters/Animations/default-players/player2-east.png";

console.log(
  JSON.stringify(
    {
      manifestFetches,
      roster: roster.map((entry) => ({ id: entry.id, name: entry.name })),
      ranniCharacterRequests,
      killerBeeCharacterRequests,
      ranniFallback: {
        down: ranniSprites?.down?.src ?? null,
        right: ranniSprites?.right?.src ?? null,
      },
      killerBeeFallback: {
        down: killerBeeSprites?.down?.src ?? null,
        right: killerBeeSprites?.right?.src ?? null,
      },
      pass,
    },
    null,
    2,
  ),
);

if (!pass) {
  process.exit(1);
}
