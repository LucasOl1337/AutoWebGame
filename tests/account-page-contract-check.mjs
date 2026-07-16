import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { resolveFrontendRoute, routeHref } from "../output/esm/UiLayouts/frontend-router.js";

assert.equal(resolveFrontendRoute("/account"), "account");
assert.equal(resolveFrontendRoute("/account/"), "account");
assert.equal(routeHref("account"), "/account");

const pageSource = await readFile(new URL("../src/Auth/account-page.ts", import.meta.url), "utf8");
const viewSource = await readFile(new URL("../src/FrontendKernel/canonical-launcher-view.ts", import.meta.url), "utf8");
const kernelSource = await readFile(new URL("../src/FrontendKernel/frontend-kernel.ts", import.meta.url), "utf8");
for (const contract of [
  'fetch("/api/auth/session"',
  '"/api/auth/register"',
  '"/api/auth/login"',
  'fetch("/api/auth/logout"',
  'account.role === "admin"',
  'window.location.assign("/admin")',
  "resolveAccountReturnPath(window.location.search)",
  "window.location.assign(returnPath)",
]) {
  assert.ok(pageSource.includes(contract), `missing account-page contract: ${contract}`);
}
assert.ok(viewSource.includes('auxiliary: "account"'), "Launcher must expose Conta as a secondary Intent");
assert.ok(viewSource.includes('data-intent="open-account-access"'), "Conta must expose the existing auth surface");
assert.ok(kernelSource.includes('window.location.assign(`/account?return='), "account access must delegate to the existing auth route");

console.log("account page and route contract: ok");
