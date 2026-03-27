import {
  PINNED_CHARACTERS,
  mergeManifestEntries,
  validatePinnedManifest,
} from "../scripts/import_pixellab_characters.mjs";

const imported = [
  {
    id: PINNED_CHARACTERS[1].id,
    name: "Pinned P2",
    pinned: true,
    defaultSlot: 2,
    order: 1,
  },
  {
    id: "extra-imported",
    name: "Extra Imported",
    pinned: false,
    order: 5,
  },
];

const existing = [
  {
    id: PINNED_CHARACTERS[0].id,
    name: "Pinned P1",
    pinned: true,
    defaultSlot: 1,
    order: 0,
  },
  {
    id: "legacy-extra",
    name: "Legacy Extra",
    pinned: false,
    order: 6,
  },
];

const merged = mergeManifestEntries(imported, existing);
const valid = validatePinnedManifest(merged);
const invalid = validatePinnedManifest(merged.filter((entry) => entry.id !== PINNED_CHARACTERS[0].id));

const pass = valid.valid
  && merged[0]?.id === PINNED_CHARACTERS[0].id
  && merged[1]?.id === PINNED_CHARACTERS[1].id
  && merged.some((entry) => entry.id === "legacy-extra")
  && invalid.valid === false;

console.log(JSON.stringify({
  merged,
  valid,
  invalid,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
