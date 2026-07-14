import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const router = readFileSync(new URL("../src/UiLayouts/frontend-router.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../src/UiLayouts/frontend-store.ts", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/UiLayouts/launcher-shell.ts", import.meta.url), "utf8");
const main = readFileSync(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8");
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");

assert.match(router, /"\/game\/play"/);
assert.match(router, /"\/game\/training"/);
assert.match(router, /"\/game\/lab"/);
assert.match(router, /window\.history\.pushState/);
assert.match(store, /export class FrontendStore/);
assert.match(store, /subscribe\(listener/);
assert.match(shell, /class LauncherShell/);
assert.match(shell, /data-route=/);
assert.match(shell, /SA-EAST · ONLINE/);
assert.match(main, /if \(route === "launcher"\)/);
assert.match(main, /bootGameOnce/);
assert.match(main, /new GameApp/);
assert.match(main, /new OnlineSessionClient/);
assert.match(wrangler, /"not_found_handling": "single-page-application"/);
assert.match(wrangler, /"run_worker_first": true/);
console.log("frontend architecture and SPA fallback contract: ok");
