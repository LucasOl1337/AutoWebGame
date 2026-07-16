import assert from "node:assert/strict";

const workerContract = await import("../output/esm/Arenas/canonical-arena-worker.js");
const expectedHash = "sha256:21711287367572f02d0766520f46d62005bd5eafb563cd0504840f45f21008fe";

const response = await workerContract.createCanonicalArenaCatalogResponse("cidadela-arcana", "r1");
assert.equal(response.status, 200);
assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
assert.equal(response.headers.get("etag"), `"${expectedHash}"`);
const payload = await response.json();
assert.equal(payload.map.contentHash, expectedHash);
assert.equal(payload.map.revision, "r1");

const notModified = await workerContract.createCanonicalArenaCatalogResponse(
  "cidadela-arcana",
  "r1",
  `"${expectedHash}"`,
);
assert.equal(notModified.status, 304);
assert.equal(notModified.headers.get("etag"), `"${expectedHash}"`);
assert.equal(await notModified.text(), "");
for (const validator of [`W/"${expectedHash}"`, "*"]) {
  const conditional = await workerContract.createCanonicalArenaCatalogResponse("cidadela-arcana", "r1", validator);
  assert.equal(conditional.status, 304);
}

const absent = await workerContract.createCanonicalArenaCatalogResponse("cidadela-arcana", "r2");
assert.equal(absent.status, 404);
assert.deepEqual(await absent.json(), { error: "arena_map_not_published" });

console.log(JSON.stringify({ pass: true, status: response.status, conditionalStatus: notModified.status, hash: payload.map.contentHash }, null, 2));
