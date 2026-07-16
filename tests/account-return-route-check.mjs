import assert from "node:assert/strict";

import { resolveAccountReturnPath } from "../output/esm/Auth/account-return.js";

assert.equal(resolveAccountReturnPath("?return=%2Flaboratorio"), "/laboratorio");
assert.equal(resolveAccountReturnPath("?return=%2F"), "/");
assert.equal(resolveAccountReturnPath("?return=https%3A%2F%2Fevil.example"), null);
assert.equal(resolveAccountReturnPath("?return=%2Fadmin"), null);
assert.equal(resolveAccountReturnPath("?return=%2F%2Fevil.example"), null);
assert.equal(resolveAccountReturnPath(""), null);

console.log("account return route allowlist: ok");
