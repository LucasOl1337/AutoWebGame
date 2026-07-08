import { readFile } from "node:fs/promises";

import {
  USERNAME_ALLOWED_PATTERN_SOURCE,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  validateUsername,
} from "../output/esm/NetCode/account.js";
import {
  billingRecordToStatus,
  createConfirmedBillingRecord,
  createDefaultBillingStatus,
  createPendingBillingRecord,
} from "../output/esm/NetCode/billing.js";
import { SITE_COPY } from "../output/esm/UiLayouts/i18n.js";

const [
  indexHtml,
  gameHtml,
  privacyHtml,
  termsHtml,
  viteConfig,
  sessionSource,
  workerSource,
  telemetrySource,
  cssSource,
] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../game.html", import.meta.url), "utf8"),
  readFile(new URL("../privacy.html", import.meta.url), "utf8"),
  readFile(new URL("../terms.html", import.meta.url), "utf8"),
  readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8"),
  readFile(new URL("../worker/index.js", import.meta.url), "utf8"),
  readFile(new URL("../src/NetCode/growth-telemetry.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8"),
]);

function includesAll(source, snippets) {
  return snippets.every((snippet) => source.includes(snippet));
}

function countOccurrences(source, snippet) {
  return source.split(snippet).length - 1;
}

const validCommercialUsername = validateUsername(" Founder_1 ");
const invalidCommercialUsername = validateUsername("paying-player");

const visitorBilling = createDefaultBillingStatus(null, "https://checkout.example/early", 1000);
const freeBilling = createDefaultBillingStatus("acct_founder", "https://checkout.example/early", 1100);
const pendingBilling = billingRecordToStatus(
  createPendingBillingRecord("acct_founder", 1200, "chk_founder"),
  "https://checkout.example/early",
  1300,
);
const paidBilling = billingRecordToStatus(
  createConfirmedBillingRecord("acct_founder", 1400, "sess_founder"),
  "https://checkout.example/early",
  1500,
);

