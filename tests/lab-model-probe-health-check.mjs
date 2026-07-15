import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const python = process.env.PYTHON || "python";
const script = String.raw`
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path.cwd()
sys.path.insert(0, str(root / "auto-improvements"))

import bot_menu
import model_manager

def run_probe(text, status, elapsed_ms):
    ticks = iter((100.0, 100.0 + elapsed_ms / 1000.0))
    model_manager.monotonic = lambda: next(ticks)
    model_manager.call_model = lambda *args, **kwargs: (text, status)
    return model_manager.probe_model("9router", "configured/model")

exact = run_probe("OK", "ok", 25)
wrong = run_probe("READY BUT NOT VERIFIED", "ok", 31)
network = run_probe(None, "openrouter_network:timed out", 15000)

assert exact["status"] == "ready", exact
assert exact["resultCode"] == "ok", exact
assert exact["latencyMs"] == 25, exact
assert exact["validatedAt"].endswith("+00:00"), exact

assert wrong["status"] == "error", wrong
assert wrong["resultCode"] == "unexpected_reply", wrong
assert "exact OK" in wrong["message"], wrong
assert wrong["latencyMs"] == 31, wrong

assert network["status"] == "error", network
assert network["resultCode"] == "openrouter_network:timed out", network
assert network["latencyMs"] == 15000, network

validation = {
    **exact,
    "validatedAt": "2026-07-14T22:00:00+00:00",
}
profile = {
    "provider": "9router",
    "model": "configured/model",
    "modelValidation": validation,
}
now = datetime(2026, 7, 14, 22, 2, tzinfo=timezone.utc)
ready = bot_menu.model_validation_summary(profile, now=now)
assert ready["status"] == "ready", ready
assert ready["label"] == "READY · 25ms · 2m", ready
assert "validated" in ready["detail"].lower(), ready

stale = bot_menu.model_validation_summary(
    profile,
    now=datetime(2026, 7, 14, 22, 16, 1, tzinfo=timezone.utc),
)
assert stale["status"] == "stale", stale
assert stale["label"] == "STALE · 25ms · 16m", stale
assert "Validate model now" in stale["detail"], stale

mismatched = bot_menu.model_validation_summary(
    {**profile, "model": "configured/other"},
    now=now,
)
assert mismatched["status"] == "stale", mismatched
assert "configuration changed" in mismatched["detail"], mismatched

account_badge = bot_menu.account_validation_badge({"status": "ready", "message": "auth ok"})
assert "READY" in account_badge, account_badge
assert "STALE" not in account_badge, account_badge
malformed_account_badge = bot_menu.account_validation_badge("ready")
assert "UNVALIDATED" in malformed_account_badge, malformed_account_badge

print(json.dumps({
    "exact": exact,
    "wrong": wrong,
    "network": network,
    "readySummary": ready,
    "staleSummary": stale,
    "mismatchSummary": mismatched,
    "accountBadge": account_badge,
    "malformedAccountBadge": malformed_account_badge,
}, ensure_ascii=False))
`;

const result = spawnSync(python, ["-c", script], {
  cwd: projectRoot,
  encoding: "utf8",
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
});

if (result.status !== 0) {
  console.error(result.stdout);
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
assert.equal(report.exact.status, "ready");
assert.equal(report.wrong.status, "error");
assert.equal(report.readySummary.status, "ready");
assert.equal(report.staleSummary.status, "stale");
assert.equal(report.mismatchSummary.status, "stale");
assert.match(report.accountBadge, /READY/);
assert.match(report.malformedAccountBadge, /UNVALIDATED/);

console.log(JSON.stringify({ ...report, pass: true }, null, 2));
