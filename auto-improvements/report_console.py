"""
report_console.py — Live terminal dashboard for BombaPVP auto-improvements.

Polls the broker every second and renders a live status display showing:
- Current game state (phase, tick, players, bombs)
- Latest AI bot decisions with reasons
- Recent events
- Match statistics
- Task queue status

Run in a separate terminal window or launched automatically by mainbot.py.
"""

import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen

try:
    from memory import count_matches, load_insights, pending_tasks, MEMORY_DIR
except ModuleNotFoundError:
    from auto_improvements.memory import count_matches, load_insights, pending_tasks, MEMORY_DIR


BROKER_BASE = os.environ.get("BROKER_BASE", "http://127.0.0.1:8765").rstrip("/")
REFRESH_SECONDS = float(os.environ.get("CONSOLE_REFRESH_SEC", "1.0"))


def now_ms() -> int:
    return int(time.time() * 1000)


def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")


# ANSI colors
def _c(text: str, code: str) -> str:
    return f"\x1b[{code}m{text}\x1b[0m"


def green(t: str) -> str:
    return _c(t, "92")


def red(t: str) -> str:
    return _c(t, "91")


def yellow(t: str) -> str:
    return _c(t, "93")


def cyan(t: str) -> str:
    return _c(t, "96")


def bold(t: str) -> str:
    return _c(t, "1")


def _fetch_report() -> dict[str, Any] | None:
    try:
        with urlopen(f"{BROKER_BASE}/report", timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("report") if data.get("ok") else None
    except Exception:
        return None


def _phase_color(phase: str) -> str:
    if phase == "match":
        return green(phase)
    if phase == "match-result":
        return yellow(phase)
    return phase


def _direction_arrow(d: str | None) -> str:
    arrows = {"up": "↑", "down": "↓", "left": "←", "right": "→"}
    return arrows.get(str(d or ""), "·")


def _format_decision(d: dict[str, Any]) -> str:
    arrow = _direction_arrow(d.get("direction"))
    bomb = "💣" if d.get("placeBomb") else "  "
    det = "💥" if d.get("detonate") else "  "
    reason = str(d.get("reason", ""))[:55]
    return f"{arrow} {bomb}{det} {reason}"


def render(report: dict[str, Any] | None, last_report_at: int, broker_available: bool) -> None:
    clear_screen()
    print(bold("═══ BombaPVP AutoBot Dashboard ═══"))
    print()

    if not broker_available:
        print(red("● Broker OFFLINE") + f"  ({BROKER_BASE})")
        print()
        print("Start mainbot.py to begin.")
        return

    age_ms = now_ms() - last_report_at if last_report_at else -1
    age_str = f"{age_ms/1000:.1f}s ago" if age_ms >= 0 else "never"

    print(green("● Broker ONLINE") + f"  last report: {age_str}")
    print()

    if not report:
        print("Waiting for telemetry...")
        return

    phase = str(report.get("phase", "-") or "-")
    tick = report.get("tick", "-")
    active = report.get("activePlayers", 0)
    match_count = count_matches()
    pending = pending_tasks()

    print(f"Phase: {_phase_color(phase)}   Tick: {cyan(str(tick))}   Active players: {active}")
    print(f"Matches logged: {match_count}   Pending improvements: {len(pending)}")
    print()

    decisions = report.get("decisions", {})
    if decisions:
        print(bold("Bot Decisions:"))
        for pid in sorted(decisions.keys()):
            d = decisions[pid]
            print(f"  P{pid}: {_format_decision(d)}")
        print()

    heartbeats = report.get("agentHeartbeats", {})
    if heartbeats:
        print(bold("Agent Heartbeats:"))
        for agent_id, ts in sorted(heartbeats.items()):
            age = (now_ms() - ts) / 1000
            status = green("OK") if age < 10 else red(f"STALE {age:.0f}s")
            print(f"  {agent_id}: {status}")
        print()

    events = report.get("recentEvents", [])
    if events:
        print(bold("Recent Events:"))
        for e in events[-8:]:
            e_type = e.get("type", "?")
            ts = str(e.get("timestamp", ""))[-8:]
            details = {k: v for k, v in e.items() if k not in ("type", "timestamp", "timestampMs", "savedAt")}
            detail_str = json.dumps(details)[:70]
            print(f"  {yellow(ts)} [{cyan(e_type)}] {detail_str}")
        print()

    # Task queue summary
    if pending:
        print(bold("Top Pending Tasks:"))
        for t in sorted(pending, key=lambda x: -x.get("priority", 0))[:4]:
            print(f"  [{t.get('id')}] p={t.get('priority')} {t.get('category')}: {str(t.get('title',''))[:60]}")
        print()

    insights = load_insights(limit=1)
    if insights:
        print(f"Latest insight: {insights[-1][0].name}")
    print()
    print("Press Ctrl+C to stop.")


def main() -> int:
    last_report: dict[str, Any] | None = None
    last_report_at = 0
    broker_ok = False

    print("BombaPVP AutoBot Dashboard — starting...")
    time.sleep(1.0)

    while True:
        try:
            report = _fetch_report()
            if report is not None:
                last_report = report
                last_report_at = now_ms()
                broker_ok = True
            else:
                broker_ok = False

            render(last_report, last_report_at, broker_ok)
        except KeyboardInterrupt:
            break
        except Exception:
            pass
        time.sleep(REFRESH_SECONDS)

    print("\nDashboard stopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
