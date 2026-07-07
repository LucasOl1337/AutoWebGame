import { readFile } from "node:fs/promises";

const {
  FEEDBACK_MAX_LENGTH,
} = await import("../output/esm/NetCode/session-client.js");
const { SITE_COPY } = await import("../output/esm/UiLayouts/i18n.js");

const sessionSource = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const copySource = await readFile(new URL("../src/UiLayouts/i18n.ts", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");

const sourceChecks = {
  counterElementIsTracked: sessionSource.includes("feedbackCounter: HTMLParagraphElement;"),
  textareaDescribesCounterAndStatus: sessionSource.includes('feedbackTextarea.setAttribute("aria-describedby", "experience-feedback-counter experience-feedback-status");'),
  inputRefreshesCounter: sessionSource.includes('feedbackTextarea.addEventListener("input"') && sessionSource.includes("this.renderFeedbackDialog();"),
  sendDisablesUntilMessageReady: sessionSource.includes("feedbackSendButton.disabled = this.feedbackRequestPending || !messageReady;"),
  emptySubmitUsesLocalizedCopy: sessionSource.includes("this.copy.landing.feedbackEmpty"),
  escapeClosesFromDialog: sessionSource.includes('feedbackDialog.addEventListener("keydown"') && sessionSource.includes('event.key === "Escape"'),
  counterCopyContractExists: copySource.includes("feedbackCharactersRemaining: (remaining: number) => string;")
    && copySource.includes("feedbackCharactersOverLimit: (overLimitBy: number, maxLength: number) => string;"),
  counterCssExists: cssSource.includes(".experience-feedback__counter")
    && cssSource.includes(".experience-feedback__counter--invalid")
    && cssSource.includes("color: var(--danger);"),
};

const copyChecks = {
  portugueseRemainingMentionsCount: SITE_COPY.pt.landing.feedbackCharactersRemaining(FEEDBACK_MAX_LENGTH).includes("2000"),
  englishRemainingMentionsCount: SITE_COPY.en.landing.feedbackCharactersRemaining(FEEDBACK_MAX_LENGTH).includes("2000"),
  portugueseOverLimitMentionsLimit: SITE_COPY.pt.landing.feedbackCharactersOverLimit(3, FEEDBACK_MAX_LENGTH).includes("2000"),
  englishOverLimitMentionsLimit: SITE_COPY.en.landing.feedbackCharactersOverLimit(3, FEEDBACK_MAX_LENGTH).includes("2000"),
  emptyCopyIsLocalized: SITE_COPY.pt.landing.feedbackEmpty !== SITE_COPY.en.landing.feedbackEmpty,
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
