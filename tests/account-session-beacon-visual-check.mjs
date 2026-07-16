import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pageSource = await readFile(new URL("../src/Auth/account-page.ts", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/Auth/account-session-beacon.css", import.meta.url), "utf8");

assert.ok(pageSource.includes('import "./account-session-beacon.css";'), "account page must load the beacon styles");
assert.ok(pageSource.includes('aria-label="Prontidão para a arena"'), "beacon needs an accessible label");
for (const state of ["Sessão", "Perfil", "Arena", "PROTEGIDA", "SINCRONIZADO", "DISPONÍVEL"]) {
  assert.ok(pageSource.includes(state), `missing beacon state: ${state}`);
}
for (const rule of [
  ".account-session__beacon-grid",
  "grid-template-columns: repeat(3",
  "grid-template-columns: 1fr",
  "@keyframes account-beacon-scan",
  "@keyframes account-beacon-pulse",
  "@media (prefers-reduced-motion: reduce)",
  "text-overflow: ellipsis",
]) {
  assert.ok(styles.includes(rule), `missing visual safeguard: ${rule}`);
}

console.log("account session beacon visual contract: ok");
