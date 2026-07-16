import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [workerSource, mainSource] = await Promise.all([
  readFile(new URL("../worker/index.js", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8"),
]);
const constantMatch = workerSource.match(/const GAME_DOCUMENT_ROUTES = new Set\([^;]+;/s);
const helperMatch = workerSource.match(/function resolveGameDocumentRequest\(request, pathname\) \{[\s\S]*?\n\}/);
assert.ok(constantMatch && helperMatch);
const resolveGameDocumentRequest = Function(`
  ${constantMatch[0]}
  ${helperMatch[0]}
  return resolveGameDocumentRequest;
`)();

const opaqueRoom = "/sala/room_12345678";
assert.equal(resolveGameDocumentRequest(new Request(`https://example.test${opaqueRoom}`), opaqueRoom), null,
  "valid room deep links must fall through to the SPA asset handler");
assert.equal(resolveGameDocumentRequest(new Request("https://example.test/sala/bad"), "/sala/bad"), null,
  "invalid room IDs must never be rewritten to game.html");
assert.equal(mainSource.includes('|| /^\\/sala\\/[A-Za-z0-9_-]{8,128}$/.test(pathname);'), true,
  "the canonical bootstrap must explicitly recognize opaque room deep links");

console.log("continuous-room-route-document-check: ok");
