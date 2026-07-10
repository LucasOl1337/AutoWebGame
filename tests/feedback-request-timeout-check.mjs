import { readFile } from "node:fs/promises";

const {
  FEEDBACK_REQUEST_TIMEOUT_MS,
} = await import("../output/esm/NetCode/session-client.js");
const { SITE_COPY } = await import("../output/esm/UiLayouts/i18n.js");

const sessionSource = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const copySource = await readFile(new URL("../src/UiLayouts/i18n.ts", import.meta.url), "utf8");

const sourceChecks = {
  timeoutIsBounded: FEEDBACK_REQUEST_TIMEOUT_MS === 10_000,
  requestUsesAbortController: sessionSource.includes("const controller = new AbortController();")
    && sessionSource.includes("signal: controller.signal,"),
  timeoutAbortsRequest: sessionSource.includes("requestTimedOut = true;")
    && sessionSource.includes("controller.abort();"),
  timeoutIsAlwaysCleared: sessionSource.includes("window.clearTimeout(timeoutId);")
    && sessionSource.indexOf("window.clearTimeout(timeoutId);") > sessionSource.indexOf("} finally {"),
  timeoutUsesDedicatedCopy: sessionSource.includes("this.copy.landing.feedbackTimeout")
    && copySource.includes("feedbackTimeout: string;"),
  draftOnlyClearsAfterSuccess: sessionSource.indexOf('this.elements.feedbackTextarea.value = "";')
    > sessionSource.indexOf("if (!response.ok)"),
  pendingStateAlwaysRecovers: sessionSource.includes("this.feedbackRequestPending = false;")
    && sessionSource.indexOf("this.feedbackRequestPending = false;", sessionSource.indexOf("} finally {")) > 0,
};

const copyChecks = {
  portugueseExplainsPreservedDraft: SITE_COPY.pt.landing.feedbackTimeout.includes("texto foi preservado")
    && SITE_COPY.pt.landing.feedbackTimeout.includes("tente novamente"),
  englishExplainsPreservedDraft: SITE_COPY.en.landing.feedbackTimeout.includes("text was preserved")
    && SITE_COPY.en.landing.feedbackTimeout.includes("try again"),
  timeoutCopyIsLocalized: SITE_COPY.pt.landing.feedbackTimeout !== SITE_COPY.en.landing.feedbackTimeout,
};

const failedSourceChecks = Object.entries(sourceChecks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const failedCopyChecks = Object.entries(copyChecks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const pass = failedSourceChecks.length === 0 && failedCopyChecks.length === 0;

console.log(JSON.stringify({
  FEEDBACK_REQUEST_TIMEOUT_MS,
  sourceChecks,
  copyChecks,
  failedSourceChecks,
  failedCopyChecks,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
