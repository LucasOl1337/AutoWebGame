import { readFile } from "node:fs/promises";

const {
  billingRecordToStatus,
  createConfirmedBillingRecord,
  createDefaultBillingStatus,
  createPendingBillingRecord,
  normalizeStoredBillingRecord,
} = await import("../output/esm/NetCode/billing.js");
const { SITE_COPY } = await import("../output/esm/UiLayouts/i18n.js");

const workerSource = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");
const sessionSource = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const telemetrySource = await readFile(new URL("../src/NetCode/growth-telemetry.ts", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");

const checkoutUrl = "https://checkout.example/pay";
const guestStatus = createDefaultBillingStatus(null, checkoutUrl, 1000);
const freeStatus = createDefaultBillingStatus("acct_1", checkoutUrl, 1000);
const pendingRecord = createPendingBillingRecord("acct_1", 2000, "chk_1");
const pendingStatus = billingRecordToStatus(pendingRecord, checkoutUrl, 2100);
const confirmedRecord = createConfirmedBillingRecord("acct_1", 3000, "sess_1");
const confirmedStatus = billingRecordToStatus(confirmedRecord, checkoutUrl, 3100);
const normalizedConfirmed = normalizeStoredBillingRecord(confirmedRecord);

const modelChecks = {
  guestIsVisitor: guestStatus.accessLevel === "visitor" && guestStatus.checkoutState === "ready",
  freeAccountCanUpgrade: freeStatus.accessLevel === "free" && freeStatus.accountId === "acct_1",
  pendingDoesNotGrantPaidAccess: pendingStatus?.accessLevel === "free" && pendingStatus.checkoutState === "pending",
  confirmedGrantsPaidAccess: confirmedStatus?.accessLevel === "paid" && confirmedStatus.checkoutState === "confirmed",
  normalizesConfirmedRecord: normalizedConfirmed?.providerSessionId === "sess_1",
};

const sourceChecks = {
  publicStatusRouteExists: workerSource.includes('url.pathname === "/api/billing/status"'),
  publicCheckoutRouteExists: workerSource.includes('url.pathname === "/api/billing/checkout"'),
  publicWebhookRouteExists: workerSource.includes('url.pathname === "/api/billing/webhook"'),
  checkoutUsesConfigEnv: workerSource.includes("BILLING_CHECKOUT_URL"),
  webhookRequiresSecretEnv: workerSource.includes("BILLING_WEBHOOK_SECRET")
    && workerSource.includes("x-billing-webhook-secret")
    && workerSource.includes("timingSafeEqual(providedSecret, expectedSecret)"),
  webhookConfirmsBilling: workerSource.includes("createConfirmedBillingRecord(account.id")
    && workerSource.includes('eventName !== "checkout.confirmed" && eventName !== "payment.succeeded"'),
  sessionFetchesBillingStatus: sessionSource.includes('fetch("/api/billing/status"'),
  sessionStartsCheckout: sessionSource.includes('fetch("/api/billing/checkout"')
    && sessionSource.includes("window.location.href = payload.checkoutUrl;"),
  sessionTracksCommercialEvents: sessionSource.includes('this.telemetry.track("billing_checkout_clicked"')
    && telemetrySource.includes('"billing_checkout_started"'),
  billingPanelCssExists: cssSource.includes(".experience-billing-panel")
    && cssSource.includes(".experience-billing__status"),
};

const copyChecks = {
  portugueseHasCheckoutCta: SITE_COPY.pt.landing.billingCtaReady === "Abrir checkout",
  englishHasWebhookHint: SITE_COPY.en.landing.billingHintPending.includes("webhook"),
  copyIsLocalized: SITE_COPY.pt.landing.billingCheckoutError !== SITE_COPY.en.landing.billingCheckoutError,
};

const failedModelChecks = Object.entries(modelChecks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const failedSourceChecks = Object.entries(sourceChecks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const failedCopyChecks = Object.entries(copyChecks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

const pass = failedModelChecks.length === 0
  && failedSourceChecks.length === 0
  && failedCopyChecks.length === 0;

console.log(JSON.stringify({
  modelChecks,
  sourceChecks,
  copyChecks,
  failedModelChecks,
  failedSourceChecks,
  failedCopyChecks,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
