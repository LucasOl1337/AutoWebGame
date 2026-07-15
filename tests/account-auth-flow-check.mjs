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

const concurrentFailures = await Promise.all(Array.from({ length: 5 }, () => (
  auth.login({
    email: "jogador@example.com",
    password: "tentativa-incorreta-2026",
    clientAddress: "203.0.113.50",
  })
)));
for (const rejected of concurrentFailures) {
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

const oversizedPassword = await auth.login({
  email: "jogador@example.com",
  password: "x".repeat(129),
  clientAddress: "203.0.113.60",
});
assert.equal(oversizedPassword.ok, false);
assert.equal(oversizedPassword.status, 401);

const variedEmailStorage = new MemoryAuthStorage();
const variedEmailAuth = new AccountAuth(variedEmailStorage, { now: () => now });
const variedEmailFailures = await Promise.all(Array.from({ length: 5 }, (_, index) => (
  variedEmailAuth.login({
    email: `desconhecido-${index}@example.com`,
    password: "segredo-inexistente-2026",
    clientAddress: "203.0.113.61",
  })
)));
assert.equal(variedEmailFailures.every((result) => result.status === 401), true);
const variedEmailThrottled = await variedEmailAuth.login({
  email: "mais-um-desconhecido@example.com",
  password: "segredo-inexistente-2026",
  clientAddress: "203.0.113.61",
});
assert.equal(variedEmailThrottled.ok, false);
assert.equal(variedEmailThrottled.status, 429);

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

const reservedAdminStorage = new MemoryAuthStorage();
const configuredAdminAuth = new AccountAuth(reservedAdminStorage, {
  now: () => now,
  bootstrapAdmin: {
    email: "reserved-admin@example.com",
    password: "segredo-admin-reservado-2026",
  },
});
const reservedRegistration = await configuredAdminAuth.register({
  username: "AdminImpostor",
  email: "reserved-admin@example.com",
  password: "segredo-jogador-reservado-2026",
  clientAddress: "203.0.113.80",
});
assert.equal(reservedRegistration.ok, false);
assert.equal(reservedRegistration.status, 409);
assert.equal(reservedRegistration.code, "email-unavailable");
for (let attempt = 0; attempt < 2; attempt += 1) {
  const repeatedReservedRegistration = await configuredAdminAuth.register({
    username: `AdminImpostor${attempt}`,
    email: "reserved-admin@example.com",
    password: "segredo-jogador-reservado-2026",
    clientAddress: "203.0.113.80",
  });
  assert.equal(repeatedReservedRegistration.status, 409);
}
const registrationQuotaReached = await configuredAdminAuth.register({
  username: "AdminImpostor3",
  email: "reserved-admin@example.com",
  password: "segredo-jogador-reservado-2026",
  clientAddress: "203.0.113.80",
});
assert.equal(registrationQuotaReached.ok, false);
assert.equal(registrationQuotaReached.status, 429);

const legacyConflictStorage = new MemoryAuthStorage();
const authBeforeAdminConfiguration = new AccountAuth(legacyConflictStorage, { now: () => now });
const legacyConflictingUser = await authBeforeAdminConfiguration.register({
  username: "LegacyConflict",
  email: "legacy-admin@example.com",
  password: "segredo-usuario-legado-2026",
});
assert.equal(legacyConflictingUser.ok, true);
const authAfterAdminConfiguration = new AccountAuth(legacyConflictStorage, {
  now: () => now,
  bootstrapAdmin: {
    email: "legacy-admin@example.com",
    password: "segredo-admin-legado-2026",
  },
});
const isolatedAdmin = await authAfterAdminConfiguration.login({
  email: "legacy-admin@example.com",
  password: "segredo-admin-legado-2026",
  clientAddress: "203.0.113.70",
});
assert.equal(isolatedAdmin.ok, true);
assert.equal(isolatedAdmin.account.role, "admin");
assert.notEqual(isolatedAdmin.account.id, legacyConflictingUser.account.id);
const unchangedLegacySession = await authAfterAdminConfiguration.current(legacyConflictingUser.session.id);
assert.equal(unchangedLegacySession?.role, "user");
assert.equal(unchangedLegacySession?.id, legacyConflictingUser.account.id);
assert.equal(unchangedLegacySession?.authLevel, "username");
assert.equal(unchangedLegacySession?.email, null);
const recoveredLegacyUser = await authAfterAdminConfiguration.register({
  username: "LegacyConflict",
  email: "legacy-user-recovered@example.com",
  password: "segredo-usuario-recuperado-2026",
  clientAddress: "203.0.113.71",
}, legacyConflictingUser.session.id);
assert.equal(recoveredLegacyUser.ok, true);
assert.equal(recoveredLegacyUser.account.id, legacyConflictingUser.account.id);
assert.equal(recoveredLegacyUser.account.email, "legacy-user-recovered@example.com");

console.log("account authentication flow: ok");