const checks = {
  landing: {
    hasCommercialMetadata: includesAll(indexHtml, [
      "<title>BOMBA PvP",
      '<meta name="description"',
      '<link rel="icon" href="/Assets/UiLayouts/ICON.png"',
    ]),
    hasRepeatedGameEntrances: countOccurrences(indexHtml, 'href="/game"') >= 3,
    explainsPublicTrustBeforePurchase: includesAll(indexHtml, [
      'id="confianca"',
      "Produto jogavel agora",
      "Conta opcional",
      "Venda controlada",
      "Qualquer oferta paga deve mostrar preco",
    ]),
    linksLegalPagesFromTrustAndFooter: countOccurrences(indexHtml, 'href="/privacy.html"') >= 2
      && countOccurrences(indexHtml, 'href="/terms.html"') >= 2,
  },
  publicRoutes: {
    gameRouteBootstrapsRuntime: includesAll(gameHtml, [
      '<div id="app"></div>',
      'src="/src/UiLayouts/main.ts"',
    ]),
    viteBuildPublishesCommercialPages: includesAll(viteConfig, [
      'main: "./index.html"',
      'game: "./game.html"',
      'privacy: "./privacy.html"',
      'terms: "./terms.html"',
    ]),
    legalPagesCrossLinkCriticalRoutes: includesAll(privacyHtml, [
      'href="/"',
      'href="/game"',
      'href="/terms.html"',
    ]) && includesAll(termsHtml, [
      'href="/"',
      'href="/game"',
      'href="/privacy.html"',
    ]),
    legalPagesExplainControlledSale: includesAll(privacyHtml, [
      "venda controlada",
      "Pagamentos",
      "dados de cartao",
    ]) && includesAll(termsHtml, [
      "venda controlada",
      "Compras e planos",
      "checkout oficial",
      "preco",
    ]),
  },
  accountAndAccess: {
    accountValidationSupportsQuickSignup: USERNAME_MIN_LENGTH === 3
      && USERNAME_MAX_LENGTH === 16
      && USERNAME_ALLOWED_PATTERN_SOURCE === "[A-Za-z0-9_]+"
      && validCommercialUsername.ok
      && validCommercialUsername.username === "Founder_1"
      && !invalidCommercialUsername.ok,
    workerExposesAccountSessionRoutes: includesAll(workerSource, [
      '["/api/me", { methods: new Set(["GET"]), targetPath: "/internal/account/me" }]',
      '["/api/account/quick-create", { methods: new Set(["POST"]), targetPath: "/internal/account/quick-create" }]',
      '["/api/logout", { methods: new Set(["POST"]), targetPath: "/internal/account/logout" }]',
      'url.pathname === "/internal/account/me"',
      'url.pathname === "/internal/account/quick-create"',
      'url.pathname === "/internal/account/logout"',
      "handleQuickAccountCreate",
      "buildAccountSessionKey",
    ]),
    clientRendersAndWiresAccountPanel: includesAll(sessionSource, [
      'landingAccountCard.className = "experience-account-card"',
      'landingAccountPrimaryButton.addEventListener("click"',
      "void this.createQuickAccount();",
      'fetch("/api/account/quick-create"',
      'fetch("/api/logout"',
    ]) && includesAll(cssSource, [
      ".experience-account-card",
      ".experience-account__input",
    ]),
    billingModelKeepsVisitorFreePendingPaidSeparate: visitorBilling.accessLevel === "visitor"
      && visitorBilling.checkoutState === "ready"
      && freeBilling.accessLevel === "free"
      && freeBilling.checkoutState === "ready"
      && pendingBilling?.accessLevel === "free"
      && pendingBilling.checkoutState === "pending"
      && paidBilling?.accessLevel === "paid"
      && paidBilling.checkoutState === "confirmed",
  },
  checkoutAndConversion: {
    workerExposesBillingRoutesAndEnvGates: includesAll(workerSource, [
      '["/api/billing/status", { methods: new Set(["GET"]), targetPath: "/internal/billing/status" }]',
      '["/api/billing/checkout", { methods: new Set(["POST"]), targetPath: "/internal/billing/checkout" }]',
      '["/api/billing/webhook", { methods: new Set(["POST"]), targetPath: "/internal/billing/webhook" }]',
      'url.pathname === "/internal/billing/status"',
      'url.pathname === "/internal/billing/checkout"',
      'url.pathname === "/internal/billing/webhook"',
      "BILLING_CHECKOUT_URL",
      "BILLING_WEBHOOK_SECRET",
      "timingSafeEqual(providedSecret, expectedSecret)",
    ]),
    checkoutRequiresAccountAndRedirectsExternally: includesAll(sessionSource, [
      "if (!this.currentAccount)",
      "billingRequiresAccount",
      'fetch("/api/billing/checkout"',
      "window.location.href = payload.checkoutUrl;",
    ]) && includesAll(workerSource, [
      "Crie uma conta rapida antes de abrir o checkout.",
      "buildBillingCheckoutUrl",
      "client_reference_id",
    ]),
    clientRendersAndStylesBillingPanel: includesAll(sessionSource, [
      'landingBillingPanel.className = "experience-billing-panel"',
      'landingBillingButton.addEventListener("click"',
      "void this.startBillingCheckout();",
    ]) && includesAll(cssSource, [
      ".experience-billing-panel",
      ".experience-billing__status",
      ".experience-billing__hint",
    ]),
    telemetryCoversCommercialConversion: includesAll(sessionSource, [
      'this.telemetry.track("billing_status_viewed"',
      'this.telemetry.track("billing_checkout_clicked"',
      'this.telemetry.track("billing_checkout_started"',
    ]) && includesAll(workerSource, [
      '"billing_status_viewed"',
      '"billing_checkout_clicked"',
      '"billing_checkout_started"',
    ]) && telemetrySource.includes('"billing_checkout_started"'),
  },
  localizedCopy: {
    portugueseExplainsBuyPath: includesAll(JSON.stringify(SITE_COPY.pt.landing), [
      "Criar conta para comprar",
      "Crie uma conta rapida antes de abrir o checkout.",
      "Configure BILLING_CHECKOUT_URL",
    ]),
    englishExplainsBuyPath: includesAll(JSON.stringify(SITE_COPY.en.landing), [
      "Create account to buy",
      "Create a quick account before opening checkout.",
      "Set BILLING_CHECKOUT_URL",
    ]),
    paidAndUnavailableStatesAreDistinct: SITE_COPY.pt.landing.billingCtaPaid !== SITE_COPY.pt.landing.billingCtaUnavailable
      && SITE_COPY.en.landing.billingCtaPaid !== SITE_COPY.en.landing.billingCtaUnavailable
      && SITE_COPY.pt.landing.billingStatusPaid !== SITE_COPY.pt.landing.billingStatusUnavailable,
  },
};

const failedChecks = Object.entries(checks).flatMap(([sectionName, sectionChecks]) => Object.entries(sectionChecks)
  .filter(([, passed]) => !passed)
  .map(([checkName]) => `${sectionName}.${checkName}`));

const flow = [
  "visitor reads the public promise",
  "visitor opens the game route",
  "visitor can create a quick account",
  "free account can start external checkout",
  "webhook-confirmed billing status becomes paid access",
  "trust and legal pages remain published with the build",
];

const pass = failedChecks.length === 0;

console.log(JSON.stringify({
  flow,
  checks,
  failedChecks,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
