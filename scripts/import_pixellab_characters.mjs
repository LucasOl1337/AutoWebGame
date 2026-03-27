import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();
const TEMP_DIR = path.join(PROJECT_ROOT, "output", "pixellab-sync");
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public", "assets", "characters");
const MANIFEST_PATH = path.join(PUBLIC_DIR, "manifest.json");
const APPROVED_MANIFEST_PATH = path.join(PUBLIC_DIR, "manifest.approved.json");
const INVALID_REPORT_PATH = path.join(TEMP_DIR, "manifest-invalid.json");

export const PINNED_CHARACTERS = [
  {
    id: "03a976fb-7313-4064-a477-5bb9b0760034",
    name: "Ranni",
    defaultSlot: 1,
    order: 0,
  },
  {
    id: "6ee8baa5-3277-413b-ae0e-2659b9cc52e9",
    name: "Killer Bee",
    defaultSlot: 2,
    order: 1,
  },
];
const RANNI_CHARACTER_ID = "03a976fb-7313-4064-a477-5bb9b0760034";

const CHARACTER_NAME_OVERRIDES = {
  "03a976fb-7313-4064-a477-5bb9b0760034": "Ranni",
  "6ee8baa5-3277-413b-ae0e-2659b9cc52e9": "Killer Bee",
  "5474c45c-2987-43e0-af2c-a6500c836881": "Nico",
};

const WALK_ANIMATION_CANDIDATES = [
  "walking-8-frames",
  "walking-6-frames",
  "walking-4-frames",
  "walking",
  "walk",
  "walk-1",
  "walk-2",
  "running-8-frames",
  "running-6-frames",
  "running-4-frames",
];

const IDLE_ANIMATION_CANDIDATES = [
  "breathing-idle",
  "fight-stance-idle-8-frames",
  "crouching",
];

const RUN_ANIMATION_CANDIDATES = [
  "running-8-frames",
  "running-6-frames",
  "running-4-frames",
  "running",
];
const RUN_ANIMATION_PATTERNS = ["run", "dash"];

const CAST_ANIMATION_CANDIDATES = [
  "fireball",
  "throw-object",
  "drinking",
];
const CAST_ANIMATION_PATTERNS = ["cast", "spell", "magic", "dark-energy", "fireball"];
const RANNI_ICE_CAST_PATTERNS = ["ice cube", "ice block", "ice splash", "custom-became an ice cube"];
const DIRECTION_FALLBACKS = {
  south: ["south-east", "south-west", "east", "west", "north-east", "north-west", "north"],
  east: ["north-east", "south-east", "north", "south", "north-west", "south-west", "west"],
  north: ["north-east", "north-west", "east", "west", "south-east", "south-west", "south"],
  west: ["north-west", "south-west", "north", "south", "north-east", "south-east", "east"],
};

const ATTACK_ANIMATION_CANDIDATES = [
  "high-kick",
  "cross-punch",
  "taking-punch",
  "lead-jab",
];
const ATTACK_ANIMATION_PATTERNS = ["attack", "kick", "punch", "jab", "slash", "shot", "sting"];

