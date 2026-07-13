import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/UiLayouts/main.ts", import.meta.url), "utf8");

const loadingIndex = source.indexOf('rootElement.setAttribute("aria-busy", "true")');
const statusIndex = source.indexOf('role="status" aria-live="polite"');
const assetsIndex = source.indexOf("const assets = await loadGameAssets(activeArena.themeId)");
const clearBusyIndex = source.indexOf('rootElement.removeAttribute("aria-busy")');
const clearStatusIndex = source.indexOf("rootElement.replaceChildren()");
const gameIndex = source.indexOf("const game = new GameApp(rootElement, assets, activeArena)");

const checks = {
  exposesBusyStateBeforeAsyncSetup: loadingIndex >= 0 && loadingIndex < assetsIndex,
  announcesLoadingPolitely: statusIndex >= 0 && statusIndex < assetsIndex,
  clearsBusyStateAfterAssets: assetsIndex < clearBusyIndex,
  removesTemporaryStatusBeforeGameMount: clearBusyIndex < clearStatusIndex && clearStatusIndex < gameIndex,
};

const failedChecks = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const pass = failedChecks.length === 0;

console.log(JSON.stringify({ checks, failedChecks, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
