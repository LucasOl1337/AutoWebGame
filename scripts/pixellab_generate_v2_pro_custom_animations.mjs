import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const OUTPUT_ROOT = path.join(PROJECT_ROOT, "output", "pixellab-v2-pro");
const CHARACTER_ID = process.argv[2] ?? "5474c45c-2987-43e0-af2c-a6500c836881";
const IMAGE_SIZE = 64;
const DIRECTIONS = ["south", "east", "north", "west"];
const ACTIONS = [
  {
    slug: "walk",
    prompt: "walking in a determined combat stance",
  },
  {
    slug: "magic-attack",
    prompt: "casting a dark magic attack",
  },
  {
    slug: "ultimate",
    prompt: "unleashing an ultimate dark-energy blast",
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text);
}

async function downloadBase64Png(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while downloading ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString("base64");
}

function extractFrames(job) {
  const last = job?.last_response ?? {};
  if (Array.isArray(last.images)) {
    return last.images;
  }
  if (Array.isArray(last?.result?.images)) {
    return last.result.images;
  }
  if (Array.isArray(last?.data?.images)) {
    return last.data.images;
  }
  if (Array.isArray(job?.images)) {
    return job.images;
  }
  return null;
}

async function waitForJob(jobId, authHeader) {
  const headers = { Authorization: authHeader };
  for (;;) {
    const job = await fetchJson(`https://api.pixellab.ai/v2/background-jobs/${jobId}`, {
      headers,
    });

    if (job.status === "completed") {
      return job;
    }

    if (job.status === "failed") {
      throw new Error(`Background job ${jobId} failed: ${JSON.stringify(job.last_response ?? job)}`);
    }

    await sleep(10000);
  }
}

async function saveFrames(frames, dir) {
  await mkdir(dir, { recursive: true });
  for (let i = 0; i < frames.length; i += 1) {
    const frame = frames[i];
    const base64 = typeof frame === "string" ? frame : frame.base64;
    const filePath = path.join(dir, `frame-${String(i + 1).padStart(2, "0")}.png`);
    await writeFile(filePath, Buffer.from(base64, "base64"));
  }
}

async function main() {
  const authHeader = process.env.PIXELLAB_AUTH_HEADER;
  if (!authHeader) {
    throw new Error("PIXELLAB_AUTH_HEADER is not set");
  }

  const character = await fetchJson(
    `https://api.pixellab.ai/v2/characters/${CHARACTER_ID}`,
    { headers: { Authorization: authHeader } },
  );

  const characterSize = character.size ?? {};
  const referenceSize = {
    width: Number(characterSize.width ?? 116),
    height: Number(characterSize.height ?? 116),
  };

  const characterDir = path.join(OUTPUT_ROOT, CHARACTER_ID);
  await mkdir(characterDir, { recursive: true });

  const manifest = {
    characterId: CHARACTER_ID,
    characterName: character.name ?? null,
    frameCount: IMAGE_SIZE === 64 ? 16 : null,
    directions: DIRECTIONS,
    actions: [],
  };

  for (const action of ACTIONS) {
    console.log(`Action: ${action.slug}`);
    const actionDir = path.join(characterDir, action.slug);
    await mkdir(actionDir, { recursive: true });

    const actionRecord = {
      slug: action.slug,
      prompt: action.prompt,
      outputs: [],
    };

    const submissions = await Promise.all(
      DIRECTIONS.map(async (direction) => {
        console.log(`  ${direction}: preparing reference image`);
        const rotationUrl = character.rotation_urls?.[direction];
        if (!rotationUrl) {
          throw new Error(`Missing rotation URL for ${direction}`);
        }

        const referenceBase64 = await downloadBase64Png(rotationUrl);
        const payload = {
          reference_image: {
            type: "base64",
            base64: referenceBase64,
            format: "png",
          },
          reference_image_size: referenceSize,
          action: action.prompt,
          image_size: {
            width: IMAGE_SIZE,
            height: IMAGE_SIZE,
          },
          seed: 42,
          no_background: true,
          view: character.view ?? "low top-down",
          direction,
        };

        console.log(`  ${direction}: submitting v2 pro job`);
        const response = await fetchJson("https://api.pixellab.ai/v2/animate-with-text-v2", {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const jobId = response.background_job_id;
        if (!jobId) {
          throw new Error(`Missing background_job_id for ${action.slug} ${direction}`);
        }

        return {
          direction,
          jobId,
          usage: response.usage ?? null,
        };
      }),
    );

    const completed = await Promise.all(
      submissions.map(async ({ direction, jobId, usage }) => {
        console.log(`  ${direction}: waiting for job ${jobId}`);
        const job = await waitForJob(jobId, authHeader);
        const frames = extractFrames(job);
        if (!frames || frames.length === 0) {
          throw new Error(`Job ${jobId} completed without frames`);
        }

        const directionDir = path.join(actionDir, direction);
        await saveFrames(frames, directionDir);
        await writeFile(
          path.join(directionDir, "metadata.json"),
          JSON.stringify(
            {
              jobId,
              status: job.status,
              action: action.prompt,
              direction,
              frameCount: frames.length,
              referenceSize,
              imageSize: { width: IMAGE_SIZE, height: IMAGE_SIZE },
              usage: usage ?? job.usage ?? null,
            },
            null,
            2,
          ),
        );

        console.log(`  ${direction}: saved ${frames.length} frames`);
        return {
          direction,
          jobId,
          frameCount: frames.length,
          directory: path.relative(PROJECT_ROOT, directionDir),
        };
      }),
    );

    actionRecord.outputs.push(...completed);
    manifest.actions.push(actionRecord);
  }

  await writeFile(
    path.join(characterDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  console.log(`Done. Outputs saved under ${path.relative(PROJECT_ROOT, characterDir)}`);
}

await main();
