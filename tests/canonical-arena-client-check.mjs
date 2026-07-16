import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = await import("../output/esm/Arenas/canonical-arena-catalog.js");
const client = await import("../output/esm/Arenas/canonical-arena-client.js");
const map = catalog.getCanonicalArenaMap();
const assetRoot = new URL("../public/Assets/TileMaps/canonical/cidadela-arcana/r1/", import.meta.url);
const assets = new Map([
  [map.assets.atlas.path, await readFile(new URL("tile-atlas.svg", assetRoot))],
  [map.assets.thumbnail.path, await readFile(new URL("thumbnail.svg", assetRoot))],
]);

function fetcher(remoteMap, overrides = new Map()) {
  return async (input) => {
    const path = typeof input === "string" ? input : input.url;
    if (path === "/api/arena/catalog/cidadela-arcana/r1") {
      return Response.json({ map: remoteMap }, { headers: { etag: `"${remoteMap.contentHash}"` } });
    }
    const bytes = overrides.get(path) ?? assets.get(path);
    return bytes ? new Response(bytes) : new Response("missing", { status: 404 });
  };
}

const ready = await client.preloadCanonicalArenaMap({ fetch: fetcher(map) });
assert.equal(ready.status, "ready");
assert.deepEqual(ready.ref, catalog.listPublishedArenaMaps()[0]);
assert.equal(ready.arena.version, `r1@${map.contentHash}`);
assert.deepEqual(ready.preloadedAssets, [map.assets.atlas.path, map.assets.thumbnail.path]);
assert.equal(ready.renderMode, "assets");
assert.equal(ready.fallback, null);
assert.deepEqual(ready.assetWarnings, []);
assert.equal(ready.previewSource, map.assets.thumbnail.path);

const tamperedMap = structuredClone(map);
tamperedMap.layout.breakable.pop();
const incompatible = await client.preloadCanonicalArenaMap({ fetch: fetcher(tamperedMap) });
assert.equal(incompatible.status, "incompatible");
assert.match(incompatible.error, /hash|content/i);
assert.equal("arena" in incompatible, false);

const corruptAtlas = new Map([[map.assets.atlas.path, Buffer.from("corrupt")]]);
const corruptAsset = await client.preloadCanonicalArenaMap({ fetch: fetcher(map, corruptAtlas) });
assert.equal(corruptAsset.status, "ready");
assert.equal(corruptAsset.arena.version, `r1@${map.contentHash}`);
assert.equal(corruptAsset.renderMode, "procedural");
assert.deepEqual(corruptAsset.fallback, map.assets.fallback);
assert.match(corruptAsset.assetWarnings.join("\n"), /asset.*hash/i);
assert.match(corruptAsset.previewSource, /^data:image\/svg\+xml;charset=utf-8,/);
assert.doesNotMatch(decodeURIComponent(corruptAsset.previewSource), /corrupt/);

const unavailable = await client.preloadCanonicalArenaMap({
  fetch: async () => new Response("offline", { status: 503 }),
});
assert.equal(unavailable.status, "unavailable");
assert.equal("arena" in unavailable, false);

const originalFetch = globalThis.fetch;
let memoFetches = 0;
globalThis.fetch = async (input, init) => {
  memoFetches += 1;
  if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
  return fetcher(map)(input);
};
try {
  const aborted = new AbortController();
  aborted.abort();
  const cancelled = await client.preloadCanonicalArenaMap({ signal: aborted.signal });
  assert.equal(cancelled.status, "unavailable");
  const firstMemoized = await client.preloadCanonicalArenaMap();
  assert.equal(firstMemoized.status, "ready");
  const fetchesAfterReady = memoFetches;
  const secondMemoized = await client.preloadCanonicalArenaMap();
  assert.equal(secondMemoized, firstMemoized);
  assert.equal(memoFetches, fetchesAfterReady);
  assert.equal(fetchesAfterReady, 3);
  const abortedAfterMemo = new AbortController();
  abortedAfterMemo.abort();
  const cancelledAfterMemo = await client.preloadCanonicalArenaMap({ signal: abortedAfterMemo.signal });
  assert.equal(cancelledAfterMemo.status, "unavailable");
  assert.equal(memoFetches, fetchesAfterReady);
} finally {
  globalThis.fetch = originalFetch;
}

console.log(JSON.stringify({
  pass: true,
  ready: ready.ref,
  failClosedGeometry: [incompatible.status, unavailable.status],
  cosmeticFallback: corruptAsset.renderMode,
}, null, 2));
