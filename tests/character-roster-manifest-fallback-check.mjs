const manifestFetches = [];
const imageRequests = [];

globalThis.fetch = async (url) => {
  manifestFetches.push(String(url));
  throw new Error("manifest unavailable");
};

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
    const isCharacterStaticSprite =
      /\/Assets\/Characters\/Animations\/[0-9a-f-]+\/(south|east|north|west)\.png$/.test(this.#src);
    queueMicrotask(() => {
      if (isCharacterStaticSprite) {
        this.onload?.();
        return;
      }
      this.onerror?.();
    });
  }

  async decode() {}
}

globalThis.Image = FakeImage;

const { loadGameAssets } = await import("../output/esm/Engine/assets.js");
const { CHARACTER_ROSTER_MANIFEST } = await import("../output/esm/Characters/Animations/character-roster-manifest.js");

const assets = await loadGameAssets();
const roster = assets.characterRoster ?? [];
const expectedIds = CHARACTER_ROSTER_MANIFEST.map((entry) => entry.id);
const rosterIds = roster.map((entry) => entry.id);
const rosterNames = roster.map((entry) => entry.name);
const firstEntry = roster[0];
const firstSprites = firstEntry ? await assets.characterSpriteLoader(firstEntry) : null;

const pass =
  manifestFetches.length === 1
  && JSON.stringify(rosterIds) === JSON.stringify(expectedIds)
  && rosterNames.includes("Ranni")
  && !rosterIds.includes("default-p1")
  && firstSprites?.down?.src === `/Assets/Characters/Animations/${expectedIds[0]}/south.png`
  && firstSprites?.right?.src === `/Assets/Characters/Animations/${expectedIds[0]}/east.png`;

console.log(
  JSON.stringify(
    {
      manifestFetches,
      rosterIds,
      rosterNames,
      firstSpriteRequests: imageRequests.filter((request) => request.includes(expectedIds[0])),
      pass,
    },
    null,
    2,
  ),
);

if (!pass) {
  process.exit(1);
}
