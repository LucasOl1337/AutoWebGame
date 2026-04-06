"""
mainbot.py — Main process orchestrator for BombaPVP auto-improvements.

Starts and monitors all auto-improvement processes:
  1. game_broker.py     — HTTP server (game telemetry bridge)
  2. live_agent.py      — Real-time gameplay bot (one per player slot)
  3. insights_module.py — Periodic pattern analysis
  4. manager_agent.py   — Task queue management
  5. report_console.py  — Live terminal dashboard (separate window)

Usage
-----
python mainbot.py            start everything
python mainbot.py --no-game  start without live agents (insights+manager only)
python mainbot.py --broker   start broker only
"""

import os
import signal
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen
import json


ROOT = Path(__file__).resolve().parent
GAME_ROOT = ROOT.parent
BROKER_BASE = os.environ.get("BROKER_BASE", "http://127.0.0.1:8765").rstrip("/")
REFRESH_SECONDS = float(os.environ.get("MAINBOT_REFRESH_SECONDS", "2.0"))
STALL_RESTART_SECONDS = float(os.environ.get("MAINBOT_STALL_RESTART_SEC", "30"))


def now_ms() -> int:
    return int(time.time() * 1000)


def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def compact_line(value: str) -> str:
    return " ".join((value or "").strip().split())


# ---------------------------------------------------------------------------
# Managed subprocess wrapper (adapted from The-Last-Arrow/mainbot.py)
# ---------------------------------------------------------------------------

class ManagedProcess:
    def __init__(
        self,
        name: str,
        command: list[str],
        log_path: Path,
        env_overrides: dict[str, str] | None = None,
        cwd: Path | None = None,
    ):
        self.name = name
        self.command = command
        self.log_path = log_path
        self.env_overrides = dict(env_overrides or {})
        self.cwd = str(cwd or ROOT)
        self.proc: subprocess.Popen[str] | None = None
        self.lines: deque[str] = deque(maxlen=80)
        self._reader: threading.Thread | None = None

    def start(self) -> None:
        self.stop()
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env.update(self.env_overrides)

        creationflags = 0
        startupinfo = None
        if os.name == "nt":
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        if self.log_path.exists():
            self.log_path.unlink()

        self.proc = subprocess.Popen(
            self.command,
            cwd=self.cwd,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            creationflags=creationflags,
            startupinfo=startupinfo,
        )
        self._reader = threading.Thread(target=self._pump_output, daemon=True)
        self._reader.start()

    def _pump_output(self) -> None:
        if self.proc is None or self.proc.stdout is None:
            return
        with self.log_path.open("a", encoding="utf-8") as handle:
            for raw_line in self.proc.stdout:
                line = compact_line(raw_line)
                if not line:
                    continue
                self.lines.append(line)
                handle.write(line + "\n")
                handle.flush()

    def stop(self) -> None:
        if self.proc is None:
            return
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.proc = None

    def is_running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def pid(self) -> int:
        return self.proc.pid if self.proc is not None else 0

    def recent(self, count: int) -> list[str]:
        items = list(self.lines)
        if not items:
            return []
        deduped: list[str] = []
        for item in items:
            if not deduped or deduped[-1] != item:
                deduped.append(item)
        return deduped[-count:]


# ---------------------------------------------------------------------------
# Broker HTTP helper
# ---------------------------------------------------------------------------

def _broker_report() -> dict[str, Any] | None:
    try:
        with urlopen(f"{BROKER_BASE}/report", timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("report") if data.get("ok") else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Kill existing stack
# ---------------------------------------------------------------------------

def kill_existing_stack() -> None:
    if os.name != "nt":
        return
    script = r"""
        $match = 'game_broker\.py|live_agent\.py|insights_module\.py|manager_agent\.py'
        Get-CimInstance Win32_Process |
            Where-Object { $_.CommandLine -match $match } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -gt 0 } |
            ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    """
    subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
        check=False, capture_output=True,
    )


def open_report_console() -> None:
    if os.name != "nt":
        return
    script_path = ROOT / "report_console.py"
    if not script_path.exists():
        return
    command = (
        f'Start-Process cmd.exe -ArgumentList @("/k", "title BombaPVP AutoBot Dashboard && '
        f'python \\"{script_path}\\"") -WorkingDirectory \\"{ROOT}\\"'
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
        check=False, capture_output=True,
    )


# ---------------------------------------------------------------------------
# MainBot orchestrator
# ---------------------------------------------------------------------------

