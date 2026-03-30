export type AccountAuthLevel = "username" | "email";

export interface PlayerAccount {
  id: string;
  username: string;
  authLevel: AccountAuthLevel;
  createdAt: number;
}

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 16;
const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

export interface UsernameValidationResult {
  ok: boolean;
  username: string | null;
  normalizedUsername: string | null;
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
      message: `Use pelo menos ${USERNAME_MIN_LENGTH} caracteres.`,
    };
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      username: null,
      normalizedUsername: null,
      message: `Use no maximo ${USERNAME_MAX_LENGTH} caracteres.`,
    };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      username: null,
      normalizedUsername: null,
      message: "Use apenas letras, numeros e underscore.",
    };
  }
  return {
    ok: true,
    username,
    normalizedUsername: normalizeUsernameLookup(username),
    message: null,
  };
}
