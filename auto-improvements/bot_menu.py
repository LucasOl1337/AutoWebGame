"""
bot_menu.py — Interactive CLI menu for BombaPVP auto-improvements configuration.

Adapted from The-Last-Arrow/tools/bot_menu.py
"""

import json
import os
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from typing import Any
from urllib.request import urlopen
from urllib.error import URLError

# Force UTF-8 output so emoji/box chars don't crash on Windows cp1252 consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    from bot_manager import BotManager, PLAYSTYLE_PRESETS, AGGRESSION_PRESETS
    from model_manager import (
        PROVIDER_PRESETS, REASONING_PRESETS, CLAUDE_MODEL_PRESETS,
        build_openai_codex_model_options,
        compact_line, probe_model, discover_codex_homes, discover_ollama_models,
        DEFAULT_OLLAMA_HOST,
    )
    from memory import load_tasks, pending_tasks, count_matches, load_insights
    from insights_module import run_insights
    from manager_agent import run_manager, show_tasks
    from worker_agent import run_all as worker_run_all
except ModuleNotFoundError:
    from auto_improvements.bot_manager import BotManager, PLAYSTYLE_PRESETS, AGGRESSION_PRESETS
    from auto_improvements.model_manager import (
        PROVIDER_PRESETS, REASONING_PRESETS, CLAUDE_MODEL_PRESETS,
        build_openai_codex_model_options,
        compact_line, probe_model, discover_codex_homes, discover_ollama_models,
        DEFAULT_OLLAMA_HOST,
    )
    from auto_improvements.memory import load_tasks, pending_tasks, count_matches, load_insights
    from auto_improvements.insights_module import run_insights
    from auto_improvements.manager_agent import run_manager, show_tasks
    from auto_improvements.worker_agent import run_all as worker_run_all


ROOT = Path(__file__).resolve().parent
GAME_ROOT = ROOT.parent
MAINBOT_SCRIPT = ROOT / "mainbot.py"

VITE_PORT = int(os.environ.get("VITE_PORT", "5174"))
BROKER_PORT = int(os.environ.get("BROKER_PORT", "8766"))
GAME_URL = f"http://127.0.0.1:{VITE_PORT}/game.html?autobot=3&codexbot=1"
BROKER_BASE = f"http://127.0.0.1:{BROKER_PORT}"

# npm command (Windows needs npm.cmd)
NPM = "npm.cmd" if os.name == "nt" else "npm"
_SPAWNED_CONSOLE_PROCS: list[subprocess.Popen[Any]] = []


# ---------------------------------------------------------------------------
# Terminal helpers
# ---------------------------------------------------------------------------

def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def pause(msg: str = "Press Enter to continue...") -> None:
    input(msg)


def green(t: str) -> str:  return f"\x1b[92m{t}\x1b[0m"
def red(t: str) -> str:    return f"\x1b[91m{t}\x1b[0m"
def yellow(t: str) -> str: return f"\x1b[93m{t}\x1b[0m"
def cyan(t: str) -> str:   return f"\x1b[96m{t}\x1b[0m"
def bold(t: str) -> str:   return f"\x1b[1m{t}\x1b[0m"


def _track_console_proc(proc: subprocess.Popen[Any] | None) -> subprocess.Popen[Any] | None:
    if proc is not None:
        _SPAWNED_CONSOLE_PROCS.append(proc)
    return proc


def close_spawned_consoles() -> None:
    for proc in list(_SPAWNED_CONSOLE_PROCS):
        if proc.poll() is not None:
            continue
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
    _SPAWNED_CONSOLE_PROCS.clear()


# ---------------------------------------------------------------------------
# Environment checks
# ---------------------------------------------------------------------------

def _check_port(port: int, timeout: float = 1.0) -> bool:
    """Return True if something is listening on localhost:port."""
    try:
        with urlopen(f"http://127.0.0.1:{port}", timeout=timeout):
            return True
    except Exception:
        return True  # connection refused vs nothing listening — both mean port busy


def _port_open(port: int) -> bool:
    """True if our own service is answering on the port."""
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(("127.0.0.1", port)) == 0


