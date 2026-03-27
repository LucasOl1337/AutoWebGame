import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const OUTPUT_ROOT = path.join(PROJECT_ROOT, "output", "pixellab-v3");
const CHAR_ID = process.argv[2] ?? "5474c45c-2987-43e0-af2c-a6500c836881";
const FRAME_COUNT = Number.parseInt(process.env.PIXELLAB_FRAME_COUNT ?? "16", 10);
const SEED = process.env.PIXELLAB_SEED ? Number.parseInt(process.env.PIXELLAB_SEED, 10) : 42;
const DIRECTIONS = ["south", "east", "north", "west"];

const DEFAULT_ACTIONS = [
  { slug: "walk", prompt: "walking forward in a determined combat-ready stance" },
  { slug: "magic-attack", prompt: "casting a dark magic attack with sharp hand motions" },
  { slug: "ultimate", prompt: "charging and unleashing a dark-energy ultimate blast" },
];

function parseActions() {
  const raw = process.env.PIXELLAB_ACTIONS_JSON;
  if (!raw) {
    return DEFAULT_ACTIONS;
  }

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("PIXELLAB_ACTIONS_JSON must be a non-empty JSON array");
  }

  return parsed.map((entry, index) => {
    if (typeof entry === "string") {
      return { slug: `action-${index + 1}`, prompt: entry };
    }

    if (!entry || typeof entry !== "object") {
      throw new Error("Each action must be a string or an object with slug and prompt");
    }

    const slug = typeof entry.slug === "string" && entry.slug.trim() ? entry.slug.trim() : `action-${index + 1}`;
    const prompt = typeof entry.prompt === "string" && entry.prompt.trim() ? entry.prompt.trim() : null;
    if (!prompt) {
      throw new Error(`Action ${slug} is missing a prompt`);
    }
    return { slug, prompt };
  });
}

function ensureBase64(value) {
  if (typeof value === "string") {
    return value.startsWith("data:") ? value.split(",").pop() : value;
  }

  if (value && typeof value === "object") {
    if (typeof value.base64 === "string") {
      return value.base64.startsWith("data:") ? value.base64.split(",").pop() : value.base64;
    }

    if (typeof value.data === "string") {
      return value.data.startsWith("data:") ? value.data.split(",").pop() : value.data;
    }
  }

  throw new Error("Unexpected frame payload format");
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text);
}

async function downloadImageBase64(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while downloading ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const raw = buffer.toString("base64");
  if (process.env.PIXELLAB_BASE64_URL === "1") {
    return `data:image/png;base64,${raw}`;
  }
  return raw;
}

function flattenOnWhite(base64) {
  if (process.env.PIXELLAB_FLATTEN_BG !== "1") {
    return base64;
  }

  const pythonCode = [
    "import base64, io, sys",
    "from PIL import Image",
    "raw = base64.b64decode(sys.argv[1])",
    "img = Image.open(io.BytesIO(raw)).convert('RGBA')",
    "bg = Image.new('RGBA', img.size, (255, 255, 255, 255))",
    "out = Image.alpha_composite(bg, img).convert('RGBA')",
    "buf = io.BytesIO()",
    "out.save(buf, format='PNG')",
    "sys.stdout.buffer.write(buf.getvalue())",
  ].join("; ");

  const flattened = execFileSync("python", ["-c", pythonCode, base64], {
    maxBuffer: 20 * 1024 * 1024,
  });
  return flattened.toString("base64");
}

async function saveFrames(frames, targetDir) {
  await mkdir(targetDir, { recursive: true });
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    const frameBase64 = ensureBase64(frame);
    const filePath = path.join(targetDir, `frame-${String(i + 1).padStart(2, "0")}.png`);
    await writeFile(filePath, Buffer.from(frameBase64, "base64"));
  }
}

async function main() {
  const authHeader = process.env.PIXELLAB_AUTH_HEADER;
  if (!authHeader) {
    throw new Error("PIXELLAB_AUTH_HEADER is not set");
  }
  if (!Number.isInteger(FRAME_COUNT) || FRAME_COUNT < 4 || FRAME_COUNT > 16 || FRAME_COUNT % 2 !== 0) {
    throw new Error("PIXELLAB_FRAME_COUNT must be an even integer between 4 and 16");
  }

  const headers = {
    Authorization: authHeader,
    "Content-Type": "application/json",
  };

  const character = await fetchJson(
    `https://api.pixellab.ai/v2/characters/${CHAR_ID}`,
    { headers: { Authorization: authHeader } },
  );

  const rotations = character.rotation_urls ?? {};
  const characterDir = path.join(OUTPUT_ROOT, CHAR_ID);
  await mkdir(characterDir, { recursive: true });
  const actions = parseActions();

  const manifest = {
    characterId: CHAR_ID,
    characterName: character.name ?? null,
    frameCount: FRAME_COUNT,
    directions: DIRECTIONS,
    actions: [],
  };

  for (const action of actions) {
    console.log(`Action: ${action.slug}`);
    const actionDir = path.join(characterDir, action.slug);
    await mkdir(actionDir, { recursive: true });

    const actionRecord = {
      slug: action.slug,
      prompt: action.prompt,
      outputs: [],
    };

    for (const direction of DIRECTIONS) {
      const rotationUrl = rotations[direction];
      if (!rotationUrl) {
        throw new Error(`Missing rotation for ${direction}`);
      }

      console.log(`  ${direction}: downloading first frame`);
      const base64 = flattenOnWhite(await downloadImageBase64(rotationUrl));

      console.log(`  ${direction}: generating 16-frame v3 Pro animation`);
      const body = {
        first_frame: {
          type: "base64",
          base64,
          format: "png",
        },
        action: action.prompt,
        frame_count: FRAME_COUNT,
        ...(Number.isInteger(SEED) ? { seed: SEED } : {}),
      };

      const result = await fetchJson(
        "https://api.pixellab.ai/v2/animate-with-text-v3",
        {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        },
      );

      const directionDir = path.join(actionDir, direction);
      await saveFrames(result.images ?? [], directionDir);

      const usage = result.usage ?? null;
      const frameCount = Array.isArray(result.images) ? result.images.length : 0;
      await writeFile(
        path.join(directionDir, "metadata.json"),
        JSON.stringify(
          {
            characterId: CHAR_ID,
            action: action.prompt,
            direction,
            frameCount,
            usage,
          },
          null,
          2,
        ),
      );

      actionRecord.outputs.push({
        direction,
        frameCount,
        directory: path.relative(PROJECT_ROOT, directionDir),
        usage,
      });

      console.log(`  ${direction}: saved ${frameCount} frames`);
    }

    manifest.actions.push(actionRecord);
  }

  await writeFile(
    path.join(characterDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  console.log(`Done. Outputs saved under ${path.relative(PROJECT_ROOT, characterDir)}`);
}

await main();
