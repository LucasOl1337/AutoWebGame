"""
memory.py — Persistent telemetry and event storage for auto-improvements.

All data lives inside auto-improvements/bot_memory/ so it stays separate
from the main game source tree.
"""

import json
import time
from copy import deepcopy
from pathlib import Path
from typing import Any


MEMORY_DIR = Path(__file__).resolve().parent / "bot_memory"
EVENTS_LOG = MEMORY_DIR / "events.jsonl"
MATCHES_LOG = MEMORY_DIR / "matches.jsonl"
INSIGHTS_DIR = MEMORY_DIR / "insights"
TASKS_PATH = MEMORY_DIR / "tasks.json"
WORKER_LOG = MEMORY_DIR / "worker_log.jsonl"


def _ensure_dirs() -> None:
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    INSIGHTS_DIR.mkdir(parents=True, exist_ok=True)


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


# ---------------------------------------------------------------------------
# JSONL helpers
# ---------------------------------------------------------------------------

def _append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    _ensure_dirs()
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=True) + "\n")


def _load_jsonl(path: Path, limit: int = 0) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    lines = [line for line in raw.splitlines() if line.strip()]
    results: list[dict[str, Any]] = []
    for line in lines:
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            results.append(item)
    if limit > 0:
        return results[-limit:]
    return results


def _load_json(path: Path, fallback: Any = None) -> Any:
    if not path.exists():
        return deepcopy(fallback) if fallback is not None else None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return deepcopy(fallback) if fallback is not None else None


def _save_json(path: Path, payload: Any) -> None:
    _ensure_dirs()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

def append_event(event: dict[str, Any]) -> None:
    """Append a notable game event to persistent log."""
    _append_jsonl(EVENTS_LOG, {**event, "savedAt": now_iso()})


def load_events(limit: int = 200) -> list[dict[str, Any]]:
    return _load_jsonl(EVENTS_LOG, limit)


# ---------------------------------------------------------------------------
# Match records
# ---------------------------------------------------------------------------

def append_match(record: dict[str, Any]) -> None:
    """Append a completed match record."""
    _append_jsonl(MATCHES_LOG, {**record, "savedAt": now_iso()})


def load_matches(limit: int = 100) -> list[dict[str, Any]]:
    return _load_jsonl(MATCHES_LOG, limit)


def count_matches() -> int:
    if not MATCHES_LOG.exists():
        return 0
    try:
        lines = [l for l in MATCHES_LOG.read_text(encoding="utf-8").splitlines() if l.strip()]
    except OSError:
        return 0
    return len(lines)


# ---------------------------------------------------------------------------
# Insight reports
# ---------------------------------------------------------------------------

def save_insight(report_text: str, metadata: dict[str, Any] | None = None) -> Path:
    """Save an insight report file and return its path."""
    _ensure_dirs()
    ts = time.strftime("%Y%m%d_%H%M%S")
    path = INSIGHTS_DIR / f"insight_{ts}.md"
    header = ""
    if metadata:
        header = "<!-- " + json.dumps(metadata, ensure_ascii=True) + " -->\n\n"
    path.write_text(header + report_text, encoding="utf-8")
    return path


def load_insights(limit: int = 10) -> list[tuple[Path, str]]:
    """Return (path, text) for recent insight files, newest last."""
    _ensure_dirs()
    files = sorted(INSIGHTS_DIR.glob("insight_*.md"), key=lambda p: p.stat().st_mtime)
    files = files[-limit:]
    results = []
    for f in files:
        try:
            results.append((f, f.read_text(encoding="utf-8")))
        except OSError:
            continue
    return results


def latest_insight_text() -> str:
    insights = load_insights(limit=1)
    return insights[-1][1] if insights else ""


# ---------------------------------------------------------------------------
# Task queue (manager ↔ worker)
# ---------------------------------------------------------------------------

DEFAULT_TASKS: dict[str, Any] = {"tasks": [], "updatedAt": ""}


def load_tasks() -> dict[str, Any]:
    return _load_json(TASKS_PATH, fallback=DEFAULT_TASKS)  # type: ignore[return-value]


def save_tasks(tasks_data: dict[str, Any]) -> None:
    tasks_data["updatedAt"] = now_iso()
    _save_json(TASKS_PATH, tasks_data)


def append_pending_task(task: dict[str, Any]) -> None:
    data = load_tasks()
    data["tasks"].append({**task, "status": "pending", "createdAt": now_iso()})
    save_tasks(data)


def mark_task_done(task_id: str, notes: str = "") -> None:
    data = load_tasks()
    for t in data["tasks"]:
        if t.get("id") == task_id:
            t["status"] = "completed"
            t["completedAt"] = now_iso()
            if notes:
                t["completionNotes"] = notes
            break
    save_tasks(data)


def pending_tasks() -> list[dict[str, Any]]:
    data = load_tasks()
    return [t for t in data.get("tasks", []) if t.get("status") == "pending"]


# ---------------------------------------------------------------------------
# Worker log
# ---------------------------------------------------------------------------

def log_worker_action(action: dict[str, Any]) -> None:
    _append_jsonl(WORKER_LOG, {**action, "timestamp": now_iso()})
