import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../src/UiLayouts/legacy-bootstrap.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../src/UiLayouts/main.css", import.meta.url), "utf8");

const checks = {
  loadingRendersBeforeArenaFetch: /renderBootstrapLoading\(rootElement\);\s*const activeArena/s.test(source),
  loadingExposesBusyState: /setAttribute\("aria-busy", "true"\)/.test(source),
  statusIsAnnouncedAccessibly: /setAttribute\("aria-live", state === "error" \? "assertive" : "polite"\)/.test(source)
    && /setAttribute\("role", state === "error" \? "alert" : "status"\)/.test(source),
  failureIsCaught: /catch \(error\) \{[\s\S]*renderBootstrapFailure\(root\);/.test(source),
  retryReloadsAndReceivesFocus: /window\.location\.reload\(\)/.test(source)
    && /requestAnimationFrame\(\(\) => retry\.focus\(\)\)/.test(source),
  copySupportsPortugueseAndEnglish: source.includes("A arena nao carregou")
    && source.includes("The arena did not load")
    && source.includes("Tentar novamente")
    && source.includes("Try again"),
  errorDoesNotExposeRawException: !source.includes("error.message")
    && !source.includes("String(error)")
    && !source.includes("textContent = error"),
  reducedMotionIsRespected: css.includes("@media (prefers-reduced-motion: reduce)")
    && css.includes(".bootstrap-state__indicator")
    && css.includes("animation: none"),
  retryHasVisibleKeyboardFocus: css.includes(".bootstrap-state__retry:focus-visible"),
};

const failedChecks = Object.entries(checks)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const pass = failedChecks.length === 0;

console.log(JSON.stringify({ checks, failedChecks, pass }, null, 2));

if (!pass) {
  process.exit(1);
}
