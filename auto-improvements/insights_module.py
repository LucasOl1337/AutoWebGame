"""
insights_module.py — Pattern analysis and improvement brainstorming for BombaPVP.

This module:
1. Runs as a standalone process (or called on demand)
2. Reads accumulated match records and events from memory
3. Calls Claude (or configured provider) with the data
4. Saves a structured insight report for the manager agent

Environment variables
---------------------
INSIGHTS_PROVIDER       claude (default)
INSIGHTS_MODEL          model name
INSIGHTS_EVERY_N_MATCHES trigger insights every N matches (default 5)
INSIGHTS_POLL_SEC       how often to check if a new batch is ready (default 30)
ANTHROPIC_API_KEY       required for Claude
"""

import json
import os
import time
from pathlib import Path
from typing import Any

try:
    from memory import (
        append_event, count_matches, load_events, load_matches,
        load_insights, save_insight, MEMORY_DIR,
    )
    from model_manager import call_model, compact_line
except ModuleNotFoundError:
    from auto_improvements.memory import (
        append_event, count_matches, load_events, load_matches,
        load_insights, save_insight, MEMORY_DIR,
    )
    from auto_improvements.model_manager import call_model, compact_line


PROVIDER = compact_line(os.environ.get("INSIGHTS_PROVIDER", "claude"))
MODEL = compact_line(os.environ.get("INSIGHTS_MODEL", "claude-sonnet-4-6"))
EVERY_N_MATCHES = int(os.environ.get("INSIGHTS_EVERY_N_MATCHES", "5"))
POLL_SECONDS = float(os.environ.get("INSIGHTS_POLL_SEC", "30"))

TOOLS_DIR = Path(__file__).resolve().parent
SYSTEM_PROMPT = (TOOLS_DIR / "insights_system_prompt.txt").read_text(encoding="utf-8").strip()

# Track how many matches we last ran insights for
_CHECKPOINT_PATH = MEMORY_DIR / "insights_checkpoint.json"


def log(msg: str) -> None:
    print(f"[insights] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Checkpoint helpers
# ---------------------------------------------------------------------------

def _load_checkpoint() -> dict[str, Any]:
    if not _CHECKPOINT_PATH.exists():
        return {"lastMatchCount": 0}
    try:
        return json.loads(_CHECKPOINT_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"lastMatchCount": 0}


def _save_checkpoint(data: dict[str, Any]) -> None:
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    _CHECKPOINT_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _build_analysis_prompt(matches: list[dict[str, Any]], events: list[dict[str, Any]]) -> str:
    lines = [
        f"Total matches analyzed: {len(matches)}",
        "",
        "=== MATCH RECORDS ===",
    ]
    for i, m in enumerate(matches[-30:], 1):
        winner = m.get("winner")
        players_summary = ", ".join(
            f"P{p.get('id')} {p.get('name','?')} alive={p.get('alive')} "
            f"bombs={p.get('maxBombs')} flame={p.get('flameRange')} speed={p.get('speedLevel')}"
            for p in (m.get("players") or [])
        )
        lines.append(f"Match {i}: winner=P{winner} tick={m.get('tick')} | {players_summary}")

    lines.append("")
    lines.append("=== RECENT GAMEPLAY EVENTS ===")
    for e in events[-50:]:
        e_type = e.get("type", "?")
        if e_type == "match_ended":
            lines.append(
                f"[match_ended] P{e.get('playerId')} won={e.get('won')} "
                f"decisions={e.get('decisionsCount')} tick={e.get('tick')}"
            )
        else:
            lines.append(f"[{e_type}] {json.dumps({k: v for k, v in e.items() if k not in ('timestamp', 'timestampMs', 'savedAt')})}")

    lines.append("")
    lines.append("Analyze the above data and produce a complete improvement report following the format in your instructions.")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Core analysis function
# ---------------------------------------------------------------------------

def run_insights(force: bool = False) -> str | None:
    """
    Run an insights analysis cycle. Returns the report text on success, None if skipped.
    If force=True, runs regardless of the checkpoint.
    """
    total = count_matches()
    checkpoint = _load_checkpoint()
    last_count = checkpoint.get("lastMatchCount", 0)

    if not force and (total - last_count) < EVERY_N_MATCHES:
        log(f"skipping: only {total - last_count} new matches (need {EVERY_N_MATCHES})")
        return None

    log(f"running analysis on {total} total matches ({total - last_count} new)")

    matches = load_matches(limit=50)
    events = load_events(limit=200)

    if not matches:
        log("no match data yet, skipping")
        return None

    prompt = _build_analysis_prompt(matches, events)
    report_text, status = call_model(
        prompt,
        SYSTEM_PROMPT,
        provider=PROVIDER,
        model=MODEL,
        max_tokens=3000,
        timeout=90.0,
    )

    if status != "ok" or not report_text:
        log(f"model call failed: {status}")
        return None

    metadata = {
        "matchCount": total,
        "newMatchCount": total - last_count,
        "provider": PROVIDER,
        "model": MODEL,
    }
    path = save_insight(report_text, metadata)
    log(f"insight saved: {path.name}")

    _save_checkpoint({"lastMatchCount": total, "lastRunAt": time.strftime("%Y-%m-%dT%H:%M:%S")})

    append_event({"type": "insights_generated", "matchCount": total, "reportFile": path.name})
    return report_text


# ---------------------------------------------------------------------------
# Continuous monitoring loop
# ---------------------------------------------------------------------------

def run_loop() -> None:
    log(f"starting continuous monitor — provider={PROVIDER} model={MODEL} every {EVERY_N_MATCHES} matches")
    while True:
        try:
            run_insights()
        except KeyboardInterrupt:
            break
        except Exception as exc:
            log(f"error: {exc}")
        time.sleep(POLL_SECONDS)
    log("stopped")


def main() -> int:
    import sys
    force = "--force" in sys.argv
    if "--once" in sys.argv or force:
        result = run_insights(force=force)
        if result:
            print(result[:500] + "..." if len(result) > 500 else result)
        return 0
    run_loop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
