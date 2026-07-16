import {
  getPublishedArenaMap,
  listPublishedArenaMaps,
  verifyPublishedArenaMap,
} from "./canonical-arena-catalog";

export async function createCanonicalArenaCatalogResponse(
  id: string,
  revision: string,
  ifNoneMatch: string | null = null,
): Promise<Response> {
  const ref = listPublishedArenaMaps().find((candidate) => candidate.id === id && candidate.revision === revision);
  if (!ref) return Response.json({ error: "arena_map_not_published" }, { status: 404, headers: { "cache-control": "no-store" } });
  const map = getPublishedArenaMap(ref);
  const verification = await verifyPublishedArenaMap(map);
  if (!verification.ok) {
    return Response.json(
      { error: "arena_map_publication_invalid", issues: verification.issues.map((issue) => issue.code) },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  const etag = `"${map.contentHash}"`;
  if (matchesIfNoneMatch(ifNoneMatch, etag)) {
    return new Response(null, {
      status: 304,
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        etag,
        "x-arena-map-ref": `${map.id}@${map.revision}`,
      },
    });
  }
  return Response.json(
    { map },
    {
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
        etag,
        "x-arena-map-ref": `${map.id}@${map.revision}`,
      },
    },
  );
}

function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (!header) return false;
  const normalizedEtag = etag.replace(/^W\//, "");
  return header.split(",").some((candidate) => {
    const value = candidate.trim();
    return value === "*" || value.replace(/^W\//, "") === normalizedEtag;
  });
}
