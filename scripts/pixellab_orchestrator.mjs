import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();
const DEFAULT_SPEC_PATH = path.join(PROJECT_ROOT, "configs", "pixellab-pack.v1.json");
const STATE_DIR = path.join(PROJECT_ROOT, "output", "pixellab-orchestrator");
const STATE_PATH = path.join(STATE_DIR, "state.json");
const REVIEW_DIR = path.join(STATE_DIR, "review");
const API_BASE = process.env.PIXELLAB_API_BASE ?? "https://api.pixellab.ai/v2";

const TERMINAL_STATUSES = new Set(["promoted", "rejected", "failed", "disabled"]);

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))];
}

function getArgValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1 || index === args.length - 1) {
    return fallback;
  }
  return args[index + 1];
}

function getByPath(source, dottedPath) {
  if (!dottedPath) {
    return undefined;
  }
  return dottedPath.split(".").reduce((current, segment) => {
    if (current === null || current === undefined) {
      return undefined;
    }
    return current[segment];
  }, source);
}

function collectFirstValue(source, paths = []) {
  for (const dottedPath of paths) {
    const value = getByPath(source, dottedPath);
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
}

function normalizeRemoteStatus(remote) {
  const rawStatus = String(
    collectFirstValue(remote, [
      "status",
      "result.status",
      "data.status",
      "object.status",
      "tile.status",
    ]) ?? "processing",
  ).toLowerCase();

  if (rawStatus === "completed" || rawStatus === "ready" || rawStatus === "success") {
    return "completed";
  }
  if (rawStatus === "failed" || rawStatus === "error") {
    return "failed";
  }
  return "processing";
}

async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function buildAssetState(specAsset) {
  return {
    key: specAsset.key,
    batch: specAsset.batch,
    kind: specAsset.kind,
    tool: specAsset.tool,
    status: specAsset.enabled === false ? "disabled" : "planned",
    attempts: 0,
    remoteId: null,
    lastSubmittedAt: null,
    lastPolledAt: null,
    nextActionAt: null,
    stagedOutputs: [],
    review: {
      status: "pending",
      reviewer: null,
      note: null,
      decidedAt: null,
    },
    error: null,
  };
}

export function createInitialState(spec) {
  return {
    specVersion: spec.version ?? "1.0",
    generatedAt: nowIso(),
    lastSubmitAt: null,
    lastPollAt: null,
    assets: spec.assets.map(buildAssetState),
    jobs: [],
    summary: {
      promoted: 0,
      reviewPending: 0,
      failed: 0,
      rejected: 0,
      planned: spec.assets.filter((asset) => asset.enabled !== false).length,
    },
  };
}

function summarizeAssets(assets) {
  return {
    promoted: assets.filter((asset) => asset.status === "promoted").length,
    reviewPending: assets.filter((asset) => asset.status === "review_pending").length,
    failed: assets.filter((asset) => asset.status === "failed").length,
    rejected: assets.filter((asset) => asset.status === "rejected").length,
    planned: assets.filter((asset) => asset.status === "planned").length,
  };
}

function getRetryDelayMs(spec, attempts) {
  const delays = spec.scheduler.retryDelaysMs ?? [30000, 60000, 120000, 300000];
  return delays[Math.min(Math.max(attempts - 1, 0), delays.length - 1)];
}

function isReadyForAction(asset, nowMs) {
  if (asset.nextActionAt === null) {
    return true;
  }
  return nowMs >= Date.parse(asset.nextActionAt);
}

function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

function resolveStatePath(specPath, explicitStatePath = null) {
  if (explicitStatePath) {
    return path.resolve(PROJECT_ROOT, explicitStatePath);
  }
  return path.resolve(path.dirname(specPath), "..", "output", "pixellab-orchestrator", "state.json");
}

async function loadSpec(specPath) {
  return readJson(specPath);
}

async function loadState(spec, statePath) {
  try {
    const state = await readJson(statePath);
    state.summary = summarizeAssets(state.assets);
    return state;
  } catch {
    return createInitialState(spec);
  }
}

async function saveState(statePath, state) {
  state.summary = summarizeAssets(state.assets);
  await writeJson(statePath, state);
}

function requireAuthHeader() {
  const authHeader = process.env.PIXELLAB_AUTH_HEADER;
  if (!authHeader) {
    throw new Error("PIXELLAB_AUTH_HEADER is required");
  }
  return authHeader;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} from ${url}: ${text.slice(0, 400)}`);
    error.status = response.status;
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
      const retryAfterSeconds = Number.parseInt(retryAfter, 10);
      if (Number.isFinite(retryAfterSeconds)) {
        error.retryAfterMs = retryAfterSeconds * 1000;
      }
    }
    throw error;
  }
  return text.length > 0 ? JSON.parse(text) : {};
}

async function fetchBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while downloading ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function resolveOutputValue(output, remotePayload, assetState) {
  for (const sourcePath of output.sourcePaths ?? []) {
    if (sourcePath === "$mcpMapObjectDownload") {
      return `https://api.pixellab.ai/mcp/map-objects/${assetState.remoteId}/download`;
    }
    const value = getByPath(remotePayload, sourcePath);
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
}

