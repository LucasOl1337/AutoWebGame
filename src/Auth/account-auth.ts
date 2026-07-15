import {
  createPasswordCredential,
  normalizeEmail,
  normalizeStoredAccount,
  PASSWORD_MAX_LENGTH,
  timingSafeStringEqual,
  toPublicAccount,
  validateAccountRegistration,
  validateEmail,
  verifyPasswordCredential,
  type PasswordCredential,
  type StoredAccount,
} from "./account-credentials";
import { validateUsername, type PlayerAccount } from "../NetCode/account";

const USER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const AUTH_HASH_GLOBAL_MAX = 30;
const AUTH_HASH_GLOBAL_WINDOW_MS = 60 * 1000;
const AUTH_HASH_IP_MAX = 5;
const AUTH_HASH_IP_WINDOW_MS = 15 * 60 * 1000;
const REGISTRATION_IP_MAX = 3;
const REGISTRATION_IP_WINDOW_MS = 60 * 60 * 1000;

export interface AuthStorage {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<unknown>;
}

export interface AuthSession {
  id: string;
  accountId: string;
  createdAt: number;
  expiresAt: number;
}

export interface BootstrapAdminCredentials {
  email: string;
  password: string;
}

export type AuthSuccess = {
  ok: true;
  status: 200 | 201;
  account: PlayerAccount;
  session: AuthSession;
};

export type AuthFailure = {
  ok: false;
  status: 400 | 401 | 409 | 429;
  code: string;
  error: string;
};

export type AuthResult = AuthSuccess | AuthFailure;

interface AccountAuthOptions {
  now?: () => number;
  bootstrapAdmin?: BootstrapAdminCredentials | null;
}

interface LoginAttemptRecord {
  failures: number;
  windowStartedAt: number;
  lockedUntil: number;
}

interface RateLimitRecord {
  count: number;
  windowStartedAt: number;
}

interface RateLimitBudget {
  key: string;
  max: number;
  windowMs: number;
}

export class AccountAuth {
  private readonly storage: AuthStorage;
  private readonly now: () => number;
  private readonly bootstrapAdmin: BootstrapAdminCredentials | null;
  private dummyCredentialPromise: Promise<PasswordCredential> | null = null;
  private authOperationTail: Promise<void> = Promise.resolve();

  constructor(storage: AuthStorage, options: AccountAuthOptions = {}) {
    this.storage = storage;
    this.now = options.now ?? (() => Date.now());
    this.bootstrapAdmin = normalizeBootstrapAdmin(options.bootstrapAdmin ?? null);
  }

  async register(input: {
    username: string;
    email: string;
    password: string;
    clientAddress?: string | null;
  }, currentSessionId: string | null = null): Promise<AuthResult> {
    return this.runAuthOperation(() => this.registerExclusive(input, currentSessionId));
  }

  private async registerExclusive(input: {
    username: string;
    email: string;
    password: string;
    clientAddress?: string | null;
  }, currentSessionId: string | null): Promise<AuthResult> {
    const validation = validateAccountRegistration(input);
    if (!validation.ok) {
      return authFailure(400, validation.code, validation.error);
    }

    const { username, normalizedUsername, email, password } = validation.value;
    if (!await this.consumeRegistrationQuota(input.clientAddress ?? null)) {
      return tooManyAttempts();
    }
    if (this.isBootstrapAdminEmail(email)) {
      return authFailure(409, "email-unavailable", "Ja existe uma conta com este e-mail.");
    }
    const legacyAccount = await this.readStoredAccountBySession(currentSessionId);
    if (legacyAccount?.authLevel === "email") {
      return authFailure(409, "account-already-registered", "Esta conta ja possui e-mail e senha.");
    }
    const [emailAccountId, usernameAccountId] = await Promise.all([
      this.storage.get(buildEmailLookupKey(email)),
      this.storage.get(buildUsernameLookupKey(normalizedUsername)),
    ]);
    if (typeof emailAccountId === "string" && emailAccountId && emailAccountId !== legacyAccount?.id) {
      return authFailure(409, "email-unavailable", "Ja existe uma conta com este e-mail.");
    }
    if (typeof usernameAccountId === "string" && usernameAccountId && usernameAccountId !== legacyAccount?.id) {
      return authFailure(409, "username-unavailable", "Esse username ja foi escolhido.");
    }

    const now = this.now();
    if (!await this.consumeHashBudget(input.clientAddress ?? null)) {
      return tooManyAttempts();
    }
    const account: StoredAccount = {
      id: legacyAccount?.id ?? createId("acct"),
      username,
      normalizedUsername,
      email,
      normalizedEmail: email,
      role: legacyAccount?.role ?? "user",
      authLevel: "email",
      passwordCredential: await createPasswordCredential(password),
      createdAt: legacyAccount?.createdAt ?? now,
      updatedAt: now,
    };
    const session = createSession(account, now);

    const writes = [
      this.storage.put(buildAccountKey(account.id), account),
      this.storage.put(buildEmailLookupKey(email), account.id),
      this.storage.put(buildUsernameLookupKey(normalizedUsername), account.id),
      this.storage.put(buildSessionKey(session.id), session),
    ];
    if (legacyAccount && legacyAccount.normalizedUsername !== normalizedUsername) {
      writes.push(this.storage.delete(buildUsernameLookupKey(legacyAccount.normalizedUsername)).then(() => undefined));
    }
    if (currentSessionId) {
      writes.push(this.storage.delete(buildSessionKey(currentSessionId)).then(() => undefined));
    }
    await Promise.all(writes);

    return {
      ok: true,
      status: legacyAccount ? 200 : 201,
      account: toPublicAccount(account),
      session,
    };
  }