const CHARACTER_IDS = [
  "03a976fb-7313-4064-a477-5bb9b0760034",
  "2dc82f91-549d-4c0e-b509-f1a044984671",
  "93811930-cc11-4cb7-b3b5-f250bb2ecf27",
  "6ee8baa5-3277-413b-ae0e-2659b9cc52e9",
  "20f4a97f-965a-4476-b147-a3116d59d5e6",
  "131be4bd-754f-4e20-9f02-33fff83abaeb",
  "b2f68de2-4db4-40fd-b6b6-bed43adf47c4",
  "66bd2288-1e0e-4e19-8cb0-8566fe95bea2",
  "dc565e75-9f3c-4117-b27c-1ece71be7ab7",
  "bc5bced5-a29f-4952-a0e7-1c079e50c9fc",
  "9c0e6331-666f-47bb-b125-ef710356a507",
  "01fd076c-058d-4e01-9288-4a3974956e35",
  "d7ed9168-35eb-4b03-8107-0d4424b51694",
  "5cc73a0c-c996-427a-b057-b09d0b43a77e",
  "9858c1b3-c47d-4cc6-8af2-e12cb46da914",
  "adeca2d1-7466-4df0-a310-a7be2e719ec0",
  "9d6efa2b-003c-498e-88e6-b284b4a5f3b1",
  "e35e824a-ea3d-46b5-b446-a64df4ea8754",
  "898e815e-d483-461f-9c1b-8e116357ea50",
  "55178519-4cef-47c1-86b1-800ac0bcecfa",
  "fe9122a2-5567-4825-8b65-f3081e833883",
  "e8a5da63-cd7f-4ed2-bb1e-395d0d08009c",
  "7554a487-9b61-484f-a4a2-85f4b25c8b52",
  "ca317fb8-a642-4bcd-8208-4a0e8f0ddeb5",
  "a0cedc98-aba7-4b39-b458-647a2af6975f",
  "c915abf1-b7ec-421b-b81f-468feac33584",
  "e607b7e0-e632-4718-a054-7ae08b1fd1a0",
  "39513e05-b6c2-4e68-bf4a-d63c49db8cfe",
  "678fbb3a-a586-4c1e-b3c1-1e8faa71003a",
  "f3e24091-aabe-4524-af36-6139a448dd31",
  "a2a946e7-a376-4128-b4a7-64dd93be2f27",
  "e10f8781-8678-4f0f-85b7-c388972ef3be",
  "596c1fdf-9b78-4f34-b455-131d4bb27b05",
  "d3ff0ed5-49ce-407e-940d-e8fcc8d7b405",
  "d2529d0a-3d47-4033-9183-cc20dac65402",
  "cebaeebb-b562-4c05-be3e-2e1abf23186a",
  "f367e6fa-cf26-4bbd-b8bd-ba82bd0c5de6",
  "5f508908-0f62-424f-b894-a0e446f7ec7c",
  "12b4edda-6484-471c-9494-9a843251dc98",
  "0d83f409-bffa-4742-b1b9-de1a13e86659",
  "b34f2f3f-f7c0-4414-848f-3c373e013400",
  "97c67908-5631-4cbf-9068-a79ce4b92a32",
  "743ddc74-72f7-42fc-b2af-56826acbfa32",
  "01ffdcd7-4b0b-4d5f-a3f0-a011309e9284",
  "90e23540-5cb6-44a1-ac17-cbc4d556f22a",
  "f640037c-6241-43b3-8b55-259153a8f4c2",
  "bc1c2ffb-ad8c-41cf-a8c2-5d4d8615af20",
  "bb9255c1-3f90-4095-ae65-6d5b7a6bd1e6",
  "85c70795-2fa6-4f81-88fe-f1dc37434ad5",
  "465fd522-44c2-4773-b1f8-9530d661ecd5",
  "5474c45c-2987-43e0-af2c-a6500c836881",
  "52d93176-bfde-4e0d-8f36-82731260bd5a",
  "85451d99-10a2-43be-8dfe-64e2ba6bf690",
  "e193bb5e-0eb3-4613-a106-3d401f305852",
  "80057059-3243-416b-8d6d-f2dcf854dc0d",
  "647d0e75-aa06-4220-9cf2-4ce28b1e5c3d",
  "89795419-2e13-4fab-98d2-e0e1a8fbd400",
  "4060d90b-a56a-460c-89fc-0626436c7f74",
  "3e66bd4e-5a7b-4e1f-917e-047283d4b56b",
  "1a047d77-2592-4b7b-a47f-3e74c295753c",
  "7013e9f1-a36a-4f41-a2b1-3c28a75c95e7",
  "77614816-100e-4806-af88-6dd90d4f94f3",
  "657ca70f-fdfc-49fd-abf7-a21f811a5d1c",
  "ea7d9013-7afe-42ab-8435-577c1c7eeb52",
  "bb7d7ef2-81b6-42e1-a9c6-7ed7fe7c4d6b",
  "2f5e74cb-7387-461d-af4a-cc2a02694eb2",
  "4dfebb11-5982-45ec-bcde-ab3e7cc91ab1",
  "b180ab43-9e2f-4512-95e6-2b12ee273e27",
  "c0eee06c-06a9-4149-89fc-2d83f3f607f4",
  "62db841f-24b8-4a82-8370-e5d709da74bd",
  "3b8dfe65-5331-4dbe-9aa8-0009f7abd973",
  "7964a2f0-bbea-4a00-9398-2defd614eabd",
  "9c8eef27-0b27-4c5d-b23f-e82d9244e59b",
  "9fe4efef-1f46-4eb7-8b87-3a1f227cb6e6",
  "0fb0ec2f-e621-4efb-8922-5fe17ab9e03a",
  "839fcfec-5e19-4927-b51a-a181f7038bf5",
  "a57a868c-f2c3-4e11-b4db-5f255c9408c4",
];