def _broker_online() -> bool:
    try:
        with urlopen(f"{BROKER_BASE}/health", timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def _vite_online() -> bool:
    return _port_open(VITE_PORT)


def check_node() -> tuple[bool, str]:
    """Return (ok, version_string)."""
    try:
        out = subprocess.check_output([NPM, "--version"], stderr=subprocess.DEVNULL, text=True).strip()
        return True, f"npm {out}"
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False, "npm not found"


def check_python_version() -> tuple[bool, str]:
    major, minor = sys.version_info[:2]
    ok = (major, minor) >= (3, 11)
    label = f"Python {major}.{minor}"
    return ok, label


def _resolve_codex_home(codex_home: str = "") -> Path:
    """Return the resolved codex home directory, never returning Path('.')."""
    env_val = compact_line(codex_home) or os.environ.get("CODEX_HOME", "").strip()
    if env_val:
        return Path(env_val).expanduser().resolve()
    return Path.home() / ".codex"


def _find_codex_exe(codex_home: str = "") -> Path | None:
    """Search for codex.exe in the standard location, or on PATH."""
    codex_home = _resolve_codex_home(codex_home)
    # Standard install location
    candidate = codex_home / ".sandbox-bin" / "codex.exe"
    if candidate.exists():
        return candidate
    # Env override
    env_exe = os.environ.get("CODEX_EXE", "").strip()
    if env_exe and Path(env_exe).exists():
        return Path(env_exe)
    # On PATH (non-Windows or custom install)
    try:
        found = subprocess.check_output(
            ["where", "codex"] if os.name == "nt" else ["which", "codex"],
            stderr=subprocess.DEVNULL, text=True,
        ).strip().splitlines()[0]
        if found and Path(found).exists():
            return Path(found)
    except Exception:
        pass
    return None


def check_codex_auth(codex_home: str = "") -> tuple[bool, str]:
    """Check codex.exe exists and auth.json is present."""
    exe = _find_codex_exe(codex_home)
    if exe is None:
        return False, "codex.exe not found — install Codex CLI first"
    auth = _resolve_codex_home(codex_home) / "auth.json"
    if not auth.exists():
        return False, "Codex not authenticated (no auth.json)"
    return True, f"Codex auth OK  [{exe}]"


def probe_codex_live(codex_home: str = "") -> tuple[bool, str]:
    """Make a real Codex call to verify the token actually works."""
    exe = _find_codex_exe(codex_home)
    if exe is None:
        return False, "codex.exe not found"
    import subprocess, json as _json
    schema = Path(__file__).resolve().parent / "live_agent_output_schema.json"
    cmd = [str(exe), "exec", "--json", "--ephemeral",
           "--skip-git-repo-check", "--sandbox", "read-only",
           "--cd", str(Path(__file__).resolve().parent)]
    if schema.exists():
        cmd.extend(["--output-schema", str(schema)])
    cmd.append(
        'Return exactly this JSON: {"direction":null,"placeBomb":false,"detonate":false,"useSkill":false,"reason":"ok"}'
    )
    CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
    env = os.environ.copy()
    if codex_home:
        env["CODEX_HOME"] = str(_resolve_codex_home(codex_home))
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                                errors="replace", timeout=60,
                                creationflags=CREATE_NO_WINDOW, env=env)
    except subprocess.TimeoutExpired:
        return False, "Codex live probe timed out (>60s)"
    except OSError as exc:
        return False, f"Codex launch error: {exc}"

    if result.returncode != 0:
        return False, f"Codex exit {result.returncode}: {result.stderr[:120]}"

    # parse JSON event stream
    text = ""
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ev = _json.loads(line)
        except _json.JSONDecodeError:
            continue
        if ev.get("type") == "item.completed":
            item = ev.get("item") or {}
            if item.get("type") == "agent_message" and item.get("text"):
                text = str(item["text"])

    if text:
        return True, f"Codex live OK — {text[:60]}"
    return False, "Codex returned no agent_message text"


def run_codex_login() -> None:
    """Launch codex login in a new interactive console window."""
    exe = _find_codex_exe()
    if exe is None:
        print(red("codex.exe not found. Install it first."))
        return
    print("Opening Codex OAuth login — follow the browser prompt...")
    if os.name == "nt":
        _track_console_proc(subprocess.Popen(
            [str(exe), "login"],
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        ))
    else:
        _track_console_proc(subprocess.Popen([str(exe), "login"]))


def _profile_codex_homes(manager: BotManager, profile: dict[str, Any]) -> list[str]:
    return manager.resolve_codex_homes_for_profile(profile)


def _profile_primary_codex_home(manager: BotManager, profile: dict[str, Any]) -> str:
    homes = _profile_codex_homes(manager, profile)
    return homes[0] if homes else str(profile.get("codexHome", "") or "")


