import assert from "node:assert/strict";

import {
  PASSWORD_HASH_ITERATIONS,
  createPasswordCredential,
  normalizeEmail,
  toPublicAccount,
  validateAccountRegistration,
  verifyPasswordCredential,
} from "../output/esm/Auth/account-credentials.js";

assert.equal(normalizeEmail("  Lucas.Plays@Example.COM "), "lucas.plays@example.com");

const valid = validateAccountRegistration({
  username: "Lucas_2000",
  email: "  Lucas.Plays@Example.COM ",
  password: "um-segredo-forte-2026",
});
assert.equal(valid.ok, true);
assert.deepEqual(valid.value, {
  username: "Lucas_2000",
  normalizedUsername: "lucas_2000",
  email: "lucas.plays@example.com",
  password: "um-segredo-forte-2026",
});

const invalidEmail = validateAccountRegistration({
  username: "Lucas_2000",
  email: "lucas@",
  password: "um-segredo-forte-2026",
});
assert.equal(invalidEmail.ok, false);
assert.equal(invalidEmail.code, "invalid-email");

const weakPassword = validateAccountRegistration({
  username: "Lucas_2000",
  email: "lucas@example.com",
  password: "curta",
});
assert.equal(weakPassword.ok, false);
assert.equal(weakPassword.code, "password-too-short");

const credential = await createPasswordCredential("um-segredo-forte-2026");
assert.equal(credential.algorithm, "PBKDF2-SHA256");
assert.equal(credential.iterations, PASSWORD_HASH_ITERATIONS);
assert.equal(PASSWORD_HASH_ITERATIONS, 100_000);
assert.match(credential.salt, /^[A-Za-z0-9_-]+$/);
assert.match(credential.hash, /^[A-Za-z0-9_-]+$/);
assert.equal(await verifyPasswordCredential("um-segredo-forte-2026", credential), true);
assert.equal(await verifyPasswordCredential("segredo-incorreto-2026", credential), false);

const publicAccount = toPublicAccount({
  id: "acct_1",
  username: "Lucas_2000",
  normalizedUsername: "lucas_2000",
  email: "lucas@example.com",
  normalizedEmail: "lucas@example.com",
  role: "admin",
  authLevel: "email",
  passwordCredential: credential,
  createdAt: 1,
  updatedAt: 2,
});
assert.deepEqual(publicAccount, {
  id: "acct_1",
  username: "Lucas_2000",
  displayName: "Lucas_2000",
  email: "lucas@example.com",
  role: "admin",
  authLevel: "email",
  createdAt: 1,
});
assert.equal("passwordCredential" in publicAccount, false);
assert.equal("normalizedEmail" in publicAccount, false);

console.log("account credential contract: ok");