function resolveRemoteId(submitResponse, specAsset) {
  const configuredKeys = specAsset.responseIdKeys ?? [];
  const guessedKeys = [
    "id",
    "tile_id",
    "tileset_id",
    "object_id",
    "character_id",
    "result.id",
    "result.tile_id",
    "result.tileset_id",
    "result.object_id",
    "data.id",
    "data.tile_id",
    "data.object_id",
  ];
  const remoteId = collectFirstValue(submitResponse, uniqueStrings([...configuredKeys, ...guessedKeys]));
  if (!remoteId) {
    throw new Error(`Could not resolve remote id for asset ${specAsset.key}`);
  }
  return String(remoteId);
}

function buildSubmitBody(specAsset) {
  return specAsset.submit?.body ?? {};
}

function buildSubmitPath(specAsset) {
  return specAsset.submit?.path;
}

function buildPollPath(specAsset, remoteId) {
  return String(specAsset.poll?.pathTemplate ?? "").replace("{remoteId}", remoteId);
}

async function submitAsset(spec, state, assetState, specAsset) {
  const authHeader = requireAuthHeader();
  const submitPath = buildSubmitPath(specAsset);
  if (!submitPath) {
    throw new Error(`Asset ${specAsset.key} is missing submit.path`);
  }

  const submitResponse = await fetchJson(`${API_BASE}${submitPath}`, {
    method: specAsset.submit?.method ?? "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildSubmitBody(specAsset)),
  });

  const remoteId = resolveRemoteId(submitResponse, specAsset);
  assetState.remoteId = remoteId;
  assetState.status = "submitted";
  assetState.attempts += 1;
  assetState.lastSubmittedAt = nowIso();
  assetState.nextActionAt = new Date(Date.now() + (spec.scheduler.pollIntervalMs ?? 30000)).toISOString();
  assetState.error = null;
  state.lastSubmitAt = nowIso();
  state.jobs.push({
    assetKey: assetState.key,
    remoteId,
    submittedAt: assetState.lastSubmittedAt,
  });
}

async function stageOutputFromValue(value, stagePath) {
  await ensureDir(path.dirname(stagePath));
  if (typeof value !== "string") {
    throw new Error(`Unsupported output value for ${stagePath}`);
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    await writeFile(stagePath, await fetchBuffer(value));
    return;
  }
  const base64 = value.startsWith("data:") ? value.split(",").pop() ?? "" : value;
  await writeFile(stagePath, Buffer.from(base64, "base64"));
}

async function stageOutputs(specAsset, remotePayload, assetState) {
  const stageDir = path.join(REVIEW_DIR, assetState.key);
  await ensureDir(stageDir);
  const stagedOutputs = [];

  for (const output of specAsset.outputs ?? []) {
    const value = resolveOutputValue(output, remotePayload, assetState);
    if (!value) {
      return false;
    }

    const stagePath = path.join(stageDir, output.stageFileName ?? path.basename(output.targetPath));
    await stageOutputFromValue(value, stagePath);
    stagedOutputs.push({
      key: output.key,
      stagePath,
      targetPath: path.resolve(PROJECT_ROOT, output.targetPath),
    });
  }

  assetState.stagedOutputs = stagedOutputs;
  return true;
}