def _choose_model_for_profile(manager: BotManager, profile: dict[str, Any]) -> str | None:
    provider = str(profile.get("provider", "openai_codex") or "openai_codex")
    current_model = str(profile.get("model", "") or "")

    if provider == "openai_codex":
        options = build_openai_codex_model_options(_profile_primary_codex_home(manager, profile))
        selected = choose_single("Select Codex model", options + [("__custom__", "Custom (type below)")], current_model)
        if selected is None:
            return None
        if selected == "__custom__":
            return compact_line(input("Codex model name: "))
        return selected

    if provider == "claude":
        options = [(m, label) for m, label in CLAUDE_MODEL_PRESETS]
        selected = choose_single("Select Claude model", options + [("__custom__", "Custom (type below)")], current_model)
        if selected is None:
            return None
        if selected == "__custom__":
            return compact_line(input("Claude model name: "))
        return selected

    if provider == "ollama":
        options = discover_ollama_models(str(profile.get("ollamaHost", DEFAULT_OLLAMA_HOST) or DEFAULT_OLLAMA_HOST))
        selected = choose_single("Select Ollama model", options + [("__custom__", "Custom (type below)")], current_model)
        if selected is None:
            return None
        if selected == "__custom__":
            return compact_line(input("Ollama model name: "))
        return selected

    entered = compact_line(input(f"Model name [{current_model or 'default'}]: "))
    return entered if entered else current_model


def _model_validation_patch(profile: dict[str, Any], message: str, *, provider: str | None = None, requested_model: str | None = None) -> dict[str, Any]:
    return {
        "status": "unvalidated",
        "message": message,
        "provider": provider if provider is not None else str(profile.get("provider", "") or ""),
        "requestedModel": requested_model if requested_model is not None else str(profile.get("model", "") or ""),
    }


def quick_set_codex_model(manager: BotManager, bot_id: str = "bot-p1") -> None:
    profile = manager.ensure_bot(bot_id, display_name="Bot P1")
    if str(profile.get("provider", "openai_codex") or "openai_codex") != "openai_codex":
        profile = manager.update_profile(bot_id, {"provider": "openai_codex"})
    selected = _choose_model_for_profile(manager, profile)
    if selected is None:
        return
    manager.update_profile(bot_id, {
        "provider": "openai_codex",
        "model": selected,
        "modelValidation": _model_validation_patch(
            profile,
            "Codex model changed",
            provider="openai_codex",
            requested_model=selected,
        ),
    })
    print(f"Codex model for {bot_id} set to: {selected or '(inherit from config)'}")
    pause()


def run_environment_check(*, test_codex_live: bool = False) -> dict[str, Any]:
    py_ok, py_label = check_python_version()
    node_ok, node_label = check_node()
    codex_ok, codex_label = check_codex_auth()
    result: dict[str, Any] = {
        "python": (py_ok, py_label),
        "node": (node_ok, node_label),
        "codex": (codex_ok, codex_label),
        "vite": (_vite_online(), f"Vite dev server :{VITE_PORT}"),
        "broker": (_broker_online(), f"Broker :{BROKER_PORT}"),
    }
    if test_codex_live and codex_ok:
        print("  Running live Codex test call (may take ~30s)...", flush=True)
        live_ok, live_label = probe_codex_live()
        result["codex_live"] = (live_ok, live_label)
    return result


def print_env_check(checks: dict[str, Any]) -> None:
    print(bold("Environment"))
    for key, (ok, label) in checks.items():
        icon = green("✔") if ok else (yellow("~") if key in ("vite", "broker") else red("✗"))
        print(f"  {icon}  {label}")
    print()


# ---------------------------------------------------------------------------
# Process launchers
# ---------------------------------------------------------------------------

def start_vite_window() -> None:
    """Open a new console running npm run dev:frontend."""
    if os.name == "nt":
        _track_console_proc(subprocess.Popen(
            [NPM, "run", "dev:frontend"],
            cwd=str(GAME_ROOT),
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        ))
    else:
        _track_console_proc(subprocess.Popen(
            [NPM, "run", "dev:frontend"],
            cwd=str(GAME_ROOT),
        ))


def start_mainbot_window(args: list[str] | None = None) -> None:
    cmd = [sys.executable, str(MAINBOT_SCRIPT)] + (args or [])
    env = os.environ.copy()
    # Tell mainbot not to open its own console windows — bot_menu handles that
    env["MAINBOT_NO_CONSOLES"] = "1"
    if os.name == "nt":
        _track_console_proc(subprocess.Popen(cmd, cwd=str(ROOT), creationflags=subprocess.CREATE_NEW_CONSOLE, env=env))
    else:
        _track_console_proc(subprocess.Popen(cmd, cwd=str(ROOT), env=env))


