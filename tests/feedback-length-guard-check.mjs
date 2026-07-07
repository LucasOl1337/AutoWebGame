import { readFile } from "node:fs/promises";

const {
  FEEDBACK_MAX_LENGTH,
} = await import("../output/esm/NetCode/session-client.js");
const { SITE_COPY } = await import("../output/esm/UiLayouts/i18n.js");

const source = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const copySource = await readFile(new URL("../src/UiLayouts/i18n.ts", import.meta.url), "utf8");

const sourceChecks = {
  matchesWorkerLimit: FEEDBACK_MAX_LENGTH === 2000,
  textareaAppliesNativeLimit: source.includes("feedbackTextarea.maxLength = FEEDBACK_MAX_LENGTH;"),
  submitRejectsProgrammaticOverflow: source.includes("message.length > FEEDBACK_MAX_LENGTH"),
  submitUsesLocalizedLengthCopy: source.includes("this.copy.landing.feedbackTooLong(FEEDBACK_MAX_LENGTH)"),
  copyContractIncludesTooLong: copySource.includes("feedbackTooLong: (maxLength: number) => string;"),
};

const copyChecks = {
  portugueseMentionsLimit: SITE_COPY.pt.landing.feedbackTooLong(FEEDBACK_MAX_LENGTH).includes("2000"),
  englishMentionsLimit: SITE_COPY.en.landing.feedbackTooLong(FEEDBACK_MAX_LENGTH).includes("2000"),
};

const failedSourceChecks = Object.entries(sourceChecks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const failedCopyChecks = Object.entries(copyChecks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);

const pass = failedSourceChecks.length === 0 && failedCopyChecks.length === 0;

console.log(JSON.stringify({
  FEEDBACK_MAX_LENGTH,
  sourceChecks,
  copyChecks,
  failedSourceChecks,
  failedCopyChecks,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
