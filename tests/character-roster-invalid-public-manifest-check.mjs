const manifestFetches = [];
const imageRequests = [];

const duplicatedApprovedId = "03a976fb-7313-4064-a477-5bb9b0760034";

globalThis.fetch = async (url) => {
  manifestFetches.push(String(url));
  return {
    ok: true,
    async json() {
      return {
        generatedAt: "duplicated-public-manifest",
        characters: [
          { id: duplicatedApprovedId, name: "Ranni", order: 0 },
          { id: duplicatedApprovedId, name: "Ranni Copy", order: 1 },
        ],
      };
    },
  };
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
    const isApprovedCharacterStaticSprite =
      /\/Assets\/Characters\/Animations\/[0-9a-f-]+\/(south|east|north|west)\.png$/.test(this.#src);
    queueMicrotask(() => {
      if (isApprovedCharacterStaticSprite) {
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
  && rosterNames.includes("Killer Bee")
  && rosterNames.includes("Crocodilo Arcano")
  && rosterNames.includes("Nico")
  && !rosterNames.includes("Ranni Copy")
  && firstSprites?.down?.src === `/Assets/Characters/Animations/${expectedIds[0]}/south.png`
  && !firstSprites?.down?.src.includes("duplicated-public-manifest");

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