def _open_log_tail(title: str, log_path: Path) -> None:
    """Open a PowerShell window tailing a log file in real time."""
    if os.name != "nt":
        return
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.touch(exist_ok=True)
    ps_cmd = (
        f"$host.UI.RawUI.WindowTitle = '{title}'; "
        f"Get-Content -Path '{log_path}' -Wait -Tail 50"
    )
    _track_console_proc(subprocess.Popen(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd],
        creationflags=subprocess.CREATE_NEW_CONSOLE,
    ))


def open_all_log_consoles() -> None:
    """Open all monitoring console windows: report dashboard + live-agent tails."""
    logs = ROOT / "logs"
    report_script = ROOT / "report_console.py"
    if report_script.exists() and os.name == "nt":
        _track_console_proc(subprocess.Popen(
            [sys.executable, str(report_script)],
            cwd=str(ROOT),
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        ))
    _open_log_tail("🤖 Live Agent P1", logs / "live_agent_p1.log")
    _open_log_tail("🔌 Broker Log", logs / "broker.log")


def close_all_and_exit() -> int:
    close_spawned_consoles()
    stop_mainbot_stack()
    return 0


def stop_mainbot_stack() -> None:
    if os.name != "nt":
        return
    script = r"""
        $match = 'game_broker\.py|live_agent\.py|insights_module\.py|manager_agent\.py|mainbot\.py'
        Get-CimInstance Win32_Process |
            Where-Object { $_.CommandLine -match $match } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Get-NetTCPConnection -LocalPort 8766 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -gt 0 } |
            ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    """
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], check=False)


def open_game_browser() -> None:
    """Open the game in the default browser (endless match + autobot bots)."""
    webbrowser.open(GAME_URL)


# ---------------------------------------------------------------------------
# One-click launcher
# ---------------------------------------------------------------------------

def launch_all(manager: BotManager) -> None:
    """Start Vite frontend + mainbot stack + open browser."""
    clear_screen()
    print(bold("🚀  Launching full test environment...\n"))

    checks = run_environment_check(test_codex_live=True)
    py_ok = checks["python"][0]
    node_ok = checks["node"][0]
    codex_ok = checks["codex"][0]
    codex_live_ok, codex_live_label = checks.get("codex_live", (True, ""))

    if not py_ok:
        print(red(f"✗ {checks['python'][1]} — need Python 3.11+"))
        pause()
        return

    if not node_ok:
        print(red(f"✗ {checks['node'][1]} — install Node.js and ensure npm is on PATH"))
        pause()
        return

    if not codex_ok:
        msg = checks["codex"][1]
        print(yellow(f"⚠  {msg}"))
        if "auth.json" in msg:
            ans = input("  Open Codex OAuth login now? (y/n): ").strip().lower()
            if ans == "y":
                run_codex_login()
                print("  Complete login in the new window, then press Enter.")
                pause()
                codex_ok, _ = check_codex_auth()
        if not codex_ok:
            ans = input("  Continue without Codex auth? (y/n): ").strip().lower()
            if ans != "y":
                return
    elif not codex_live_ok:
        print(yellow(f"⚠  {codex_live_label}"))
        ans = input("  Continue launching even though live Codex is failing? (y/n): ").strip().lower()
        if ans != "y":
            return

    # 1. Vite frontend
    if not checks["vite"][0]:
        print(f"  Starting Vite dev server on :{VITE_PORT}…")
        start_vite_window()
        print("  Waiting for Vite to come up", end="", flush=True)
        for _ in range(20):
            time.sleep(1)
            print(".", end="", flush=True)
            if _vite_online():
                break
        print()
        if _vite_online():
            print(green(f"  ✔ Vite ready at http://127.0.0.1:{VITE_PORT}"))
        else:
            print(yellow(f"  ~ Vite may still be starting (check its console window)"))
    else:
        print(green(f"  ✔ Vite already running on :{VITE_PORT}"))

    # 2. MainBot stack (broker + agents + log consoles)
    if not checks["broker"][0]:
        print("  Starting mainbot stack…")
        start_mainbot_window()
        print("  Waiting for broker", end="", flush=True)
        for _ in range(15):
            time.sleep(1)
            print(".", end="", flush=True)
            if _broker_online():
                break
        print()
        if _broker_online():
            print(green(f"  ✔ Broker ready at {BROKER_BASE}"))
        else:
            print(yellow("  ~ Broker may still be starting"))
    else:
        print(green(f"  ✔ Broker already running on :{BROKER_PORT}"))

    # 3. Open log console windows
    print("  Opening monitoring consoles…")
    open_all_log_consoles()

    # 5. Open browser
    print(f"\n  Opening browser → {GAME_URL}")
    open_game_browser()

    print()
    print(bold("Everything launched!"))
    print(f"  Game:    {cyan(GAME_URL)}")
    print(f"  Broker:  {cyan(BROKER_BASE)}")
    print()
    print("  The 🤖 AutoBot panel is in the bottom-right corner of the game.")
    print("  Click  🎮 Endless Match  to start a bot match immediately.")
    print("  Live agent decisions appear in the separate console windows.")
    print()
    pause()


