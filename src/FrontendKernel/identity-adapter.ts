export type AuthenticatedIdentity = Readonly<{
  id: string;
  username: string;
  displayName: string;
  authLevel: "email";
}>;

export interface IdentityAdapter {
  load(signal: AbortSignal): Promise<AuthenticatedIdentity | null>;
  readTemporaryNick(): string;
  writeTemporaryNick(value: string): void;
}

type SessionFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type TemporaryNickStorage = Pick<Storage, "getItem" | "setItem">;

export const TEMPORARY_NICK_STORAGE_KEY = "bomba-pvp:launcher:v1:temporary-nick";
export const DEFAULT_TEMPORARY_NICK = "Visitante";

export class BrowserIdentityAdapter implements IdentityAdapter {
  constructor(
    private readonly fetcher: SessionFetcher = window.fetch.bind(window),
    private readonly storage: TemporaryNickStorage = window.localStorage,
  ) {}

  async load(signal: AbortSignal): Promise<AuthenticatedIdentity | null> {
    const response = await this.fetcher("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (!response.ok) {
      throw new Error(`Identity request failed (${response.status})`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || payload.account === null || payload.account === undefined) {
      return null;
    }
    if (!isRecord(payload.account)) {
      throw new Error("Identity response has an invalid account");
    }
    if (payload.account.authLevel !== "email") {
      return null;
    }

    const { id, username, displayName } = payload.account;
    if (
      typeof id !== "string" || id.length === 0
      || typeof username !== "string" || username.length === 0
      || typeof displayName !== "string" || displayName.length === 0
    ) {
      throw new Error("Identity response is missing authenticated account fields");
    }
    return Object.freeze({ id, username, displayName, authLevel: "email" });
  }

  readTemporaryNick(): string {
    try {
      return normalizeStoredNick(this.storage.getItem(TEMPORARY_NICK_STORAGE_KEY));
    } catch {
      return DEFAULT_TEMPORARY_NICK;
    }
  }

  writeTemporaryNick(value: string): void {
    try {
      this.storage.setItem(TEMPORARY_NICK_STORAGE_KEY, value);
    } catch {
      // Storage denial must not block Sala contínua or Treino.
    }
  }
}

type InMemoryIdentityOptions = Readonly<{
  account?: AuthenticatedIdentity | null;
  temporaryNick?: string;
  loadError?: Error | null;
}>;

export class InMemoryIdentityAdapter implements IdentityAdapter {
  account: AuthenticatedIdentity | null;
  temporaryNick: string;
  loadError: Error | null;

  constructor(options: InMemoryIdentityOptions = {}) {
    this.account = options.account ?? null;
    this.temporaryNick = options.temporaryNick ?? DEFAULT_TEMPORARY_NICK;
    this.loadError = options.loadError ?? null;
  }

  async load(signal: AbortSignal): Promise<AuthenticatedIdentity | null> {
    await Promise.resolve();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (this.loadError) throw this.loadError;
    return this.account;
  }

  readTemporaryNick(): string {
    return this.temporaryNick;
  }

  writeTemporaryNick(value: string): void {
    this.temporaryNick = value;
  }
}

function normalizeStoredNick(value: string | null): string {
  if (value === null) return DEFAULT_TEMPORARY_NICK;
  const normalized = value.trim();
  return normalized.length >= 3 && normalized.length <= 16
    ? normalized
    : DEFAULT_TEMPORARY_NICK;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
