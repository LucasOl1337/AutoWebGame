export const ACTIVE_MATCH_RECONNECT_GRACE_MS = 15_000;

const RECONNECT_TOKEN_PATTERN = /^resume_[a-f0-9]{32}$/;

export interface ActiveMatchReconnectState {
  canResume: boolean;
  shouldExpire: boolean;
  remainingMs: number;
}

export function createReconnectToken(randomUuid = (): string => crypto.randomUUID()): string {
  const tokenBody = randomUuid().replace(/-/g, "").toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(tokenBody)) {
    throw new Error("Unable to create a secure reconnect token.");
  }
  return `resume_${tokenBody}`;
}

export function normalizeReconnectToken(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return RECONNECT_TOKEN_PATTERN.test(normalized) ? normalized : null;
}

export function getActiveMatchReconnectState(
  disconnectedAt: number | null | undefined,
  nowMs: number,
  graceMs = ACTIVE_MATCH_RECONNECT_GRACE_MS,
): ActiveMatchReconnectState {
  const safeNowMs = Number.isFinite(nowMs) ? Math.max(0, nowMs) : 0;
  const safeGraceMs = Number.isFinite(graceMs)
    ? Math.max(0, graceMs)
    : ACTIVE_MATCH_RECONNECT_GRACE_MS;
  if (typeof disconnectedAt !== "number" || !Number.isFinite(disconnectedAt)) {
    return { canResume: false, shouldExpire: false, remainingMs: 0 };
  }
  const safeDisconnectedAt = Math.min(Math.max(0, disconnectedAt), safeNowMs);
  const remainingMs = Math.max(0, safeGraceMs - (safeNowMs - safeDisconnectedAt));
  return {
    canResume: remainingMs > 0,
    shouldExpire: remainingMs === 0,
    remainingMs,
  };
}

export function buildReconnectWebSocketUrl(baseUrl: string, reconnectToken: string | null): string {
  const url = new URL(baseUrl);
  const normalizedToken = normalizeReconnectToken(reconnectToken);
  if (normalizedToken) {
    url.searchParams.set("resumeToken", normalizedToken);
  }
  return url.toString();
}