# ---------------------------------------------------------------------------
# Bot profile editing
# ---------------------------------------------------------------------------

def choose_single(title: str, options: list[tuple[str, str]], current: str) -> str | None:
    while True:
        clear_screen()
        print(title)
        print()
        for i, (value, label) in enumerate(options, 1):
            marker = "*" if value == current else " "
            shown = value or "<inherit>"
            print(f" {marker} {i}. {label} [{shown}]")
        print()
        print("0. Back")
        choice = compact_line(input("Option: "))
        if choice == "0":
            return None
        if choice.isdigit():
            idx = int(choice)
            if 1 <= idx <= len(options):
                return options[idx - 1][0]


def validation_badge(profile: dict[str, Any]) -> str:
    v = profile.get("modelValidation", {}) if isinstance(profile.get("modelValidation"), dict) else {}
    s = str(v.get("status", "unvalidated") or "unvalidated").lower()
    if s == "ready":
        return green("READY")
    if s == "error":
        return red("ERROR")
    return yellow("UNVALIDATED")


def _account_summary(account: dict[str, Any]) -> str:
    label = str(account.get("label", "") or account.get("id", ""))
    home = str(account.get("codexHome", "") or "(unset)")
    enabled = green("ON") if account.get("enabled", True) else yellow("OFF")
    status = validation_badge({"modelValidation": account.get("validation", {})})
    return f"{label} [{account.get('id')}] {enabled} {status} {home}"


def _choose_codex_account_order(manager: BotManager, current_ids: list[str]) -> list[str] | None:
    accounts = manager.list_codex_accounts()
    if not accounts:
        clear_screen()
        print("No Codex OAuth accounts configured yet.")
        print()
        pause()
        return None

    while True:
        clear_screen()
        print("Select Codex fallback order")
        print()
        print("Current order:")
        print("  " + (" -> ".join(current_ids) if current_ids else "(none)"))
        print()
        for i, account in enumerate(accounts, 1):
            marker = "*" if str(account.get("id")) in current_ids else " "
            print(f" {marker} {i}. {_account_summary(account)}")
        print()
        print("Type a comma-separated list like: 2,1,3")
        print("Type X to clear the fallback list.")
        print("0. Back")
        raw = compact_line(input("Order: "))
        if raw == "0":
            return None
        if raw.lower() == "x":
            return []
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        selected_ids: list[str] = []
        ok = True
        for part in parts:
            if not part.isdigit():
                ok = False
                break
            idx = int(part)
            if not (1 <= idx <= len(accounts)):
                ok = False
                break
            account_id = str(accounts[idx - 1].get("id", ""))
            if account_id and account_id not in selected_ids:
                selected_ids.append(account_id)
        if ok:
            return selected_ids


def manage_codex_accounts(manager: BotManager) -> None:
    while True:
        manager.reload()
        accounts = manager.list_codex_accounts()
        clear_screen()
        print("Codex OAuth Accounts")
        print()
        if not accounts:
            print("No accounts configured.")
        else:
            for i, account in enumerate(accounts, 1):
                print(f"  {i}. {_account_summary(account)}")
        print()
        print("N. New account")
        print("0. Back")
        print()
        raw = compact_line(input("Option: ")).lower()
        if raw == "0":
            return
        if raw == "n":
            account_id = compact_line(input("Account ID: "))
            if not account_id:
                continue
            label = compact_line(input("Label: "))
            home = compact_line(input("CODEX_HOME path: "))
            try:
                manager.create_codex_account(account_id, label=label, codex_home=home)
            except ValueError:
                pass
            continue
        if not raw.isdigit():
            continue
        idx = int(raw)
        if not (1 <= idx <= len(accounts)):
            continue
        account_id = str(accounts[idx - 1].get("id", ""))
        while True:
            manager.reload()
            account = manager.get_codex_account(account_id)
            clear_screen()
            print("Edit Codex OAuth Account")
            print()
            print(f"ID: {account.get('id')}")
            print(f"Label: {account.get('label')}")
            print(f"CODEX_HOME: {account.get('codexHome') or '(unset)'}")
            print(f"Enabled: {account.get('enabled', True)}")
            print(f"Validation: {validation_badge({'modelValidation': account.get('validation', {})})}")
            print()
            print("1. Rename")
            print("2. Change CODEX_HOME")
            print("3. Toggle enabled")
            print("4. Check auth.json")
            print("5. Live probe")
            print("6. Delete account")
            print("0. Back")
            print()
            choice = compact_line(input("Option: "))
            if choice == "0":
                break
            if choice == "1":
                label = compact_line(input("New label: "))
                if label:
                    manager.update_codex_account(account_id, {"label": label})
            elif choice == "2":
                home = compact_line(input("New CODEX_HOME path: "))
                manager.update_codex_account(account_id, {
                    "codexHome": home,
                    "validation": {"status": "unvalidated", "message": "CODEX_HOME changed"},
                })
            elif choice == "3":
                manager.update_codex_account(account_id, {"enabled": not bool(account.get("enabled", True))})
            elif choice == "4":
                ok, label = check_codex_auth(str(account.get("codexHome", "") or ""))
                manager.update_codex_account(account_id, {
                    "validation": {"status": "ready" if ok else "error", "message": label},
                })
                print(label)
                pause()
            elif choice == "5":
                ok, label = probe_codex_live(str(account.get("codexHome", "") or ""))
                manager.update_codex_account(account_id, {
                    "validation": {"status": "ready" if ok else "error", "message": label},
                })
                print(label)
                pause()
            elif choice == "6":
                confirm = compact_line(input("Delete this account? (y/n): ")).lower()
                if confirm == "y":
                    manager.delete_codex_account(account_id)
                    break


