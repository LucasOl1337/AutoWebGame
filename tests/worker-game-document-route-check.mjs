import { readFile } from "node:fs/promises";

const workerSource = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");

const constantMatch = workerSource.match(/const GAME_DOCUMENT_ROUTES = new Set\([^;]+;/s);
const helperMatch = workerSource.match(/function resolveGameDocumentRequest\(request, pathname\) \{[\s\S]*?\n\}/);

if (!constantMatch || !helperMatch) {
  console.error("Could not find game document route helper in worker/index.js");
  process.exit(1);
}

const resolveGameDocumentRequest = Function(`
  ${constantMatch[0]}
  ${helperMatch[0]}
  return resolveGameDocumentRequest;
`)();

const cases = [
  ["GET", "/game/play", "/game"],
  ["GET", "/game/training", "/game"],
  ["GET", "/game/lab", "/game"],
  ["HEAD", "/game/play", "/game"],
  ["POST", "/game/play", null],
  ["GET", "/api/me", null],
  ["GET", "/online", null],
  ["GET", "/Assets/main-12345678.js", null],
];

const results = cases.map(([method, pathname, expectedPath]) => {
  const request = new Request(`https://example.com${pathname}?mode=test`, { method });
  const resolved = resolveGameDocumentRequest(request, pathname);
  return {
    method,
    pathname,
    expectedPath,
    actualPath: resolved ? new URL(resolved.url).pathname : null,
    actualSearch: resolved ? new URL(resolved.url).search : null,
  };
});

const failed = results.filter((result) =>
  result.actualPath !== result.expectedPath ||
  (result.expectedPath && result.actualSearch !== "?mode=test")
);

console.log(JSON.stringify({ pass: failed.length === 0, checkedContracts: results.length, failed }, null, 2));
if (failed.length) process.exit(1);
