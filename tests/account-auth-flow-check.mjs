import assert from "node:assert/strict";

import { AccountAuth } from "../output/esm/Auth/account-auth.js";

class MemoryAuthStorage {
  constructor() {
    this.values = new Map();
  }

  async get(key) {
    return this.values.get(key);
  }

  async put(key, value) {
    this.values.set(key, structuredClone(value));
  }

  async delete(key) {
    return this.values.delete(key);
  }
}

const storage = new MemoryAuthStorage();
let now = 1_700_000_000_000;
const auth = new AccountAuth(storage, {
  now: () => now,
  bootstrapAdmin: {
    email: "admin@example.com",
    password: "segredo-admin-forte-2026",
  },
});

const registered = await auth.register({
  username: "Jogador_1",
  email: "jogador@example.com",
  password: "segredo-jogador-2026",
});
assert.equal(registered.ok, true);
assert.equal(registered.status, 201);
assert.equal(registered.account.role, "user");
assert.equal(registered.account.email, "jogador@example.com");
assert.match(registered.session.id, /^sess_/);

const current = await auth.current(registered.session.id);
assert.deepEqual(current, registered.account);

const duplicateEmail = await auth.register({
  username: "Jogador_2",
  email: "JOGADOR@example.com",
  password: "outro-segredo-forte-2026",
});
assert.equal(duplicateEmail.ok, false);
assert.equal(duplicateEmail.status, 409);
assert.equal(duplicateEmail.code, "email-unavailable");

const wrongPassword = await auth.login({
  email: "jogador@example.com",
  password: "senha-incorreta-2026",
  clientAddress: "203.0.113.10",
});
assert.equal(wrongPassword.ok, false);
assert.equal(wrongPassword.status, 401);
assert.equal(wrongPassword.code, "invalid-credentials");

now += 1_000;
const loggedIn = await auth.login({
  email: "jogador@example.com",
  password: "segredo-jogador-2026",
  clientAddress: "203.0.113.10",
});
assert.equal(loggedIn.ok, true);
assert.equal(loggedIn.account.id, registered.account.id);
assert.notEqual(loggedIn.session.id, registered.session.id);

const admin = await auth.login({
  email: "admin@example.com",
  password: "segredo-admin-forte-2026",
  clientAddress: "203.0.113.11",
});
assert.equal(admin.ok, true);
assert.equal(admin.account.role, "admin");
assert.equal(admin.account.email, "admin@example.com");
assert.equal((await auth.current(admin.session.id))?.role, "admin");

const rotatedAdminAuth = new AccountAuth(storage, {
  now: () => now,
  bootstrapAdmin: {
    email: "admin@example.com",
    password: "segredo-admin-rotacionado-2026",
  },
});
const staleAdminCredential = await rotatedAdminAuth.login({
  email: "admin@example.com",
  password: "segredo-admin-forte-2026",
  clientAddress: "203.0.113.12",
});
assert.equal(staleAdminCredential.ok, false);
assert.equal(staleAdminCredential.status, 401);
const rotatedAdmin = await rotatedAdminAuth.login({
  email: "admin@example.com",
  password: "segredo-admin-rotacionado-2026",
  clientAddress: "203.0.113.12",
});
assert.equal(rotatedAdmin.ok, true);
assert.equal(rotatedAdmin.account.role, "admin");

await auth.logout(loggedIn.session.id);
assert.equal(await auth.current(loggedIn.session.id), null);

const legacyAccount = {
  id: "acct_legacy",
  username: "Legado_1",
  authLevel: "username",
  createdAt: now - 10_000,
};
await storage.put("account:acct_legacy", legacyAccount);
await storage.put("account-username:legado_1", legacyAccount.id);
await storage.put("account-session:sess_legacy", {
  id: "sess_legacy",
  accountId: legacyAccount.id,
  createdAt: now - 5_000,
  expiresAt: now + 60_000,
});

const upgraded = await auth.register({
  username: "Legado_1",
  email: "legado@example.com",
  password: "segredo-legado-forte-2026",
}, "sess_legacy");
assert.equal(upgraded.ok, true);
assert.equal(upgraded.status, 200);
assert.equal(upgraded.account.id, legacyAccount.id);
assert.equal(upgraded.account.authLevel, "email");
assert.equal(upgraded.account.email, "legado@example.com");
assert.equal(await auth.current("sess_legacy"), null);
assert.equal((await auth.current(upgraded.session.id))?.id, legacyAccount.id);

for (let attempt = 0; attempt < 5; attempt += 1) {
  const rejected = await auth.login({
    email: "jogador@example.com",
    password: "tentativa-incorreta-2026",
    clientAddress: "203.0.113.50",
  });
  assert.equal(rejected.status, 401);
}
const throttled = await auth.login({
  email: "jogador@example.com",
  password: "segredo-jogador-2026",
  clientAddress: "203.0.113.50",
});
assert.equal(throttled.ok, false);
assert.equal(throttled.status, 429);
assert.equal(throttled.code, "too-many-attempts");

now += 15 * 60 * 1000 + 1;
const afterThrottle = await auth.login({
  email: "jogador@example.com",
  password: "segredo-jogador-2026",
  clientAddress: "203.0.113.50",
});
assert.equal(afterThrottle.ok, true);

const concurrentStorage = new MemoryAuthStorage();
const concurrentAuth = new AccountAuth(concurrentStorage, { now: () => now });
const concurrentRegistrations = await Promise.all([
  concurrentAuth.register({
    username: "Concorrente_1",
    email: "mesmo-email@example.com",
    password: "segredo-concorrente-2026",
  }),
  concurrentAuth.register({
    username: "Concorrente_2",
    email: "MESMO-EMAIL@example.com",
    password: "outro-segredo-concorrente-2026",
  }),
]);
assert.equal(concurrentRegistrations.filter((result) => result.ok).length, 1);
assert.equal(concurrentRegistrations.filter((result) => !result.ok && result.status === 409).length, 1);

console.log("account authentication flow: ok");