def manage_bot_profile(manager: BotManager, bot_id: str | None = None) -> None:
    if not bot_id:
        bot_id = _choose_bot(manager)
    if not bot_id:
        return

    while True:
        manager.reload()
        profile = manager.get_profile(bot_id)
        codex_account_ids = [str(v) for v in profile.get("codexAccountIds", []) if str(v)]
        codex_accounts_label = " -> ".join(codex_account_ids) if codex_account_ids else "(none)"
        clear_screen()
        print("Configure Bot")
        print()
        print(f"ID: {profile.get('botId')}")
        print(f"Name: {profile.get('displayName')}")
        print(f"Provider: {profile.get('provider', 'claude')}")
        print(f"Model: {profile.get('model') or '(default)'}")
        print(f"Reasoning: {profile.get('reasoningEffort') or '(default)'}")
        print(f"Codex accounts: {codex_accounts_label}")
        print(f"Primary CODEX_HOME: {_profile_primary_codex_home(manager, profile) or '(none)'}")
        print(f"Playstyle: {profile.get('playstyle', 'balanced')}")
        print(f"Aggression: {profile.get('aggressionBias', 0.5)}")
        print(f"Validation: {validation_badge(profile)}")
        print()
        print("1. Provider")
        print("2. Model")
        print("3. Validate model now")
        print("4. Reasoning")
        print("5. Playstyle")
        print("6. Aggression bias")
        print("7. Rename")
        print("8. Codex fallback accounts")
        print("9. Legacy single CODEX_HOME")
        print("0. Back")
        print()
        choice = compact_line(input("Option: "))
        patch: dict[str, Any] | None = None

        if choice == "0":
            return
        elif choice == "1":
            selected = choose_single("Select provider", PROVIDER_PRESETS, str(profile.get("provider", "claude")))
            if selected:
                patch = {
                    "provider": selected,
                    "model": "",
                    "modelValidation": _model_validation_patch(
                        profile,
                        "Provider changed",
                        provider=selected,
                        requested_model="",
                    ),
                }
        elif choice == "2":
            selected = _choose_model_for_profile(manager, profile)
            if selected is not None:
                patch = {
                    "model": selected,
                    "modelValidation": _model_validation_patch(
                        profile,
                        "Model changed",
                        provider=str(profile.get("provider", "") or ""),
                        requested_model=selected,
                    ),
                }
        elif choice == "3":
            clear_screen()
            print("Validating model...")
            v = probe_model(
                str(profile.get("provider", "claude")),
                str(profile.get("model", "") or ""),
                codex_home=_profile_primary_codex_home(manager, profile),
                ollama_host=str(profile.get("ollamaHost", DEFAULT_OLLAMA_HOST) or DEFAULT_OLLAMA_HOST),
            )
            print(f"Status: {v.get('status')} — {v.get('message')}")
            pause()
            patch = {"modelValidation": v}
        elif choice == "4":
            selected = choose_single("Reasoning effort", REASONING_PRESETS, str(profile.get("reasoningEffort", "") or ""))
            if selected is not None:
                patch = {"reasoningEffort": selected}
        elif choice == "5":
            options = [(p, p) for p in PLAYSTYLE_PRESETS]
            selected = choose_single("Playstyle", options, str(profile.get("playstyle", "balanced")))
            if selected:
                patch = {"playstyle": selected}
        elif choice == "6":
            options = AGGRESSION_PRESETS
            selected = choose_single("Aggression bias", options, str(profile.get("aggressionBias", 0.5)))
            if selected is not None:
                try:
                    patch = {"aggressionBias": float(selected)}
                except ValueError:
                    pass
        elif choice == "7":
            name = input("New display name: ").strip()
            if name:
                patch = {"displayName": name}
        elif choice == "8":
            selected_ids = _choose_codex_account_order(manager, codex_account_ids)
            if selected_ids is not None:
                patch = {
                    "codexAccountIds": selected_ids,
                    "modelValidation": _model_validation_patch(
                        profile,
                        "Codex fallback accounts changed",
                    ),
                }
        elif choice == "9":
            current = str(profile.get("codexHome", "") or "")
            entered = compact_line(input(f"Legacy CODEX_HOME [{current or 'none'}]: "))
            patch = {
                "codexHome": entered if entered else current,
                "modelValidation": _model_validation_patch(
                    profile,
                    "Legacy CODEX_HOME changed",
                ),
            }

        if patch:
            manager.update_profile(bot_id, patch)


