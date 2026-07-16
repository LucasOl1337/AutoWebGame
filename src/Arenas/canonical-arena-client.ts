import type { ArenaDefinition } from "../Gameplay/types";
import {
  getPublishedArenaMap,
  deriveArenaMapThumbnailSvg,
  listPublishedArenaMaps,
  toArenaDefinition,
  verifyPublishedArenaMap,
  type ArenaMapContentHash,
  type ArenaMapRef,
  type PublishedArenaMap,
} from "./canonical-arena-catalog";

export type CanonicalArenaPreloadResult = Readonly<
  | {
      status: "ready";
      ref: ArenaMapRef;
      map: PublishedArenaMap;
      arena: ArenaDefinition;
      preloadedAssets: readonly string[];
      renderMode: "assets" | "procedural";
      fallback: PublishedArenaMap["assets"]["fallback"] | null;
      assetWarnings: readonly string[];
      previewSource: string;
    }
  | {
      status: "incompatible" | "unavailable";
      ref: ArenaMapRef;
      error: string;
    }
>;

export interface CanonicalArenaPreloadDependencies {
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
}

const memoizedReadyByRef = new Map<string, Extract<CanonicalArenaPreloadResult, { status: "ready" }>>();

export async function preloadCanonicalArenaMap(
  dependencies: CanonicalArenaPreloadDependencies = {},
): Promise<CanonicalArenaPreloadResult> {
  const ref = listPublishedArenaMaps()[0];
  if (dependencies.signal?.aborted) return unavailable(ref, "Arena preload was cancelled");
  const cacheKey = `${ref.id}@${ref.revision}@${ref.contentHash}`;
  const memoizedReady = memoizedReadyByRef.get(cacheKey);
  if (!dependencies.fetch && memoizedReady) return memoizedReady;
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  if (!fetcher) return unavailable(ref, "Fetch is unavailable in this runtime");

  try {
    const response = await fetcher(`/api/arena/catalog/${encodeURIComponent(ref.id)}/${encodeURIComponent(ref.revision)}`, {
      cache: "default",
      credentials: "same-origin",
      signal: dependencies.signal,
    });
    if (!response.ok) return unavailable(ref, `Catalog endpoint returned HTTP ${response.status}`);
    const payload = await response.json() as { map?: unknown };
    const verification = await verifyPublishedArenaMap(payload?.map);
    if (!verification.ok || !isPublishedArenaMap(payload?.map)) {
      return incompatible(ref, `Arena map content failed verification: ${verification.issues.map((issue) => issue.code).join(",")}`);
    }
    const map = payload.map;
    let local: PublishedArenaMap;
    try {
      local = getPublishedArenaMap(map);
    } catch (error) {
      return incompatible(ref, safeError(error));
    }
    let arena: ArenaDefinition;
    try {
      arena = toArenaDefinition(map);
    } catch (error) {
      return incompatible(ref, safeError(error));
    }
    if (local.contentHash !== map.contentHash) {
      return incompatible(ref, "Arena map hash differs from the client catalog");
    }

    const assetContracts = [map.assets.atlas, map.assets.thumbnail] as const;
    const preloadedAssets: string[] = [];
    const assetWarnings: string[] = [];
    for (const asset of assetContracts) {
      try {
        const assetResponse = await fetcher(asset.path, {
          cache: "force-cache",
          credentials: "same-origin",
          signal: dependencies.signal,
        });
        if (!assetResponse.ok) {
          assetWarnings.push(`Arena asset ${asset.path} returned HTTP ${assetResponse.status}`);
          continue;
        }
        const bytes = await assetResponse.arrayBuffer();
        const actualHash = await sha256(bytes);
        if (actualHash !== asset.sha256) {
          assetWarnings.push(`Arena asset hash mismatch for ${asset.path}`);
          continue;
        }
        preloadedAssets.push(asset.path);
      } catch (error) {
        if (isAbortError(error)) throw error;
        assetWarnings.push(`Arena asset ${asset.path} failed: ${safeError(error)}`);
      }
    }

    const ready = deepFreeze({
      status: "ready",
      ref: { ...ref },
      map,
      arena,
      preloadedAssets,
      renderMode: assetWarnings.length === 0 ? "assets" : "procedural",
      fallback: assetWarnings.length === 0 ? null : map.assets.fallback,
      assetWarnings,
      previewSource: assetWarnings.length === 0
        ? map.assets.thumbnail.path
        : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(deriveArenaMapThumbnailSvg(map))}`,
    } as const);
    if (!dependencies.fetch && ready.renderMode === "assets") memoizedReadyByRef.set(cacheKey, ready);
    return ready;
  } catch (error) {
    if (isAbortError(error)) return unavailable(ref, "Arena preload was cancelled");
    return unavailable(ref, safeError(error));
  }
}

function isPublishedArenaMap(value: unknown): value is PublishedArenaMap {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && "id" in value && "revision" in value && "contentHash" in value
    && "layout" in value && "assets" in value;
}

async function sha256(value: ArrayBuffer): Promise<ArenaMapContentHash> {
  if (!globalThis.crypto?.subtle) throw new Error("SHA-256 is unavailable in this runtime");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", value);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function incompatible(ref: ArenaMapRef, error: string): CanonicalArenaPreloadResult {
  return deepFreeze({ status: "incompatible", ref: { ...ref }, error });
}

function unavailable(ref: ArenaMapRef, error: string): CanonicalArenaPreloadResult {
  return deepFreeze({ status: "unavailable", ref: { ...ref }, error });
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value as object)) return value;
  seen.add(value as object);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
