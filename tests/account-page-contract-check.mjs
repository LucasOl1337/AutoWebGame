import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { resolveFrontendRoute, routeHref } from "../output/esm/UiLayouts/frontend-router.js";

assert.equal(resolveFrontendRoute("/account"), "account");
assert.equal(resolveFrontendRoute("/account/"), "account");
assert.equal(routeHref("account"), "/account");

const pageSource = await readFile(new URL("../src/Auth/account-page.ts", import.meta.url), "utf8");
for (const contract of [
  'fetch("/api/auth/session"',
  '"/api/auth/register"',
  '"/api/auth/login"',
  'fetch("/api/auth/logout"',
  'account.role === "admin"',
  'window.location.assign("/admin")',
]) {
  assert.ok(pageSource.includes(contract), `missing account-page contract: ${contract}`);
}

console.log("account page and route contract: ok");
