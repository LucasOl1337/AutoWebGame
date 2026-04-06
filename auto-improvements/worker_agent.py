"""
worker_agent.py — Reads the task queue and applies code improvements to the game.

This agent:
1. Loads pending tasks from memory/tasks.json (highest priority first)
2. For each task, reads the target TypeScript source file
3. Calls Claude/Codex with the task description + file content
4. Validates the response (must be raw TypeScript, no fences)
5. Writes the improved file back to disk
6. Marks the task as completed

IMPORTANT: This agent writes to game source files. Run with caution.
Use --dry-run to preview changes without writing.
Use --task <id> to run a specific task only.

Environment variables
---------------------
WORKER_PROVIDER     claude (default)
WORKER_MODEL        model name
WORKER_DRY_RUN      1 = dry run (no file writes)
WORKER_AUTO_COMMIT  1 = auto git commit after each change
ANTHROPIC_API_KEY   required for Claude
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

try:
    from memory import load_tasks, mark_task_done, log_worker_action, pending_tasks, MEMORY_DIR
    from model_manager import call_model, compact_line
except ModuleNotFoundError:
    from auto_improvements.memory import load_tasks, mark_task_done, log_worker_action, pending_tasks, MEMORY_DIR
    from auto_improvements.model_manager import call_model, compact_line


PROVIDER = compact_line(os.environ.get("WORKER_PROVIDER", "claude"))
MODEL = compact_line(os.environ.get("WORKER_MODEL", "claude-opus-4-6"))
DRY_RUN = os.environ.get("WORKER_DRY_RUN", "0") == "1"
AUTO_COMMIT = os.environ.get("WORKER_AUTO_COMMIT", "0") == "1"

# Game root is one level up from auto-improvements/
GAME_ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = Path(__file__).resolve().parent
SYSTEM_PROMPT = (TOOLS_DIR / "worker_system_prompt.txt").read_text(encoding="utf-8").strip()


def log(msg: str) -> None:
    prefix = "[worker:DRY]" if DRY_RUN else "[worker]"
    print(f"{prefix} {msg}", flush=True)


# ---------------------------------------------------------------------------
# File helpers
# ---------------------------------------------------------------------------

def _resolve_target(target_file: str) -> Path | None:
    """Resolve a relative target file path to an absolute path within the game root."""
    if not target_file:
        return None
    clean = target_file.lstrip("/").replace("\\", "/")
    path = GAME_ROOT / clean
    return path if path.exists() else None


def _read_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as exc:
        return f"// ERROR reading file: {exc}"


def _write_file(path: Path, content: str) -> None:
    if DRY_RUN:
        log(f"  [DRY] would write {len(content)} chars to {path.relative_to(GAME_ROOT)}")
        return
    path.write_text(content, encoding="utf-8")
    log(f"  wrote {path.relative_to(GAME_ROOT)}")


# ---------------------------------------------------------------------------
# Git commit helper
# ---------------------------------------------------------------------------

def _git_commit(task: dict[str, Any]) -> None:
    if DRY_RUN or not AUTO_COMMIT:
        return
    msg = f"auto-improve [{task.get('id')}]: {task.get('title', 'improvement')}\n\nCategory: {task.get('category')}\nFile: {task.get('targetFile')}\nEvidence: {task.get('evidence', '')[:120]}"
    try:
        subprocess.run(["git", "add", "-A"], cwd=str(GAME_ROOT), check=False, capture_output=True)
        subprocess.run(["git", "commit", "-m", msg], cwd=str(GAME_ROOT), check=False, capture_output=True)
        log(f"  committed: {task.get('id')}")
    except Exception as exc:
        log(f"  git commit failed: {exc}")


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------

def _build_prompt(task: dict[str, Any], file_content: str) -> str:
    lines = [
        f"TASK ID: {task.get('id')}",
        f"CATEGORY: {task.get('category')}",
        f"TITLE: {task.get('title')}",
        f"DESCRIPTION: {task.get('description')}",
        f"TARGET FILE: {task.get('targetFile')}",
        f"CHANGE TYPE: {task.get('changeType')}",
        f"EVIDENCE: {task.get('evidence')}",
        f"EXPECTED IMPACT: {task.get('expectedImpact')}",
        "",
        "=== CURRENT FILE CONTENT ===",
        file_content,
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Response validation
# ---------------------------------------------------------------------------

def _validate_response(raw: str, original: str) -> tuple[str | None, str]:
    """Returns (cleaned_content, error_or_ok)."""
    text = raw.strip()

    if text.startswith("SKIP:"):
        return None, text

    # Reject if it still has markdown fences
    if text.startswith("```"):
        # Try to extract the content between fences
        lines = text.splitlines()
        start = next((i + 1 for i, l in enumerate(lines) if l.startswith("```")), 0)
        end = next((i for i in range(len(lines) - 1, 0, -1) if lines[i].startswith("```")), len(lines))
        text = "\n".join(lines[start:end]).strip()
        if not text:
            return None, "empty_after_fence_strip"

    if len(text) < 50:
        return None, f"suspiciously_short:{len(text)}"

    # Sanity: should look like TypeScript (has at least one import or export or function)
    ts_markers = ["import ", "export ", "function ", "const ", "class ", "interface "]
    if not any(m in text for m in ts_markers):
        return None, "no_ts_markers"

    # Should not be dramatically shorter than original (avoid accidental deletion)
    if len(text) < len(original) * 0.5:
        return None, f"too_short:{len(text)}_vs_original:{len(original)}"

    return text, "ok"


# ---------------------------------------------------------------------------
# Execute a single task
# ---------------------------------------------------------------------------

def execute_task(task: dict[str, Any], *, dry_run: bool = DRY_RUN) -> bool:
    task_id = task.get("id", "?")
    target_file = task.get("targetFile", "")
    log(f"executing task [{task_id}] {task.get('title','?')[:60]}")
    log(f"  target: {target_file}")

    path = _resolve_target(target_file)
    if path is None:
        log(f"  SKIP: target file not found: {target_file}")
        log_worker_action({"taskId": task_id, "result": "skip", "reason": f"file_not_found:{target_file}"})
        return False

    original = _read_file(path)
    prompt = _build_prompt(task, original)

    log(f"  calling model ({PROVIDER}/{MODEL or 'default'}) ...")
    raw, status = call_model(
        prompt,
        SYSTEM_PROMPT,
        provider=PROVIDER,
        model=MODEL,
        max_tokens=8000,
        timeout=120.0,
    )

    if status != "ok" or not raw:
        log(f"  model call failed: {status}")
        log_worker_action({"taskId": task_id, "result": "model_error", "reason": status})
        return False

    content, validation = _validate_response(raw, original)

    if validation.startswith("SKIP:"):
        log(f"  agent decided to skip: {validation}")
        log_worker_action({"taskId": task_id, "result": "agent_skip", "reason": validation})
        return False

    if content is None:
        log(f"  response validation failed: {validation}")
        log_worker_action({"taskId": task_id, "result": "validation_failed", "reason": validation})
        return False

    if dry_run:
        log(f"  [DRY] response looks valid ({len(content)} chars)")
        diff_lines = sum(1 for a, b in zip(original.splitlines(), content.splitlines()) if a != b)
        log(f"  [DRY] approx {diff_lines} lines changed")
        log_worker_action({"taskId": task_id, "result": "dry_run", "charCount": len(content)})
        return True

    _write_file(path, content)
    mark_task_done(task_id, notes=f"Applied by worker_agent at {time.strftime('%Y-%m-%dT%H:%M:%S')}")
    _git_commit(task)
    log_worker_action({"taskId": task_id, "result": "applied", "file": str(path.relative_to(GAME_ROOT))})
    log(f"  DONE task [{task_id}]")
    return True


# ---------------------------------------------------------------------------
# Run all pending tasks
# ---------------------------------------------------------------------------

def run_all(specific_id: str = "", dry_run: bool = DRY_RUN) -> int:
    tasks = pending_tasks()
    if not tasks:
        log("no pending tasks")
        return 0

    if specific_id:
        tasks = [t for t in tasks if t.get("id") == specific_id]
        if not tasks:
            log(f"task not found: {specific_id}")
            return 0

    # Sort: highest priority first
    tasks.sort(key=lambda t: -int(t.get("priority", 5) or 5))

    log(f"running {len(tasks)} task(s) — dry_run={dry_run}")
    applied = 0
    for task in tasks:
        success = execute_task(task, dry_run=dry_run)
        if success and not dry_run:
            applied += 1
        # Small delay between tasks to avoid rate limits
        time.sleep(2.0)

    log(f"done — {applied}/{len(tasks)} applied")
    return applied


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    args = sys.argv[1:]
    dry = "--dry-run" in args or DRY_RUN
    specific = ""
    if "--task" in args:
        idx = args.index("--task")
        if idx + 1 < len(args):
            specific = args[idx + 1]

    if "--tasks" in args:
        # Just list tasks without running
        tasks = pending_tasks()
        if not tasks:
            print("No pending tasks.")
        for t in sorted(tasks, key=lambda x: -x.get("priority", 0)):
            print(f"  [{t.get('id')}] p={t.get('priority')} {t.get('category')}: {t.get('title')}")
            print(f"       file: {t.get('targetFile')}")
        return 0

    run_all(specific_id=specific, dry_run=dry)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