def _choose_bot(manager: BotManager, title: str = "Select bot") -> str | None:
    clear_screen()
    print(title)
    print()
    bots = manager.list_bots()
    for i, b in enumerate(bots, 1):
        print(f"  {i}. {b.get('displayName')} ({b.get('botId')}) | {b.get('provider','claude')} | {b.get('model') or 'default'} | {validation_badge(b)}")
    print()
    print("N. Create new bot")
    print("0. Back")
    print()
    raw = compact_line(input("Option: ")).lower()
    if raw == "0":
        return None
    if raw == "n":
        bot_id = compact_line(input("Bot ID: "))
        name = compact_line(input("Display name: "))
        if bot_id:
            manager.create_bot(bot_id, display_name=name)
        manager.reload()
        return _choose_bot(manager, title=title)
    if raw.isdigit():
        idx = int(raw)
        if 1 <= idx <= len(bots):
            return str(bots[idx - 1].get("botId"))
    return raw or None


# ---------------------------------------------------------------------------
# Status overview
# ---------------------------------------------------------------------------

def show_status(manager: BotManager) -> None:
    manager.reload()
    clear_screen()
    bots = manager.list_bots()
    accounts = manager.list_codex_accounts()
    print(bold("BombaPVP AutoBot Menu"))
    print()

    # Live environment badges
    vite_ok = _vite_online()
    broker_ok = _broker_online()
    print(f"  Vite  :{VITE_PORT}   {green('ONLINE') if vite_ok else red('OFFLINE')}")
    print(f"  Broker:{BROKER_PORT}  {green('ONLINE') if broker_ok else red('OFFLINE')}")
    print()

    print(f"Bots configured: {len(bots)}")
    for b in bots:
        print(f"  {b.get('displayName')} ({b.get('botId')}) {validation_badge(b)}")
    print(f"Codex accounts: {len(accounts)}")
    print()
    total_matches = count_matches()
    insights = load_insights(limit=1)
    pending = pending_tasks()
    print(f"Matches logged: {total_matches}")
    print(f"Insight reports: {len(load_insights(limit=100))}")
    print(f"Pending tasks: {len(pending)}")
    if insights:
        print(f"Latest insight: {insights[-1][0].name}")
    print()


# ---------------------------------------------------------------------------
# Main menu
# ---------------------------------------------------------------------------

