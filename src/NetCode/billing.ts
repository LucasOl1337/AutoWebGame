export type BillingPlanTier = "free" | "early-access";
export type BillingAccessLevel = "visitor" | "free" | "paid";
export type BillingCheckoutState = "not-configured" | "ready" | "pending" | "confirmed";

export interface StoredBillingRecord {
  accountId: string;
  planTier: "early-access";
  checkoutState: "pending" | "confirmed";
  providerSessionId: string | null;
  checkoutStartedAt: number | null;
  confirmedAt: number | null;
  updatedAt: number;
}

export interface PlayerBillingStatus {
  accountId: string | null;
  planTier: BillingPlanTier;
  accessLevel: BillingAccessLevel;
  checkoutState: BillingCheckoutState;
  checkoutUrl: string | null;
  providerSessionId: string | null;
  confirmedAt: number | null;
  updatedAt: number;
}

export function createDefaultBillingStatus(
  accountId: string | null,
  checkoutUrl: string | null,
  now = Date.now(),
): PlayerBillingStatus {
  return {
    accountId,
    planTier: "free",
    accessLevel: accountId ? "free" : "visitor",
    checkoutState: checkoutUrl ? "ready" : "not-configured",
    checkoutUrl,
    providerSessionId: null,
    confirmedAt: null,
    updatedAt: now,
  };
}
export function createPendingBillingRecord(
  accountId: string,
  now = Date.now(),
  providerSessionId: string | null = null,
): StoredBillingRecord {
  return {
    accountId,
    planTier: "early-access",
    checkoutState: "pending",
    providerSessionId,
    checkoutStartedAt: now,
    confirmedAt: null,
    updatedAt: now,
  };
}

export function createConfirmedBillingRecord(
  accountId: string,
  now = Date.now(),
  providerSessionId: string | null = null,
): StoredBillingRecord {
  return {
    accountId,
    planTier: "early-access",
    checkoutState: "confirmed",
    providerSessionId,
    checkoutStartedAt: null,
    confirmedAt: now,
    updatedAt: now,
  };
}

export function billingRecordToStatus(
  record: StoredBillingRecord | null,
  checkoutUrl: string | null,
  now = Date.now(),
): PlayerBillingStatus | null {
  if (!record) {
    return null;
  }

  const confirmed = record.checkoutState === "confirmed";
  return {
    accountId: record.accountId,
    planTier: confirmed ? "early-access" : "free",
    accessLevel: confirmed ? "paid" : "free",
    checkoutState: confirmed ? "confirmed" : "pending",
    checkoutUrl,
    providerSessionId: record.providerSessionId,
    confirmedAt: record.confirmedAt,
    updatedAt: Number.isFinite(record.updatedAt) ? record.updatedAt : now,
  };
}

export function normalizeStoredBillingRecord(record: unknown): StoredBillingRecord | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const candidate = record as Partial<StoredBillingRecord>;
  if (typeof candidate.accountId !== "string" || !candidate.accountId) {
    return null;
  }
  if (candidate.planTier !== "early-access") {
    return null;
  }
  if (candidate.checkoutState !== "pending" && candidate.checkoutState !== "confirmed") {
    return null;
  }

  const updatedAt = Number(candidate.updatedAt);
  if (!Number.isFinite(updatedAt)) {
    return null;
  }

  const checkoutStartedAt = Number(candidate.checkoutStartedAt);
  const confirmedAt = Number(candidate.confirmedAt);
  return {
    accountId: candidate.accountId,
    planTier: "early-access",
    checkoutState: candidate.checkoutState,
    providerSessionId: typeof candidate.providerSessionId === "string" && candidate.providerSessionId
      ? candidate.providerSessionId
      : null,
    checkoutStartedAt: Number.isFinite(checkoutStartedAt) ? checkoutStartedAt : null,
    confirmedAt: Number.isFinite(confirmedAt) ? confirmedAt : null,
    updatedAt,
  };
}