  async login(input: {
    email: string;
    password: string;
    clientAddress?: string | null;
  }): Promise<AuthResult> {
    return this.runAuthOperation(() => this.loginExclusive(input));
  }

  private async loginExclusive(input: {
    email: string;
    password: string;
    clientAddress?: string | null;
  }): Promise<AuthResult> {
    const email = validateEmail(input.email);
    if (!email || input.password.length === 0 || input.password.length > PASSWORD_MAX_LENGTH) {
      return invalidCredentials();
    }

    const attemptKey = await buildLoginAttemptKey(email, input.clientAddress ?? null);
    const attempt = normalizeLoginAttempt(await this.storage.get(attemptKey));
    const now = this.now();
    if (attempt && attempt.lockedUntil > now) {
      return authFailure(
        429,
        "too-many-attempts",
        "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.",
      );
    }
    if (attempt && attempt.windowStartedAt + LOGIN_ATTEMPT_WINDOW_MS <= now) {
      await this.storage.delete(attemptKey);
    }
    if (!await this.consumeHashBudget(input.clientAddress ?? null)) {
      return tooManyAttempts();
    }

    const bootstrapMatch = this.matchesBootstrapAdmin(email, input.password);
    let account: StoredAccount | null;
    if (bootstrapMatch) {
      const currentAccount = await this.findByEmail(email);
      account = await this.provisionBootstrapAdmin(email, input.password, currentAccount);
    } else {
      account = await this.findByEmail(email);
      const credential = account?.passwordCredential ?? await this.getDummyCredential();
      const passwordMatches = await verifyPasswordCredential(input.password, credential);
      if (!account || !passwordMatches || account.role === "admin") {
        await this.recordLoginFailure(attemptKey);
        return invalidCredentials();
      }
    }

    const session = createSession(account, now);
    await Promise.all([
      this.storage.put(buildSessionKey(session.id), session),
      this.storage.delete(attemptKey).then(() => undefined),
    ]);
    return {
      ok: true,
      status: 200,
      account: toPublicAccount(account),
      session,
    };
  }

  async current(sessionId: string | null): Promise<PlayerAccount | null> {
    const account = await this.readStoredAccountBySession(sessionId);
    return account ? toPublicAccount(account) : null;
  }

  async logout(sessionId: string | null): Promise<void> {
    if (sessionId) {
      await this.storage.delete(buildSessionKey(sessionId));
    }
  }

  private async findByEmail(email: string): Promise<StoredAccount | null> {
    const accountId = await this.storage.get(buildEmailLookupKey(email));
    if (typeof accountId !== "string" || !accountId) {
      return null;
    }
    return normalizeStoredAccount(await this.storage.get(buildAccountKey(accountId)));
  }

  private getDummyCredential(): Promise<PasswordCredential> {
    this.dummyCredentialPromise ??= createPasswordCredential(
      `dummy-${crypto.randomUUID()}-${crypto.randomUUID()}`,
    );
    return this.dummyCredentialPromise;
  }

