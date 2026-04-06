"""
bot_menu.py — Interactive CLI menu for BombaPVP auto-improvements configuration.

Adapted from The-Last-Arrow/tools/bot_menu.py
"""

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any

try:
    from bot_manager import BotManager, PLAYSTYLE_PRESETS, AGGRESSION_PRESETS
    from model_manager import (
        PROVIDER_PRESETS, REASONING_PRESETS, CLAUDE_MODEL_PRESETS,
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
        compact_line, probe_model, discover_codex_homes, discover_ollama_models,
        DEFAULT_OLLAMA_HOST,
    )
    from auto_improvements.memory import load_tasks, pending_tasks, count_matches, load_insights
    from auto_improvements.insights_module import run_insights
    from auto_improvements.manager_agent import run_manager, show_tasks
    from auto_improvements.worker_agent import run_all as worker_run_all


ROOT = Path(__file__).resolve().parent
MAINBOT_SCRIPT = ROOT / "mainbot.py"


def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def pause(msg: str = "Press Enter to continue...") -> None:
    input(msg)


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
        return "\x1b[92mREADY\x1b[0m"
    if s == "error":
        return "\x1b[91mERROR\x1b[0m"
    return "\x1b[93mUNVALIDATED\x1b[0m"


def start_mainbot_window(args: list[str] | None = None) -> None:
    extra = " ".join(args or [])
    if os.name != "nt":
        subprocess.Popen([sys.executable, str(MAINBOT_SCRIPT)] + (args or []), cwd=str(ROOT))
        return
    cmd_args = f'python \\"{MAINBOT_SCRIPT}\\" {extra}'.strip()
    command = (
        f'Start-Process cmd.exe -ArgumentList @("/k", "title BombaPVP AutoBot && {cmd_args}") '
        f'-WorkingDirectory \\"{ROOT}\\"'
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
        check=False, cwd=str(ROOT),
    )


def stop_mainbot_stack() -> None:
    if os.name != "nt":
        return
    script = r"""
        $match = 'game_broker\.py|live_agent\.py|insights_module\.py|manager_agent\.py|mainbot\.py'
        Get-CimInstance Win32_Process |
            Where-Object { $_.CommandLine -match $match } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -gt 0 } |
            ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    """
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], check=False)


# ---------------------------------------------------------------------------
# Bot profile editing
# ---------------------------------------------------------------------------

def manage_bot_profile(manager: BotManager, bot_id: str | None = None) -> None:
    if not bot_id:
        bot_id = _choose_bot(manager)
    if not bot_id:
        return

    while True:
        manager.reload()
        profile = manager.get_profile(bot_id)
        clear_screen()
        print("Configure Bot")
        print()
        print(f"ID: {profile.get('botId')}")
        print(f"Name: {profile.get('displayName')}")
        print(f"Provider: {profile.get('provider', 'claude')}")
        print(f"Model: {profile.get('model') or '(default)'}")
        print(f"Reasoning: {profile.get('reasoningEffort') or '(default)'}")
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
        print("0. Back")
        print()
        choice = compact_line(input("Option: "))
        patch: dict[str, Any] | None = None

        if choice == "0":
            return
        elif choice == "1":
            selected = choose_single("Select provider", PROVIDER_PRESETS, str(profile.get("provider", "claude")))
            if selected:
                patch = {"provider": selected, "model": "", "modelValidation": {"status": "unvalidated", "message": "Provider changed"}}
        elif choice == "2":
            current_model = str(profile.get("model", "") or "")
            options = [(m, label) for m, label in CLAUDE_MODEL_PRESETS]
            options.append(("", "Custom (type below)"))
            selected = choose_single("Select Claude model", options, current_model)
            if selected is not None:
                if selected == "":
                    selected = compact_line(input("Model name: "))
                patch = {"model": selected, "modelValidation": {"status": "unvalidated", "message": "Model changed"}}
        elif choice == "3":
            clear_screen()
            print("Validating model...")
            v = probe_model(
                str(profile.get("provider", "claude")),
                str(profile.get("model", "") or ""),
                codex_home=str(profile.get("codexHome", "") or ""),
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
    print("BombaPVP AutoBot Menu")
    print()
    print(f"Bots configured: {len(bots)}")
    for b in bots:
        print(f"  {b.get('displayName')} ({b.get('botId')}) {validation_badge(b)}")
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
    manager = BotManager()

    while True:
        show_status(manager)
        print("=== CONTROL ===")
        print("1. Start AutoBot (full stack)")
        print("2. Start — broker + insights only (no live agents)")
        print("3. Stop AutoBot stack")
        print()
        print("=== CONFIGURATION ===")
        print("4. Configure bot")
        print("5. Create bot")
        print()
        print("=== INSIGHTS & TASKS ===")
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
        elif choice == "1":
            start_mainbot_window()
            pause()
        elif choice == "2":
            start_mainbot_window(["--no-game"])
            pause()
        elif choice == "3":
            stop_mainbot_stack()
            print("Stack stopped.")
            pause()
        elif choice == "4":
            manage_bot_profile(manager)
        elif choice == "5":
            bot_id = compact_line(input("Bot ID: "))
            name = compact_line(input("Display name: "))
            if bot_id:
                manager.create_bot(bot_id, display_name=name)
                print(f"Bot '{bot_id}' created.")
            pause()
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