async function pollAsset(spec, state, assetState, specAsset) {
  const authHeader = requireAuthHeader();
  if (!assetState.remoteId) {
    throw new Error(`Asset ${assetState.key} has no remote id`);
  }
  const pollPath = buildPollPath(specAsset, assetState.remoteId);
  if (!pollPath) {
    throw new Error(`Asset ${assetState.key} is missing poll.pathTemplate`);
  }

  assetState.lastPolledAt = nowIso();
  state.lastPollAt = assetState.lastPolledAt;
  let remotePayload;
  try {
    remotePayload = await fetchJson(`${API_BASE}${pollPath}`, {
      headers: { Authorization: authHeader },
    });
  } catch (error) {
    if (error?.status === 423) {
      const retryAfterMs = Number.isFinite(error.retryAfterMs) ? error.retryAfterMs : (spec.scheduler.pollIntervalMs ?? 30000);
      assetState.status = "processing";
      assetState.nextActionAt = new Date(Date.now() + retryAfterMs).toISOString();
      return;
    }
    throw error;
  }

  const remoteStatus = normalizeRemoteStatus(remotePayload);
  if (remoteStatus === "processing") {
    assetState.status = "processing";
    assetState.nextActionAt = new Date(Date.now() + (spec.scheduler.pollIntervalMs ?? 30000)).toISOString();
    return;
  }

  if (remoteStatus === "failed") {
    throw new Error(`Remote job failed for ${assetState.key}`);
  }

  const outputsReady = await stageOutputs(specAsset, remotePayload, assetState);
  if (!outputsReady) {
    assetState.status = "processing";
    assetState.nextActionAt = new Date(Date.now() + (spec.scheduler.pollIntervalMs ?? 30000)).toISOString();
    return;
  }
  assetState.status = "review_pending";
  assetState.review.status = "pending";
  assetState.nextActionAt = null;
}

async function promoteApprovedAsset(assetState) {
  for (const output of assetState.stagedOutputs) {
    await ensureDir(path.dirname(output.targetPath));
    await copyFile(output.stagePath, output.targetPath);
  }
  assetState.status = "promoted";
  assetState.review.status = "approved";
}

function applyApprovalDecision(state, assetKey, decision, note = null, reviewer = "manual") {
  const asset = state.assets.find((item) => item.key === assetKey);
  if (!asset) {
    throw new Error(`Unknown asset ${assetKey}`);
  }
  if (asset.status !== "review_pending" && asset.status !== "approved") {
    throw new Error(`Asset ${assetKey} is not awaiting review`);
  }
  asset.review = {
    status: decision,
    reviewer,
    note,
    decidedAt: nowIso(),
  };
  if (decision === "rejected") {
    asset.status = "rejected";
  } else {
    asset.status = "approved";
  }
  return asset;
}

export { applyApprovalDecision };

function selectNextPlannedAsset(spec, state) {
  const batchOrder = new Map((spec.batches ?? []).map((batch, index) => [batch.key, index]));
  const nowMs = Date.now();
  return [...state.assets]
    .filter((asset) => asset.status === "planned" && isReadyForAction(asset, nowMs))
    .sort((a, b) => {
      const batchA = batchOrder.get(a.batch) ?? Number.MAX_SAFE_INTEGER;
      const batchB = batchOrder.get(b.batch) ?? Number.MAX_SAFE_INTEGER;
      if (batchA !== batchB) {
        return batchA - batchB;
      }
      return a.key.localeCompare(b.key);
    })[0] ?? null;
}

function findSpecAsset(spec, assetKey) {
  const asset = spec.assets.find((item) => item.key === assetKey);
  if (!asset) {
    throw new Error(`Asset ${assetKey} is missing from spec`);
  }
  return asset;
}

function canSubmit(spec, state) {
  if (!state.lastSubmitAt) {
    return true;
  }
  const spacingMs = spec.scheduler.submitSpacingMs ?? 20000;
  return Date.now() - Date.parse(state.lastSubmitAt) >= spacingMs;
}