  private async recordLoginFailure(attemptKey: string): Promise<void> {
    const now = this.now();
    const stored = normalizeLoginAttempt(await this.storage.get(attemptKey));
    const withinWindow = stored && stored.windowStartedAt + LOGIN_ATTEMPT_WINDOW_MS > now;
    const failures = withinWindow ? stored.failures + 1 : 1;
    const record: LoginAttemptRecord = {
      failures,
      windowStartedAt: withinWindow ? stored.windowStartedAt : now,
      lockedUntil: failures >= MAX_LOGIN_FAILURES ? now + LOGIN_LOCK_DURATION_MS : 0,
    };
    await this.storage.put(attemptKey, record);
  }

  private async readStoredAccountBySession(sessionId: string | null): Promise<StoredAccount | null> {
    if (!sessionId) {
      return null;
    }
    const session = normalizeSession(await this.storage.get(buildSessionKey(sessionId)));
    if (!session) {
      return null;
    }
    if (session.expiresAt <= this.now()) {
      await this.storage.delete(buildSessionKey(sessionId));
      return null;
    }
    return normalizeStoredAccount(await this.storage.get(buildAccountKey(session.accountId)));
  }

  private matchesBootstrapAdmin(email: string, password: string): boolean {
    if (!this.bootstrapAdmin) {
      return false;
    }
    return timingSafeStringEqual(email, this.bootstrapAdmin.email)
      && timingSafeStringEqual(password, this.bootstrapAdmin.password);
  }

  private isBootstrapAdminEmail(email: string): boolean {
    return Boolean(this.bootstrapAdmin)
      && timingSafeStringEqual(email, this.bootstrapAdmin?.email ?? "");
  }

  private async provisionBootstrapAdmin(
    email: string,
    password: string,
    existing: StoredAccount | null,
  ): Promise<StoredAccount> {
    const now = this.now();
    const existingAdmin = existing?.role === "admin" ? existing : null;
    const username = existingAdmin?.username ?? await this.resolveBootstrapAdminUsername(email);
    const normalizedUsername = existingAdmin?.normalizedUsername ?? username.toLowerCase();
    const account: StoredAccount = {
      id: existingAdmin?.id ?? createId("acct"),
      username,
      normalizedUsername,
      email,
      normalizedEmail: email,
      role: "admin",
      authLevel: "email",
      passwordCredential: await createPasswordCredential(password),
      createdAt: existingAdmin?.createdAt ?? now,
      updatedAt: now,
    };
    const writes = [
      this.storage.put(buildAccountKey(account.id), account),
      this.storage.put(buildEmailLookupKey(email), account.id),
      this.storage.put(buildUsernameLookupKey(normalizedUsername), account.id),
    ];
    if (existing && existing.role !== "admin") {
      const displacedAccount: StoredAccount = {
        ...existing,
        email: null,
        normalizedEmail: null,
        authLevel: "username",
        passwordCredential: null,
        updatedAt: now,
      };
      writes.push(this.storage.put(buildAccountKey(displacedAccount.id), displacedAccount));
    }
    await Promise.all(writes);
    return account;
  }

