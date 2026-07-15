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
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TextIO
from urllib.error import URLError
from urllib.request import urlopen
import json

try:
    from bot_manager import BotManager
except ModuleNotFoundError:
    from auto_improvements.bot_manager import BotManager

# Force UTF-8 so any stray emoji in log output won't crash on cp1252 consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


ROOT = Path(__file__).resolve().parent
GAME_ROOT = ROOT.parent
BROKER_BASE = os.environ.get("BROKER_BASE", "http://127.0.0.1:8766").rstrip("/")
REFRESH_SECONDS = float(os.environ.get("MAINBOT_REFRESH_SECONDS", "2.0"))
STALL_RESTART_SECONDS = float(os.environ.get("MAINBOT_STALL_RESTART_SEC", "30"))
LIVE_AGENT_RESTART_BASE_SECONDS = max(
    0.1,
    float(os.environ.get("MAINBOT_AGENT_RESTART_BASE_SEC", "2")),
)
LIVE_AGENT_RESTART_MAX_SECONDS = max(
    LIVE_AGENT_RESTART_BASE_SECONDS,
    float(os.environ.get("MAINBOT_AGENT_RESTART_MAX_SEC", "30")),
)
LIVE_AGENT_RESTART_STABLE_SECONDS = max(
    LIVE_AGENT_RESTART_BASE_SECONDS,
    float(os.environ.get("MAINBOT_AGENT_RESTART_STABLE_SEC", "30")),
)


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
        self.last_exit_code: int | None = None
        self.lines: deque[str] = deque(maxlen=80)
        self._reader: threading.Thread | None = None

    def start(self) -> None:
        self.stop()
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env["PYTHONIOENCODING"] = "utf-8"   # prevent charmap crash on emoji output
        env.update(self.env_overrides)

        creationflags = 0
        startupinfo = None
        if os.name == "nt":
            creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        start_marker = f"[supervisor] starting {self.name} at {time.strftime('%Y-%m-%d %H:%M:%S')}"
        self.lines.append(start_marker)
        with self.log_path.open("a", encoding="utf-8") as handle:
            handle.write(start_marker + "\n")

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
        stdout = self.proc.stdout
        self._reader = threading.Thread(target=self._pump_output, args=(stdout,), daemon=True)
        self._reader.start()

    def _pump_output(self, stream: TextIO | None) -> None:
        if stream is None:
            return
        with stream, self.log_path.open("a", encoding="utf-8") as handle:
            for raw_line in stream:
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
        self.last_exit_code = self.proc.poll()
        self.proc = None

    def is_running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def pid(self) -> int:
        return self.proc.pid if self.proc is not None else 0

    def exit_code(self) -> int | None:
        if self.proc is None:
            return self.last_exit_code
        exit_code = self.proc.poll()
        if exit_code is not None:
            self.last_exit_code = exit_code
        return exit_code

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
        Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue |
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
    subprocess.Popen(
        [sys.executable, str(script_path)],
        cwd=str(ROOT),
        creationflags=subprocess.CREATE_NEW_CONSOLE,
    )


def open_agent_log_console(title: str, log_path: Path) -> None:
    """Open a new console window that tails a live-agent log file in real time."""
    if os.name != "nt":
        return
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.touch(exist_ok=True)
    # Use powershell Get-Content -Wait to tail the file live
    ps_cmd = (
        f"$host.UI.RawUI.WindowTitle = '{title}'; "
        f"Get-Content -Path '{log_path}' -Wait -Tail 40"
    )
    subprocess.Popen(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
        creationflags=subprocess.CREATE_NEW_CONSOLE,
    )


# ---------------------------------------------------------------------------
# MainBot orchestrator
# ---------------------------------------------------------------------------

@dataclass
class LiveAgentRestartState:
    failures: int = 0
    last_start_at_ms: int = 0
    next_restart_at_ms: int = 0
    last_exit_code: int | None = None
    last_error: str = ""


def live_agent_controller_label(proc: ManagedProcess) -> str:
    provider = compact_line(proc.env_overrides.get("AGENT_PROVIDER", ""))
    model = compact_line(proc.env_overrides.get("AGENT_MODEL", ""))
    if provider and model:
        return f"{provider}/{model}"
    return provider or model or "not configured"