function uniqueIds(ids) {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))];
}

export function resolveCharacterIds() {
  const rawList = process.env.PIXELLAB_CHARACTER_IDS ?? "";
  const requestedIds = rawList
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const seedIds = requestedIds.length > 0 ? requestedIds : CHARACTER_IDS;
  return uniqueIds([
    ...PINNED_CHARACTERS.map((entry) => entry.id),
    ...seedIds,
  ]);
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonIfExists(filePath) {
  if (!await exists(filePath)) {
    return null;
  }
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function downloadZip(characterId, zipPath) {
  const url = `https://api.pixellab.ai/mcp/characters/${characterId}/download`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(zipPath, buffer);
}

async function extractZip(zipPath, extractDir) {
  await rm(extractDir, { recursive: true, force: true });
  await ensureDir(extractDir);
  execFileSync("tar", ["-xf", zipPath, "-C", extractDir], { stdio: "ignore" });
}

function getRotationPath(rotations, key, fallback) {
  if (rotations[key]) {
    return rotations[key];
  }
  if (fallback && rotations[fallback]) {
    return rotations[fallback];
  }
  return null;
}

function cleanName(rawName, characterId) {
  const overrideName = CHARACTER_NAME_OVERRIDES[characterId];
  if (overrideName) {
    return overrideName;
  }
  const base = (rawName ?? "").replace(/\s+/g, " ").trim();
  if (!base) {
    return characterId.slice(0, 8);
  }
  if (base.length <= 64) {
    return base;
  }
  return `${base.slice(0, 61)}...`;
}

function findAnimationCandidatesByPatterns(animations, patterns = []) {
  const names = Object.keys(animations ?? {});
  const matches = [];
  for (const rawPattern of patterns) {
    const pattern = rawPattern.toLowerCase();
    for (const name of names) {
      if (!name.toLowerCase().includes(pattern)) {
        continue;
      }
      if (!matches.includes(name)) {
        matches.push(name);
      }
    }
  }
  return matches;
}

function getFramesForDirection(byDirection, direction, options = {}) {
  const {
    allowDirectionFallback = false,
    allowAnyDirectionFallback = false,
  } = options;

  const directions = [direction];
  if (allowDirectionFallback) {
    directions.push(...(DIRECTION_FALLBACKS[direction] ?? []));
  }

  const seenDirections = new Set();
  for (const candidateDirection of directions) {
    if (seenDirections.has(candidateDirection)) {
      continue;
    }
    seenDirections.add(candidateDirection);
    const rawFrames = byDirection?.[candidateDirection];
    if (!Array.isArray(rawFrames)) {
      continue;
    }
    const frames = rawFrames.filter((frame) => typeof frame === "string" && frame.length > 0);
    if (frames.length > 0) {
      return frames;
    }
  }

  if (!allowAnyDirectionFallback) {
    return [];
  }

  for (const rawFrames of Object.values(byDirection ?? {})) {
    if (!Array.isArray(rawFrames)) {
      continue;
    }
    const frames = rawFrames.filter((frame) => typeof frame === "string" && frame.length > 0);
    if (frames.length > 0) {
      return frames;
    }
  }

  return [];
}

function getAnimationFrames(animations, candidates, direction, patterns = [], options = {}) {
  for (const animationName of candidates) {
    const byDirection = animations?.[animationName];
    if (!byDirection) {
      continue;
    }
    const frames = getFramesForDirection(byDirection, direction, options);
    if (frames.length > 0) {
      return frames;
    }
  }

  const patternCandidates = findAnimationCandidatesByPatterns(animations, patterns);
  for (const animationName of patternCandidates) {
    const byDirection = animations?.[animationName];
    if (!byDirection) {
      continue;
    }
    const frames = getFramesForDirection(byDirection, direction, options);
    if (frames.length > 0) {
      return frames;
    }
  }
  return [];
}

async function clearAnimationPrefixFrames(destinationDir, prefix) {
  const files = await readdir(destinationDir, { withFileTypes: true });
  const targetPrefix = `${prefix}-`;
  await Promise.all(files
    .filter((entry) => entry.isFile() && entry.name.startsWith(targetPrefix) && entry.name.endsWith(".png"))
    .map((entry) => unlink(path.join(destinationDir, entry.name))));
}

async function copyAnimationFrames(extractDir, destinationDir, prefix, frames) {
  for (const [index, framePath] of frames.entries()) {
    await copyFile(
      path.join(extractDir, framePath),
      path.join(destinationDir, `${prefix}-${index}.png`),
    );
  }
}

async function copyAnimationSet(extractDir, destinationDir, animations, candidates, prefix, patterns = [], options = {}) {
  let hasFrames = false;
  for (const [direction, target] of [
    ["south", `${prefix}-south`],
    ["east", `${prefix}-east`],
    ["north", `${prefix}-north`],
    ["west", `${prefix}-west`],
  ]) {
    await clearAnimationPrefixFrames(destinationDir, target);
    const frames = getAnimationFrames(animations, candidates, direction, patterns, options);
    if (frames.length > 0) {
      await copyAnimationFrames(extractDir, destinationDir, target, frames);
      hasFrames = true;
    }
  }
  return hasFrames;
}

export function buildManifestEntry(characterId, metadata) {
  const pinned = PINNED_CHARACTERS.find((entry) => entry.id === characterId) ?? null;
  return {
    id: characterId,
    name: cleanName(metadata?.character?.name, characterId),
    size: metadata?.character?.size ?? null,
    animations: {
      idle: false,
      walk: false,
      run: false,
      cast: false,
      attack: false,
    },
    pinned: Boolean(pinned),
    defaultSlot: pinned?.defaultSlot,
    order: pinned?.order,
  };
}

export function mergeManifestEntries(importedEntries, existingEntries = []) {
  const byId = new Map();

  for (const existing of existingEntries) {
    if (existing?.id) {
      byId.set(existing.id, existing);
    }
  }

  for (const entry of importedEntries) {
    byId.set(entry.id, entry);
  }

  return [...byId.values()].sort((a, b) => {
    const pinnedA = a.pinned === true ? 0 : 1;
    const pinnedB = b.pinned === true ? 0 : 1;
    if (pinnedA !== pinnedB) {
      return pinnedA - pinnedB;
    }

    const orderA = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
    const orderB = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return String(a.name ?? a.id).localeCompare(String(b.name ?? b.id));
  });
}

export function validatePinnedManifest(entries) {
  const errors = [];

  for (const pinned of PINNED_CHARACTERS) {
    const index = entries.findIndex((entry) => entry.id === pinned.id);
    if (index === -1) {
      errors.push(`Missing pinned character ${pinned.id}`);
      continue;
    }
    if (index !== pinned.order) {
      errors.push(`Pinned character ${pinned.id} is at index ${index}, expected ${pinned.order}`);
    }
    if (entries[index].defaultSlot !== pinned.defaultSlot) {
      errors.push(`Pinned character ${pinned.id} has defaultSlot ${entries[index].defaultSlot}, expected ${pinned.defaultSlot}`);
    }
    if (entries[index].pinned !== true) {
      errors.push(`Pinned character ${pinned.id} is not marked pinned`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

async function writeManifestArtifacts(manifestEntries, summary) {
  const payload = {
    generatedAt: new Date().toISOString(),
    totalRequested: summary.totalRequested,
    imported: summary.imported,
    skipped: summary.skipped,
    invalid: false,
    characters: manifestEntries,
  };
  await writeFile(MANIFEST_PATH, JSON.stringify(payload, null, 2));
  await writeFile(APPROVED_MANIFEST_PATH, JSON.stringify(payload, null, 2));
}

async function writeInvalidReport(summary, errors, attemptedIds) {
  await ensureDir(TEMP_DIR);
  const payload = {
    generatedAt: new Date().toISOString(),
    invalid: true,
    attemptedIds,
    summary,
    errors,
  };
  await writeFile(INVALID_REPORT_PATH, JSON.stringify(payload, null, 2));
}

export async function importPixelLabCharacters() {
  await ensureDir(TEMP_DIR);
  await ensureDir(PUBLIC_DIR);

  const existingManifest = await readJsonIfExists(MANIFEST_PATH);
  const approvedManifest = await readJsonIfExists(APPROVED_MANIFEST_PATH);
  const existingCharacters = Array.isArray(approvedManifest?.characters)
    ? approvedManifest.characters
    : Array.isArray(existingManifest?.characters)
      ? existingManifest.characters
      : [];

  const manifest = [];
  let imported = 0;
  let skipped = 0;
  const characterIds = resolveCharacterIds();

  for (const characterId of characterIds) {
    const zipPath = path.join(TEMP_DIR, `${characterId}.zip`);
    const extractDir = path.join(TEMP_DIR, characterId);
    try {
      await downloadZip(characterId, zipPath);
      await extractZip(zipPath, extractDir);

      const metadataPath = path.join(extractDir, "metadata.json");
      const metadataRaw = await readFile(metadataPath, "utf8");
      const metadata = JSON.parse(metadataRaw);
      const rotations = metadata?.frames?.rotations ?? {};
      const animations = metadata?.frames?.animations ?? {};

      const south = getRotationPath(rotations, "south");
      const east = getRotationPath(rotations, "east", "south-east");
      const north = getRotationPath(rotations, "north");
      const west = getRotationPath(rotations, "west", "south-west");
      if (!south || !east || !north || !west) {
        skipped += 1;
        continue;
      }

      const destinationDir = path.join(PUBLIC_DIR, characterId);
      await ensureDir(destinationDir);
      await copyFile(path.join(extractDir, south), path.join(destinationDir, "south.png"));
      await copyFile(path.join(extractDir, east), path.join(destinationDir, "east.png"));
      await copyFile(path.join(extractDir, north), path.join(destinationDir, "north.png"));
      await copyFile(path.join(extractDir, west), path.join(destinationDir, "west.png"));

      const hasWalkFrames = await copyAnimationSet(
        extractDir,
        destinationDir,
        animations,
        WALK_ANIMATION_CANDIDATES,
        "walk",
      );
      const hasIdleFrames = await copyAnimationSet(
        extractDir,
        destinationDir,
        animations,
        IDLE_ANIMATION_CANDIDATES,
        "idle",
      );
      const hasRunFrames = await copyAnimationSet(
        extractDir,
        destinationDir,
        animations,
        RUN_ANIMATION_CANDIDATES,
        "run",
        RUN_ANIMATION_PATTERNS,
      );
      const hasCastFrames = await copyAnimationSet(
        extractDir,
        destinationDir,
        animations,
        characterId === RANNI_CHARACTER_ID
          ? [...findAnimationCandidatesByPatterns(animations, RANNI_ICE_CAST_PATTERNS), ...CAST_ANIMATION_CANDIDATES]
          : CAST_ANIMATION_CANDIDATES,
        "cast",
        characterId === RANNI_CHARACTER_ID
          ? [...RANNI_ICE_CAST_PATTERNS, ...CAST_ANIMATION_PATTERNS]
          : CAST_ANIMATION_PATTERNS,
        characterId === RANNI_CHARACTER_ID
          ? { allowDirectionFallback: true, allowAnyDirectionFallback: true }
          : {},
      );
      const hasAttackFrames = await copyAnimationSet(
        extractDir,
        destinationDir,
        animations,
        ATTACK_ANIMATION_CANDIDATES,
        "attack",
        ATTACK_ANIMATION_PATTERNS,
      );

      const manifestEntry = buildManifestEntry(characterId, metadata);
      manifestEntry.animations = {
        idle: hasIdleFrames,
        walk: hasWalkFrames,
        run: hasRunFrames,
        cast: hasCastFrames,
        attack: hasAttackFrames,
      };
      manifest.push(manifestEntry);
      imported += 1;
      process.stdout.write(`Imported ${characterId}\n`);
    } catch (error) {
      skipped += 1;
      process.stdout.write(`Skipped ${characterId}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  const mergedManifest = mergeManifestEntries(manifest, existingCharacters);
  const validation = validatePinnedManifest(mergedManifest);
  const summary = {
    totalRequested: characterIds.length,
    imported,
    skipped,
  };

  if (!validation.valid) {
    await writeInvalidReport(summary, validation.errors, characterIds);
    process.stdout.write("Manifest invalid. Keeping last approved manifest.\n");
    return {
      ok: false,
      summary,
      errors: validation.errors,
    };
  }

  await writeManifestArtifacts(mergedManifest, summary);
  process.stdout.write(`Done. Imported ${imported}/${characterIds.length}\n`);
  return {
    ok: true,
    summary,
    characters: mergedManifest,
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const result = await importPixelLabCharacters();
  if (!result.ok) {
    process.exitCode = 1;
  }
}