  private async resolveBootstrapAdminUsername(email: string): Promise<string> {
    const localPart = email.split("@", 1)[0]
      .replace(/[^A-Za-z0-9_]/g, "_")
      .slice(0, 16);
    const preferred = validateUsername(localPart);
    if (preferred.ok && preferred.username && preferred.normalizedUsername) {
      const existing = await this.storage.get(buildUsernameLookupKey(preferred.normalizedUsername));
      if (!existing) {
        return preferred.username;
      }
    }
    return `admin_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
  }

  private async consumeRegistrationQuota(clientAddress: string | null): Promise<boolean> {
    const clientKey = await buildClientRateLimitKey("auth-register-budget", clientAddress);
    return clientKey
      ? this.consumeBudgets([{
          key: clientKey,
          max: REGISTRATION_IP_MAX,
          windowMs: REGISTRATION_IP_WINDOW_MS,
        }])
      : true;
  }

  private async consumeHashBudget(clientAddress: string | null): Promise<boolean> {
    const budgets: RateLimitBudget[] = [{
      key: "auth-hash-budget:global",
      max: AUTH_HASH_GLOBAL_MAX,
      windowMs: AUTH_HASH_GLOBAL_WINDOW_MS,
    }];
    const clientKey = await buildClientRateLimitKey("auth-hash-budget:ip", clientAddress);
    if (clientKey) {
      budgets.push({
        key: clientKey,
        max: AUTH_HASH_IP_MAX,
        windowMs: AUTH_HASH_IP_WINDOW_MS,
      });
    }
    return this.consumeBudgets(budgets);
  }

  private async consumeBudgets(budgets: RateLimitBudget[]): Promise<boolean> {
    const now = this.now();
    const storedRecords = await Promise.all(budgets.map((budget) => this.storage.get(budget.key)));
    const records = budgets.map((budget, index) => {
      const stored = normalizeRateLimitRecord(storedRecords[index]);
      return stored && stored.windowStartedAt + budget.windowMs > now
        ? stored
        : { count: 0, windowStartedAt: now };
    });
    if (records.some((record, index) => record.count >= budgets[index].max)) {
      return false;
    }
    await Promise.all(budgets.map((budget, index) => this.storage.put(budget.key, {
      count: records[index].count + 1,
      windowStartedAt: records[index].windowStartedAt,
    } satisfies RateLimitRecord)));
    return true;
  }

  private async runAuthOperation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.authOperationTail;
    let release: () => void = () => undefined;
    this.authOperationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

function normalizeBootstrapAdmin(value: BootstrapAdminCredentials | null): BootstrapAdminCredentials | null {
  if (!value) {
    return null;
  }
  const email = validateEmail(value.email);
  const password = value.password.trim();
  return email && password ? { email, password } : null;
}

function createSession(account: StoredAccount, now: number): AuthSession {
  const maxAge = account.role === "admin"
    ? ADMIN_SESSION_MAX_AGE_SECONDS
    : USER_SESSION_MAX_AGE_SECONDS;
  return {
    id: createId("sess"),
    accountId: account.id,
    createdAt: now,
    expiresAt: now + maxAge * 1000,
  };
}

function normalizeSession(value: unknown): AuthSession | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const session = value as Partial<AuthSession>;
  const createdAt = Number(session.createdAt);
  const expiresAt = Number(session.expiresAt);
  if (typeof session.id !== "string"
    || typeof session.accountId !== "string"
    || !Number.isFinite(expiresAt)) {
    return null;
  }
  return {
    id: session.id,
    accountId: session.accountId,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    expiresAt,
  };
}

function createId(prefix: "acct" | "sess"): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildAccountKey(accountId: string): string {
  return `account:${accountId}`;
}

function buildEmailLookupKey(normalizedEmail: string): string {
  return `account-email:${normalizeEmail(normalizedEmail)}`;
}

function buildUsernameLookupKey(normalizedUsername: string): string {
  return `account-username:${normalizedUsername}`;
}

function buildSessionKey(sessionId: string): string {
  return `account-session:${sessionId}`;
}

async function buildLoginAttemptKey(email: string, clientAddress: string | null): Promise<string> {
  const input = new TextEncoder().encode(`${normalizeEmail(email)}|${clientAddress?.trim() || "unknown"}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  const fingerprint = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `auth-login-attempt:${fingerprint}`;
}

async function buildClientRateLimitKey(prefix: string, clientAddress: string | null): Promise<string | null> {
  const normalizedAddress = clientAddress?.trim();
  if (!normalizedAddress) {
    return null;
  }
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizedAddress),
  ));
  const fingerprint = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}:${fingerprint}`;
}

function normalizeLoginAttempt(value: unknown): LoginAttemptRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const attempt = value as Partial<LoginAttemptRecord>;
  const failures = Number(attempt.failures);
  const windowStartedAt = Number(attempt.windowStartedAt);
  const lockedUntil = Number(attempt.lockedUntil);
  if (!Number.isFinite(failures) || !Number.isFinite(windowStartedAt) || !Number.isFinite(lockedUntil)) {
    return null;
  }
  return {
    failures: Math.max(0, Math.floor(failures)),
    windowStartedAt,
    lockedUntil,
  };
}

function normalizeRateLimitRecord(value: unknown): RateLimitRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<RateLimitRecord>;
  const count = Number(record.count);
  const windowStartedAt = Number(record.windowStartedAt);
  if (!Number.isFinite(count) || !Number.isFinite(windowStartedAt)) {
    return null;
  }
  return {
    count: Math.max(0, Math.floor(count)),
    windowStartedAt,
  };
}

function invalidCredentials(): AuthFailure {
  return authFailure(401, "invalid-credentials", "E-mail ou senha incorretos.");
}

function tooManyAttempts(): AuthFailure {
  return authFailure(
    429,
    "too-many-attempts",
    "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.",
  );
}

function authFailure(
  status: AuthFailure["status"],
  code: string,
  error: string,
): AuthFailure {
  return { ok: false, status, code, error };
}