class MainBot:
    def __init__(self, *, with_live_agents: bool = True, with_insights: bool = True, with_manager: bool = True):
        self.with_live_agents = with_live_agents
        self.with_insights = with_insights
        self.with_manager = with_manager
        self.bot_manager = BotManager()

        logs = ROOT / "logs"

        self.broker = ManagedProcess(
            "broker",
            [sys.executable, str(ROOT / "game_broker.py")],
            logs / "broker.log",
        )
        self.live_agents: dict[str, ManagedProcess] = {}
        self.live_agent_restart_state: dict[str, LiveAgentRestartState] = {}
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
            self.bot_manager.reload()
            # Hybrid mode: Codex controls only P1.
            # P2, P3 and P4 remain on the native bot.
            self._start_live_agent("1", player_id="1")

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

        # Open monitoring consoles unless suppressed (bot_menu.py manages them when
        # launching via the menu so it can avoid duplicates).
        if os.environ.get("MAINBOT_NO_CONSOLES", "") != "1":
            open_report_console()
            if self.with_live_agents:
                logs = ROOT / "logs"
                open_agent_log_console("🤖 Live Agent P1", logs / "live_agent_p1.log")
            open_agent_log_console("🔌 Broker Log", ROOT / "logs" / "broker.log")

    def _start_live_agent(self, slot: str, player_id: str) -> None:
        logs = ROOT / "logs"
        bot_id = f"bot-p{player_id}"
        profile = self.bot_manager.ensure_bot(bot_id, display_name=f"Bot P{player_id}")
        provider = str(profile.get("provider", "openai_codex") or "openai_codex")
        model_name = str(profile.get("model", "") or "")
        reasoning_effort = str(profile.get("reasoningEffort", "") or "")
        if not model_name and provider == "openai_codex":
            model_name = "gpt-5.4-mini"
        if not reasoning_effort and provider == "openai_codex":
            reasoning_effort = "low"
        codex_homes = self.bot_manager.resolve_codex_homes_for_profile(profile)
        env_overrides = {
            "AGENT_PLAYER_ID": player_id,
            "AGENT_BOT_ID": bot_id,
            "AGENT_PROVIDER": provider,
            "AGENT_MODEL": model_name,
            "CODEX_REASONING_EFFORT": reasoning_effort,
            "AGENT_POLL_INTERVAL_SEC": "0.05",
            "AGENT_IDLE_INTERVAL_SEC": "0.10",
            "OLLAMA_HOST": str(profile.get("ollamaHost", "") or ""),
            "OPENROUTER_API_KEY_ENV_VAR": str(profile.get("openRouterApiKeyEnvVar", "OPENROUTER_API_KEY") or "OPENROUTER_API_KEY"),
            "OPENROUTER_BASE_URL": str(profile.get("openRouterBaseUrl", "https://openrouter.ai/api/v1") or "https://openrouter.ai/api/v1"),
        }
        if codex_homes:
            env_overrides["CODEX_HOME"] = codex_homes[0]
            env_overrides["AGENT_CODEX_HOME_CHAIN_JSON"] = json.dumps(codex_homes)
        elif str(profile.get("codexHome", "") or ""):
            env_overrides["CODEX_HOME"] = str(profile.get("codexHome", "") or "")

        proc = ManagedProcess(
            f"live-agent-p{player_id}",
            [sys.executable, str(ROOT / "live_agent.py")],
            logs / f"live_agent_p{player_id}.log",
            env_overrides=env_overrides,
        )
        start_at_ms = now_ms()
        self.live_agents[slot] = proc
        self.live_agent_restart_state[slot] = LiveAgentRestartState(
            last_start_at_ms=start_at_ms,
        )
        try:
            proc.start()
        except Exception as exc:
            state = self.live_agent_restart_state[slot]
            state.failures = 1
            state.next_restart_at_ms = start_at_ms + int(LIVE_AGENT_RESTART_BASE_SECONDS * 1000)
            state.last_error = compact_line(str(exc))[:120] or type(exc).__name__

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
        poll_now_ms = now_ms()
        if not self.broker.is_running():
            self.broker.start()
            time.sleep(1.0)

        report = _broker_report()
        if report:
            self.last_report = report
            self.last_report_at_ms = poll_now_ms
            self.last_broker_ok_at_ms = poll_now_ms
        elif self.last_broker_ok_at_ms > 0 and poll_now_ms - self.last_broker_ok_at_ms > 8000:
            self.broker.stop()
            self.broker.start()
            time.sleep(1.0)
            return

        if self.with_insights and self.insights_proc and not self.insights_proc.is_running():
            self.insights_proc.start()

        if self.with_manager and self.manager_proc and not self.manager_proc.is_running():
            self.manager_proc.start()

        for slot, proc in self.live_agents.items():
            state = self.live_agent_restart_state.setdefault(slot, LiveAgentRestartState())
            if proc.is_running():
                stable_for_ms = poll_now_ms - state.last_start_at_ms
                if (
                    state.failures > 0
                    and state.last_start_at_ms > 0
                    and stable_for_ms >= LIVE_AGENT_RESTART_STABLE_SECONDS * 1000
                ):
                    state.failures = 0
                    state.next_restart_at_ms = 0
                continue

            if poll_now_ms < state.next_restart_at_ms:
                continue

            exit_code = getattr(proc, "exit_code", None)
            state.last_exit_code = exit_code() if callable(exit_code) else None
            state.failures += 1
            state.last_start_at_ms = poll_now_ms
            quiet_seconds = LIVE_AGENT_RESTART_BASE_SECONDS
            for _ in range(min(state.failures - 1, 32)):
                quiet_seconds = min(LIVE_AGENT_RESTART_MAX_SECONDS, quiet_seconds * 2)
                if quiet_seconds >= LIVE_AGENT_RESTART_MAX_SECONDS:
                    break
            state.next_restart_at_ms = poll_now_ms + int(quiet_seconds * 1000)
            try:
                proc.start()
                state.last_error = ""
            except Exception as exc:
                state.last_error = compact_line(str(exc))[:120] or type(exc).__name__

    def render(self) -> None:
        clear_screen()
        render_now_ms = now_ms()
        print("BombaPVP AutoBot — MainBot")
        broker_state = "PROCESS RUNNING" if self.broker.is_running() else "PROCESS STOPPED"
        print(f"Broker: {broker_state} pid={self.broker.pid()} url={BROKER_BASE}")
        print()

        print("Live agents:")
        print("  Process state only; model response health is not inferred here. Check heartbeat/decision age dashboard.")
        if not self.live_agents:
            print("  none")
        for slot, proc in sorted(self.live_agents.items()):
            state = self.live_agent_restart_state.get(slot, LiveAgentRestartState())
            running = proc.is_running()
            if running:
                process_state = "PROCESS RUNNING"
                retry_label = ""
            elif render_now_ms < state.next_restart_at_ms:
                process_state = "RESTART WAIT"
                retry_seconds = (state.next_restart_at_ms - render_now_ms) / 1000
                retry_label = f" retry={retry_seconds:.1f}s"
            else:
                process_state = "PROCESS STOPPED"
                retry_label = " retry=now"
            controller = live_agent_controller_label(proc)
            exit_label = f" exit={state.last_exit_code}" if state.last_exit_code is not None else ""
            error_label = f" error={state.last_error}" if state.last_error else ""
            print(
                f"  P{slot}: {process_state} pid={proc.pid()} controller={controller}"
                f"{retry_label} failures={state.failures}{exit_label}{error_label}"
            )

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
            print("Latest decisions:")
            if decisions:
                for pid, d in decisions.items():
                    print(f"  P{pid}: dir={d.get('direction')} bomb={d.get('placeBomb')} reason={str(d.get('reason',''))[:50]}")
            else:
                print("  none received — model response not verified")
            events = r.get("recentEvents", [])
            if events:
                print(f"\nRecent events ({len(events)}):")
                for e in events[-5:]:
                    print(f"  [{e.get('type','?')}] {json.dumps({k:v for k,v in e.items() if k not in ('timestamp','timestampMs','savedAt')})[:80]}")
        else:
            print("Waiting for game telemetry... (start the game at http://127.0.0.1:5174)")

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
