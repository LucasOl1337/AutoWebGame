export type AccountAuthLevel = "username" | "email";
export type AccountRole = "user" | "admin";

export interface PlayerAccount {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  role: AccountRole;
  authLevel: AccountAuthLevel;
  createdAt: number;
}

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 16;
export const USERNAME_ALLOWED_PATTERN_SOURCE = "[A-Za-z0-9_]+";
const USERNAME_PATTERN = new RegExp(`^${USERNAME_ALLOWED_PATTERN_SOURCE}$`);

export type UsernameValidationReason = "too-short" | "too-long" | "invalid-characters";

export interface UsernameValidationResult {
  ok: boolean;
  username: string | null;
  normalizedUsername: string | null;
  reason: UsernameValidationReason | null;
  message: string | null;
}

export function normalizeUsername(rawUsername: string): string {
  return rawUsername.trim();
}

export function normalizeUsernameLookup(rawUsername: string): string {
  return normalizeUsername(rawUsername).toLowerCase();
}

export function validateUsername(rawUsername: string): UsernameValidationResult {
  const username = normalizeUsername(rawUsername);
  if (username.length < USERNAME_MIN_LENGTH) {
    return {
      ok: false,
      username: null,
      normalizedUsername: null,
      reason: "too-short",
      message: `Use pelo menos ${USERNAME_MIN_LENGTH} caracteres.`,
    };
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      username: null,
      normalizedUsername: null,
      reason: "too-long",
      message: `Use no maximo ${USERNAME_MAX_LENGTH} caracteres.`,
    };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      username: null,
      normalizedUsername: null,
      reason: "invalid-characters",
      message: "Use apenas letras, numeros e underscore.",
    };
  }
  return {
    ok: true,
    username,
    normalizedUsername: normalizeUsernameLookup(username),
    reason: null,
    message: null,
  };
}