class MainBot:
    def __init__(self, *, with_live_agents: bool = True, with_insights: bool = True, with_manager: bool = True):
        self.with_live_agents = with_live_agents
        self.with_insights = with_insights
        self.with_manager = with_manager

        logs = ROOT / "logs"

        self.broker = ManagedProcess(
            "broker",
            [sys.executable, str(ROOT / "game_broker.py")],
            logs / "broker.log",
        )
        self.live_agents: dict[str, ManagedProcess] = {}
        self.insights_proc: ManagedProcess | None = None
        self.manager_proc: ManagedProcess | None = None

        self.last_report: dict[str, Any] | None = None
        self.last_report_at_ms = 0
        self.last_broker_ok_at_ms = 0
        self.running = True

    def start(self) -> None:
        kill_existing_stack()
        self.broker.start()
        time.sleep(1.0)

        if self.with_live_agents:
            self._start_live_agent("1", player_id="1")
            self._start_live_agent("2", player_id="2")

        if self.with_insights:
            logs = ROOT / "logs"
            self.insights_proc = ManagedProcess(
                "insights",
                [sys.executable, str(ROOT / "insights_module.py")],
                logs / "insights.log",
            )
            self.insights_proc.start()

        if self.with_manager:
            logs = ROOT / "logs"
            self.manager_proc = ManagedProcess(
                "manager",
                [sys.executable, str(ROOT / "manager_agent.py")],
                logs / "manager.log",
            )
            self.manager_proc.start()

        open_report_console()

    def _start_live_agent(self, slot: str, player_id: str) -> None:
        logs = ROOT / "logs"
        proc = ManagedProcess(
            f"live-agent-p{player_id}",
            [sys.executable, str(ROOT / "live_agent.py")],
            logs / f"live_agent_p{player_id}.log",
            env_overrides={
                "AGENT_PLAYER_ID": player_id,
                "AGENT_BOT_ID": f"bot-p{player_id}",
            },
        )
        proc.start()
        self.live_agents[slot] = proc

    def stop(self) -> None:
        self.running = False
        for proc in self.live_agents.values():
            proc.stop()
        if self.insights_proc:
            self.insights_proc.stop()
        if self.manager_proc:
            self.manager_proc.stop()
        self.broker.stop()

    def poll(self) -> None:
        if not self.broker.is_running():
            self.broker.start()
            time.sleep(1.0)

        report = _broker_report()
        if report:
            self.last_report = report
            self.last_report_at_ms = now_ms()
            self.last_broker_ok_at_ms = now_ms()
        elif self.last_broker_ok_at_ms > 0 and now_ms() - self.last_broker_ok_at_ms > 8000:
            self.broker.stop()
            self.broker.start()
            time.sleep(1.0)
            return

        if self.with_insights and self.insights_proc and not self.insights_proc.is_running():
            self.insights_proc.start()

        if self.with_manager and self.manager_proc and not self.manager_proc.is_running():
            self.manager_proc.start()

        for slot, proc in self.live_agents.items():
            if not proc.is_running():
                proc.start()

    def render(self) -> None:
        clear_screen()
        print("BombaPVP AutoBot — MainBot")
        print(f"Broker: {'ONLINE' if self.broker.is_running() else 'OFFLINE':7} pid={self.broker.pid()} url={BROKER_BASE}")
        print()

        print("Live agents:")
        if not self.live_agents:
            print("  none")
        for slot, proc in sorted(self.live_agents.items()):
            print(f"  P{slot}: {'ONLINE' if proc.is_running() else 'OFFLINE'} pid={proc.pid()}")

        if self.insights_proc:
            print(f"Insights: {'ONLINE' if self.insights_proc.is_running() else 'OFFLINE'} pid={self.insights_proc.pid()}")
        if self.manager_proc:
            print(f"Manager:  {'ONLINE' if self.manager_proc.is_running() else 'OFFLINE'} pid={self.manager_proc.pid()}")

        print()

        r = self.last_report
        if r:
            age = (now_ms() - self.last_report_at_ms) / 1000
            print(f"Game state: phase={r.get('phase','-')} tick={r.get('tick','-')} players={r.get('activePlayers','-')} age={age:.1f}s")
            print()
            decisions = r.get("decisions", {})
            if decisions:
                print("Latest decisions:")
                for pid, d in decisions.items():
                    print(f"  P{pid}: dir={d.get('direction')} bomb={d.get('placeBomb')} reason={str(d.get('reason',''))[:50]}")
            events = r.get("recentEvents", [])
            if events:
                print(f"\nRecent events ({len(events)}):")
                for e in events[-5:]:
                    print(f"  [{e.get('type','?')}] {json.dumps({k:v for k,v in e.items() if k not in ('timestamp','timestampMs','savedAt')})[:80]}")
        else:
            print("Waiting for game telemetry... (start the game at http://localhost:5173)")

        print()
        print("Broker log:")
        for line in self.broker.recent(5) or ["-"]:
            print(f"  {line}")

        for slot, proc in sorted(self.live_agents.items()):
            lines = proc.recent(3)
            if lines:
                print(f"\nLive agent P{slot}:")
                for line in lines:
                    print(f"  {line}")

        print()
        print("Press Ctrl+C to stop.")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    args = sys.argv[1:]
    with_live_agents = "--no-game" not in args and "--broker" not in args
    with_insights = "--broker" not in args
    with_manager = "--broker" not in args

    if "--broker" in args:
        print("[mainbot] starting broker only")

    bot = MainBot(
        with_live_agents=with_live_agents,
        with_insights=with_insights,
        with_manager=with_manager,
    )

    def handle_exit(signum: int, frame: Any) -> None:
        raise KeyboardInterrupt

    if os.name != "nt":
        signal.signal(signal.SIGTERM, handle_exit)

    try:
        bot.start()
        while True:
            bot.poll()
            bot.render()
            time.sleep(REFRESH_SECONDS)
    except KeyboardInterrupt:
        bot.stop()
        print("\nMainBot stopped.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
