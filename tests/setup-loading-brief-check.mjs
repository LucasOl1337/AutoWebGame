import { readFile } from "node:fs/promises";

const { SITE_COPY } = await import("../output/esm/UiLayouts/i18n.js");
const { formatSetupLoadingBrief } = await import("../output/esm/NetCode/session-client.js");

const quickMatchBrief = formatSetupLoadingBrief(SITE_COPY.pt, {
  mode: "quick-match",
  onlineUsers: 12,
  queuedCount: 3,
  roomCode: null,
  realtimeReady: true,
});

const inviteBrief = formatSetupLoadingBrief(SITE_COPY.en, {
  mode: "invite",
  onlineUsers: 0,
  queuedCount: 0,
  roomCode: "AB12",
  realtimeReady: false,
});

const endlessBrief = formatSetupLoadingBrief(SITE_COPY.en, {
  mode: "endless",
  onlineUsers: 8,
  queuedCount: 0,
  roomCode: null,
  realtimeReady: true,
});

const source = await readFile(new URL("../src/NetCode/session-client.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");

const checks = {
  quickMatchShowsOnlineAndQueue: quickMatchBrief.steps[0]?.text.includes("12 jogadores")
    && quickMatchBrief.steps[1]?.text.includes("3 na fila")
    && quickMatchBrief.primaryLabel === SITE_COPY.pt.setup.loadingCancelSearch,
  inviteCanReturnHome: inviteBrief.steps[0]?.state === "active"
    && inviteBrief.steps[1]?.text.includes("AB12")
    && inviteBrief.primaryLabel === SITE_COPY.en.setup.loadingBackHome,
  endlessUsesLiveArenaCopy: endlessBrief.steps[1]?.text === SITE_COPY.en.setup.loadingEndlessRoom
    && endlessBrief.hint === SITE_COPY.en.setup.loadingBackHomeHint,
  setupPrimaryCancelsPendingEntry: /if \(!lobby\) \{\s*this\.cancelPendingSetupEntry\(\);\s*return;\s*\}/m.test(source),
  setupBackUsesSharedCancel: /setupBackButton\.addEventListener\("click"[\s\S]*this\.cancelPendingSetupEntry\(\);/m.test(source),
  setupLeaveUsesSharedCancel: /setupLeaveButton\.addEventListener\("click"[\s\S]*this\.cancelPendingSetupEntry\(\);/m.test(source),
  loadingPillCssExists: css.includes(".experience-seat-pill--loading")
    && css.includes('[data-state="active"]')
    && css.includes('[data-state="ready"]'),
};

const failedChecks = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const pass = failedChecks.length === 0;

console.log(JSON.stringify({
  checks,
  failedChecks,
  quickMatchBrief,
  inviteBrief,
  endlessBrief,
  pass,
}, null, 2));

if (!pass) {
  process.exit(1);
}
