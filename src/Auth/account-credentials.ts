import type { PlayerAccount } from "../NetCode/account";
import { validateUsername } from "../NetCode/account";

export type AccountRole = "user" | "admin";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
// Cloudflare Workers Web Crypto rejects PBKDF2 iteration counts above 100,000.
// Rate limits and the 12-character password floor provide the surrounding defense.
export const PASSWORD_HASH_ITERATIONS = 100_000;

export interface PasswordCredential {
  algorithm: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  hash: string;
}

export interface StoredAccount {
  id: string;
  username: string;
  normalizedUsername: string;
  email: string | null;
  normalizedEmail: string | null;
  role: AccountRole;
  authLevel: "username" | "email";
  passwordCredential: PasswordCredential | null;
  createdAt: number;
  updatedAt: number;
}

export type AccountCredentialErrorCode =
  | "invalid-username"
  | "invalid-email"
  | "password-too-short"
  | "password-too-long";

export type AccountRegistrationValidation =
  | {
      ok: true;
      value: {
        username: string;
        normalizedUsername: string;
        email: string;
        password: string;
      };
    }
  | {
      ok: false;
      code: AccountCredentialErrorCode;
      error: string;
    };

const textEncoder = new TextEncoder();

export function normalizeEmail(rawEmail: string): string {
  return rawEmail.trim().toLowerCase();
}

export function validateEmail(rawEmail: string): string | null {
  const email = normalizeEmail(rawEmail);
  if (email.length === 0 || email.length > 254) {
    return null;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function validateAccountRegistration(input: {
  username: string;
  email: string;
  password: string;
}): AccountRegistrationValidation {
  const username = validateUsername(input.username);
  if (!username.ok || !username.username || !username.normalizedUsername) {
    return {
      ok: false,
      code: "invalid-username",
      error: username.message ?? "Username invalido.",
    };
  }

  const email = validateEmail(input.email);
  if (!email) {
    return {
      ok: false,
      code: "invalid-email",
      error: "Informe um e-mail valido.",
    };
  }

  if (input.password.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      code: "password-too-short",
      error: `Use uma senha com pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`,
    };
  }
  if (input.password.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      code: "password-too-long",
      error: `Use uma senha com no maximo ${PASSWORD_MAX_LENGTH} caracteres.`,
    };
  }

  return {
    ok: true,
    value: {
      username: username.username,
      normalizedUsername: username.normalizedUsername,
      email,
      password: input.password,
    },
  };
}

export async function createPasswordCredential(password: string): Promise<PasswordCredential> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePasswordHash(password, salt, PASSWORD_HASH_ITERATIONS);
  return {
    algorithm: "PBKDF2-SHA256",
    iterations: PASSWORD_HASH_ITERATIONS,
    salt: bytesToBase64Url(salt),
    hash: bytesToBase64Url(hash),
  };
}

export async function verifyPasswordCredential(
  password: string,
  credential: PasswordCredential | null,
): Promise<boolean> {
  if (!isPasswordCredential(credential)) {
    return false;
  }
  const expected = base64UrlToBytes(credential.hash);
  const actual = await derivePasswordHash(
    password,
    base64UrlToBytes(credential.salt),
    credential.iterations,
  );
  return timingSafeBytesEqual(actual, expected);
}

export function normalizeStoredAccount(value: unknown): StoredAccount | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const account = value as Partial<StoredAccount>;
  if (typeof account.id !== "string" || typeof account.username !== "string") {
    return null;
  }
  const username = validateUsername(account.username);
  if (!username.ok || !username.username || !username.normalizedUsername) {
    return null;
  }
  const email = typeof account.email === "string" ? validateEmail(account.email) : null;
  const createdAt = Number(account.createdAt);
  const updatedAt = Number(account.updatedAt);
  return {
    id: account.id,
    username: username.username,
    normalizedUsername: username.normalizedUsername,
    email,
    normalizedEmail: email,
    role: account.role === "admin" ? "admin" : "user",
    authLevel: email && isPasswordCredential(account.passwordCredential) ? "email" : "username",
    passwordCredential: isPasswordCredential(account.passwordCredential)
      ? account.passwordCredential
      : null,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    updatedAt: Number.isFinite(updatedAt)
      ? updatedAt
      : Number.isFinite(createdAt)
        ? createdAt
        : 0,
  };
}

export function toPublicAccount(account: StoredAccount): PlayerAccount {
  return {
    id: account.id,
    username: account.username,
    displayName: account.username,
    email: account.email,
    role: account.role,
    authLevel: account.authLevel,
    createdAt: account.createdAt,
  };
}

export function timingSafeStringEqual(left: string, right: string): boolean {
  return timingSafeBytesEqual(textEncoder.encode(left), textEncoder.encode(right));
}

function isPasswordCredential(value: unknown): value is PasswordCredential {
  if (!value || typeof value !== "object") {
    return false;
  }
  const credential = value as Partial<PasswordCredential>;
  return credential.algorithm === "PBKDF2-SHA256"
    && Number.isInteger(credential.iterations)
    && Number(credential.iterations) >= 100_000
    && typeof credential.salt === "string"
    && credential.salt.length > 0
    && typeof credential.hash === "string"
    && credential.hash.length > 0;
}

async function derivePasswordHash(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new Uint8Array(salt).buffer,
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return mismatch === 0;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
