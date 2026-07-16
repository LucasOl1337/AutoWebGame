import assert from "node:assert/strict";

import {
  BrowserIdentityAdapter,
  DEFAULT_TEMPORARY_NICK,
  TEMPORARY_NICK_STORAGE_KEY,
} from "../output/esm/FrontendKernel/identity-adapter.js";

const requests = [];
const values = new Map();
const storage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, value); },
};

const visitor = new BrowserIdentityAdapter(async (input, init) => {
  requests.push({ input, init });
  return Response.json({ account: null });
}, storage);
assert.equal(await visitor.load(new AbortController().signal), null);
assert.equal(requests[0].input, "/api/auth/session");
assert.equal(requests[0].init.method, "GET");
assert.equal(requests[0].init.credentials, "same-origin");
assert.equal(requests[0].init.cache, "no-store");

assert.equal(visitor.readTemporaryNick(), DEFAULT_TEMPORARY_NICK);
visitor.writeTemporaryNick("Fagulha");
assert.equal(values.get(TEMPORARY_NICK_STORAGE_KEY), "Fagulha");
assert.equal(visitor.readTemporaryNick(), "Fagulha");

const authenticated = new BrowserIdentityAdapter(
  async () => Response.json({
    account: {
      id: "account-7",
      username: "nara",
      displayName: "Nara",
      authLevel: "email",
    },
  }),
  storage,
);
assert.deepEqual(await authenticated.load(new AbortController().signal), {
  id: "account-7",
  username: "nara",
  displayName: "Nara",
  authLevel: "email",
});

const quickAccount = new BrowserIdentityAdapter(
  async () => Response.json({
    account: {
      id: "quick-2",
      username: "bento",
      displayName: "Bento",
      authLevel: "username",
    },
  }),
  storage,
);
assert.equal(
  await quickAccount.load(new AbortController().signal),
  null,
  "a quick username is not enough to cross the authenticated Lab gate",
);

const malformed = new BrowserIdentityAdapter(
  async () => Response.json({ account: { authLevel: "email", username: "ivo" } }),
  storage,
);
await assert.rejects(
  () => malformed.load(new AbortController().signal),
  /missing authenticated account fields/,
  "malformed auth responses fail closed",
);

const unavailable = new BrowserIdentityAdapter(
  async () => new Response("offline", { status: 503 }),
  storage,
);
await assert.rejects(
  () => unavailable.load(new AbortController().signal),
  /503/,
);

const deniedStorage = new BrowserIdentityAdapter(
  async () => Response.json({ account: null }),
  {
    getItem() { throw new DOMException("Denied", "SecurityError"); },
    setItem() { throw new DOMException("Denied", "SecurityError"); },
  },
);
assert.equal(deniedStorage.readTemporaryNick(), DEFAULT_TEMPORARY_NICK);
assert.doesNotThrow(() => deniedStorage.writeTemporaryNick("Luma"));

console.log("frontend identity real and in-memory seam contract: ok");