async function runLoop(specPath, explicitStatePath = null) {
  const spec = await loadSpec(specPath);
  const statePath = resolveStatePath(specPath, explicitStatePath);
  const state = await loadState(spec, statePath);

  await ensureDir(REVIEW_DIR);

  for (;;) {
    let mutated = false;
    const nowMs = Date.now();

    for (const asset of state.assets) {
      if (asset.status === "approved") {
        await promoteApprovedAsset(asset);
        mutated = true;
      }
    }

    for (const asset of state.assets) {
      if (!["submitted", "processing"].includes(asset.status)) {
        continue;
      }
      if (!isReadyForAction(asset, nowMs)) {
        continue;
      }
      const specAsset = findSpecAsset(spec, asset.key);
      try {
        await pollAsset(spec, state, asset, specAsset);
        mutated = true;
      } catch (error) {
        const attemptsExhausted = asset.attempts >= (spec.scheduler.maxRetries ?? 3);
        asset.error = error instanceof Error ? error.message : String(error);
        asset.nextActionAt = new Date(Date.now() + getRetryDelayMs(spec, asset.attempts || 1)).toISOString();
        if (attemptsExhausted) {
          asset.status = "failed";
        }
        mutated = true;
      }
    }

    const nextAsset = selectNextPlannedAsset(spec, state);
    if (nextAsset && canSubmit(spec, state)) {
      const specAsset = findSpecAsset(spec, nextAsset.key);
      try {
        await submitAsset(spec, state, nextAsset, specAsset);
      } catch (error) {
        nextAsset.attempts += 1;
        nextAsset.error = error instanceof Error ? error.message : String(error);
        if (nextAsset.attempts >= (spec.scheduler.maxRetries ?? 3)) {
          nextAsset.status = "failed";
        } else {
          nextAsset.nextActionAt = new Date(Date.now() + getRetryDelayMs(spec, nextAsset.attempts)).toISOString();
        }
      }
      mutated = true;
    }

    if (mutated) {
      await saveState(statePath, state);
    }

    const allTerminal = state.assets.every((asset) => isTerminalStatus(asset.status));
    if (allTerminal) {
      break;
    }

    await sleep(spec.scheduler.pollIntervalMs ?? 30000);
  }
}

async function printStatus(specPath, explicitStatePath = null) {
  const spec = await loadSpec(specPath);
  const statePath = resolveStatePath(specPath, explicitStatePath);
  const state = await loadState(spec, statePath);
  process.stdout.write(`${JSON.stringify({
    summary: summarizeAssets(state.assets),
    assets: state.assets.map((asset) => ({
      key: asset.key,
      status: asset.status,
      remoteId: asset.remoteId,
      attempts: asset.attempts,
      review: asset.review,
      error: asset.error,
    })),
  }, null, 2)}\n`);
}

async function approveAsset(specPath, args, explicitStatePath = null) {
  const spec = await loadSpec(specPath);
  const statePath = resolveStatePath(specPath, explicitStatePath);
  const state = await loadState(spec, statePath);
  const assetKey = getArgValue(args, "--asset");
  if (!assetKey) {
    throw new Error("--asset is required");
  }
  const note = getArgValue(args, "--note");
  applyApprovalDecision(state, assetKey, "approved", note);
  await saveState(statePath, state);
}

async function rejectAsset(specPath, args, explicitStatePath = null) {
  const spec = await loadSpec(specPath);
  const statePath = resolveStatePath(specPath, explicitStatePath);
  const state = await loadState(spec, statePath);
  const assetKey = getArgValue(args, "--asset");
  if (!assetKey) {
    throw new Error("--asset is required");
  }
  const note = getArgValue(args, "--note");
  applyApprovalDecision(state, assetKey, "rejected", note);
  await saveState(statePath, state);
}

export async function main(argv = process.argv.slice(2)) {
  const command = argv[0] ?? "run";
  const specPath = path.resolve(PROJECT_ROOT, getArgValue(argv, "--spec", DEFAULT_SPEC_PATH));
  const statePath = getArgValue(argv, "--state");

  if (command === "run") {
    await runLoop(specPath, statePath);
    return;
  }
  if (command === "status") {
    await printStatus(specPath, statePath);
    return;
  }
  if (command === "approve") {
    await approveAsset(specPath, argv, statePath);
    return;
  }
  if (command === "reject") {
    await rejectAsset(specPath, argv, statePath);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  await main();
}
