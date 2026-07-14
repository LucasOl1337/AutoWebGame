import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");
const sessionClient = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const asset = await readFile(new URL("../public/Assets/ui/arena-ignition-core.webp", import.meta.url));

assert.match(sessionClient, /ignitionCoreLeft\.src = "\/Assets\/ui\/arena-ignition-core\.webp"/);
assert.match(sessionClient, /replaceChildren\(canvas, ignitionCoreLeft, ignitionCoreRight\)/);
assert.match(css, /\.experience-match__ignition-core\s*\{[\s\S]*pointer-events:\s*none/s);
assert.match(css, /\.experience-screen--match canvas\s*\{\s*position:\s*relative;\s*z-index:\s*3;/s);
assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.experience-match__ignition-core\s*\{\s*display:\s*none;/s);
assert.equal(asset.subarray(0, 4).toString("ascii"), "RIFF");
assert.equal(asset.subarray(8, 12).toString("ascii"), "WEBP");
assert.ok(asset.byteLength <= 75_000, `arena emblem should stay lightweight, got ${asset.byteLength} bytes`);

console.log(JSON.stringify({
  pass: true,
  assetBytes: asset.byteLength,
  integration: "match viewport watermark behind gameplay canvas",
}));