def main() -> int:
    # ── Startup environment check ─────────────────────────────────────────
    clear_screen()
    print(bold("BombaPVP AutoBot — Startup Check\n"))
    checks = run_environment_check()
    print_env_check(checks)

    fatal = []
    if not checks["python"][0]:
        fatal.append(f"Python 3.11+ required — {checks['python'][1]}")
    if not checks["node"][0]:
        fatal.append(f"Node/npm not found — install Node.js and add npm to PATH")

    if fatal:
        for msg in fatal:
            print(red(f"  FATAL: {msg}"))
        print()
        pause("Fix the issues above, then press Enter to exit.")
        return 1

    if not checks["codex"][0]:
        msg = checks["codex"][1]
        print(yellow(f"  ⚠  {msg}"))
        if "auth.json" in msg:
            # exe exists but not logged in — offer to open login now
            ans = input("     Open Codex OAuth login now? (y/n): ").strip().lower()
            if ans == "y":
                run_codex_login()
                print("     Complete the login in the new window, then press Enter here.")
                pause()
                # re-check
                ok2, label2 = check_codex_auth()
                if ok2:
                    print(green(f"  ✔  {label2}"))
                else:
                    print(yellow("  Still not authenticated. Continue anyway? (y/n): "), end="")
                    if input().strip().lower() != "y":
                        return 1
        else:
            print("     Install Codex CLI, then restart.")
            pause()
            return 1
        print()

    # ── Main loop ─────────────────────────────────────────────────────────
    manager = BotManager()

    while True:
        show_status(manager)
        print(bold("=== QUICK START ==="))
        print("S. Start everything (Vite + AutoBot + open browser)")
        print("T. Test Codex live (verify auth + real call, ~30s)")
        print()
        print(bold("=== CONTROL ==="))
        print("1. Start AutoBot stack only (broker + agents + consoles)")
        print("2. Start — broker + insights only (no live agents)")
        print("3. Stop AutoBot stack")
        print("X. Close all opened consoles + stop stack + exit")
        print("V. Start Vite dev frontend only")
        print("B. Open game in browser")
        print()
        print(bold("=== CONFIGURATION ==="))
        print("M. Quick Codex model for P1")
        print("4. Configure bot")
        print("5. Create bot")
        print("A. Manage Codex OAuth accounts")
        print()
        print(bold("=== INSIGHTS & TASKS ==="))
        print("6. Run insights now")
        print("7. Run manager (generate tasks)")
        print("8. Show task queue")
        print("9. Run worker (apply one task, dry-run)")
        print("W. Run worker (apply tasks for real)")
        print()
        print("0. Exit")
        print()
        choice = compact_line(input("Option: ")).lower()

        if choice == "0":
            return 0
        elif choice == "t":
            clear_screen()
            print(bold("Codex live test\n"))
            auth_ok, auth_label = check_codex_auth()
            print(f"  Auth:  {green(auth_label) if auth_ok else red(auth_label)}")
            if auth_ok:
                live_ok, live_label = probe_codex_live()
                icon = green("OK") if live_ok else red("FAIL")
                print(f"  Live:  [{icon}]  {live_label}")
            print()
            pause()
        elif choice == "s":
            launch_all(manager)
        elif choice == "1":
            start_mainbot_window()
            print("  Waiting for processes to initialise…", end="", flush=True)
            for _ in range(8):
                time.sleep(0.5)
                print(".", end="", flush=True)
                if _broker_online():
                    break
            print()
            open_all_log_consoles()
            print(green("  ✔ Stack started. Monitoring consoles opened."))
            pause()
        elif choice == "2":
            start_mainbot_window(["--no-game"])
            pause()
        elif choice == "3":
            stop_mainbot_stack()
            print("Stack stopped.")
            pause()
        elif choice == "x":
            print("Closing spawned consoles and stopping stack...")
            return close_all_and_exit()
        elif choice == "v":
            if _vite_online():
                print(green(f"Vite already running on :{VITE_PORT}"))
            else:
                start_vite_window()
                print(f"Vite starting… check the new console window.")
            pause()
        elif choice == "b":
            if not _vite_online():
                print(yellow(f"Vite not running on :{VITE_PORT} — start it first (V or S)."))
            else:
                open_game_browser()
                print(f"Browser opened → {GAME_URL}")
            pause()
        elif choice == "m":
            quick_set_codex_model(manager, "bot-p1")
        elif choice == "4":
            manage_bot_profile(manager)
        elif choice == "5":
            bot_id = compact_line(input("Bot ID: "))
            name = compact_line(input("Display name: "))
            if bot_id:
                manager.create_bot(bot_id, display_name=name)
                print(f"Bot '{bot_id}' created.")
            pause()
        elif choice == "a":
            manage_codex_accounts(manager)
        elif choice == "6":
            clear_screen()
            print("Running insights analysis...")
            result = run_insights(force=True)
            if result:
                print(result[:800])
            else:
                print("Insights not generated (check logs).")
            pause()
        elif choice == "7":
            clear_screen()
            print("Running manager...")
            added = run_manager(force=True)
            print(f"Added {added} new tasks.")
            pause()
        elif choice == "8":
            clear_screen()
            show_tasks()
            pause()
        elif choice == "9":
            clear_screen()
            print("Running worker (DRY RUN)...")
            worker_run_all(dry_run=True)
            pause()
        elif choice == "w":
            clear_screen()
            confirm = input("Apply tasks for real? This will modify game files. (yes/no): ").strip().lower()
            if confirm == "yes":
                worker_run_all(dry_run=False)
            else:
                print("Cancelled.")
            pause()


if __name__ == "__main__":
    raise SystemExit(main())
