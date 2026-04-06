"""
manager_agent.py — Organizes insight reports into a prioritized improvement task queue.

This agent:
1. Reads all available insight reports from memory
2. Reads the current pending task list to avoid duplicates
3. Calls Claude with the insights + existing tasks
4. Parses the response into structured tasks
5. Saves new tasks to the task queue (consumed by worker_agent.py)

Run modes
---------
python manager_agent.py           continuous loop, checks for new insights
python manager_agent.py --once    run one pass and exit

Environment variables
---------------------
MANAGER_PROVIDER    claude (default)
MANAGER_MODEL       model name
MANAGER_POLL_SEC    how often to check for new insights (default 60)
ANTHROPIC_API_KEY   required for Claude
"""

import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

try:
    from memory import (
        append_event, load_insights, latest_insight_text,
        load_tasks, save_tasks, append_pending_task, pending_tasks, MEMORY_DIR,
    )
    from model_manager import call_model, compact_line
except ModuleNotFoundError:
    from auto_improvements.memory import (
        append_event, load_insights, latest_insight_text,
        load_tasks, save_tasks, append_pending_task, pending_tasks, MEMORY_DIR,
    )
    from auto_improvements.model_manager import call_model, compact_line


PROVIDER = compact_line(os.environ.get("MANAGER_PROVIDER", "claude"))
MODEL = compact_line(os.environ.get("MANAGER_MODEL", "claude-sonnet-4-6"))
POLL_SECONDS = float(os.environ.get("MANAGER_POLL_SEC", "60"))

TOOLS_DIR = Path(__file__).resolve().parent
SYSTEM_PROMPT = (TOOLS_DIR / "manager_system_prompt.txt").read_text(encoding="utf-8").strip()

_CHECKPOINT_PATH = MEMORY_DIR / "manager_checkpoint.json"


def log(msg: str) -> None:
    print(f"[manager] {msg}", flush=True)


# ---------------------------------------------------------------------------
# Checkpoint
# ---------------------------------------------------------------------------

def _load_checkpoint() -> dict[str, Any]:
    if not _CHECKPOINT_PATH.exists():
        return {"lastInsightFile": ""}
    try:
        return json.loads(_CHECKPOINT_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"lastInsightFile": ""}


def _save_checkpoint(data: dict[str, Any]) -> None:
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    _CHECKPOINT_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _build_prompt(insight_texts: list[str], existing_tasks: list[dict[str, Any]]) -> str:
    lines = []

    lines.append("=== INSIGHT REPORTS (most recent first) ===")
    for i, text in enumerate(reversed(insight_texts[-3:]), 1):
        lines.append(f"\n--- Insight {i} ---")
        lines.append(text[:4000])  # cap at 4k chars each

    if existing_tasks:
        lines.append("\n=== EXISTING PENDING TASKS (do not duplicate) ===")
        for t in existing_tasks:
            lines.append(
                f"- [{t.get('id')}] {t.get('category')}: {t.get('title')}"
            )

    lines.append("\nBased on the insight reports above, generate the prioritized task list as a JSON array.")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Task parsing and validation
# ---------------------------------------------------------------------------

VALID_CATEGORIES = {"bot-ai", "game-balance", "arena", "characters", "ui", "new-feature"}
VALID_CHANGE_TYPES = {"modify", "add", "refactor"}


def _parse_tasks(raw: str) -> list[dict[str, Any]]:
    text = raw.strip()
    # strip markdown fences
    if "```" in text:
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            text = text[start:end]
    # find JSON array
    start = text.find("[")
    end = text.rfind("]") + 1
    if start < 0 or end <= start:
        return []
    try:
        data = json.loads(text[start:end])
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []

    valid = []
    for item in data:
        if not isinstance(item, dict):
            continue
        task = {
            "id": str(item.get("id") or uuid.uuid4().hex[:8]),
            "priority": max(1, min(10, int(item.get("priority", 5) or 5))),
            "category": str(item.get("category", "bot-ai")) if item.get("category") in VALID_CATEGORIES else "bot-ai",
            "title": str(item.get("title", ""))[:120],
            "description": str(item.get("description", ""))[:500],
            "targetFile": str(item.get("targetFile", ""))[:200],
            "changeType": str(item.get("changeType", "modify")) if item.get("changeType") in VALID_CHANGE_TYPES else "modify",
            "evidence": str(item.get("evidence", ""))[:300],
            "expectedImpact": str(item.get("expectedImpact", ""))[:200],
        }
        if task["title"]:
            valid.append(task)
    return valid


# ---------------------------------------------------------------------------
# Core run function
# ---------------------------------------------------------------------------

def run_manager(force: bool = False) -> int:
    """Run one manager pass. Returns number of new tasks added."""
    insights = load_insights(limit=5)
    if not insights:
        log("no insight reports found, skipping")
        return 0

    checkpoint = _load_checkpoint()
    latest_file = insights[-1][0].name if insights else ""

    if not force and latest_file == checkpoint.get("lastInsightFile"):
        log("no new insight reports, skipping")
        return 0

    log(f"processing {len(insights)} insight report(s)")

    insight_texts = [text for _, text in insights]
    existing = pending_tasks()

    prompt = _build_prompt(insight_texts, existing)
    raw, status = call_model(
        prompt,
        SYSTEM_PROMPT,
        provider=PROVIDER,
        model=MODEL,
        max_tokens=2000,
        timeout=60.0,
    )

    if status != "ok" or not raw:
        log(f"model call failed: {status}")
        return 0

    new_tasks = _parse_tasks(raw)
    if not new_tasks:
        log("no valid tasks parsed from response")
        return 0

    # Deduplicate by id against existing
    existing_ids = {t.get("id") for t in existing}
    added = 0
    for task in new_tasks[:8]:
        if task["id"] in existing_ids:
            continue
        append_pending_task(task)
        existing_ids.add(task["id"])
        added += 1
        log(f"  added task [{task['id']}] p={task['priority']} {task['category']}: {task['title'][:60]}")

    _save_checkpoint({"lastInsightFile": latest_file, "lastRunAt": time.strftime("%Y-%m-%dT%H:%M:%S")})
    append_event({"type": "manager_tasks_added", "count": added, "totalPending": len(existing) + added})
    log(f"added {added} new tasks")
    return added


# ---------------------------------------------------------------------------
# List / show tasks
# ---------------------------------------------------------------------------

def show_tasks() -> None:
    data = load_tasks()
    tasks = data.get("tasks", [])
    if not tasks:
        print("No tasks in queue.")
        return
    print(f"\nTask Queue ({len(tasks)} total)\n")
    for t in sorted(tasks, key=lambda x: (-x.get("priority", 0), x.get("createdAt", ""))):
        status = t.get("status", "pending")
        marker = "[DONE]" if status == "completed" else f"[p={t.get('priority', '?')}]"
        print(f"  {marker} {t.get('id')} — {t.get('category')} — {t.get('title')}")
        if status != "completed":
            print(f"         File: {t.get('targetFile')} | Impact: {t.get('expectedImpact','?')[:80]}")
    print()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def run_loop() -> None:
    log(f"starting — provider={PROVIDER} model={MODEL}")
    while True:
        try:
            run_manager()
        except KeyboardInterrupt:
            break
        except Exception as exc:
            log(f"error: {exc}")
        time.sleep(POLL_SECONDS)
    log("stopped")


def main() -> int:
    import sys
    if "--tasks" in sys.argv:
        show_tasks()
        return 0
    force = "--force" in sys.argv
    if "--once" in sys.argv or force:
        run_manager(force=force)
        return 0
    run_loop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
