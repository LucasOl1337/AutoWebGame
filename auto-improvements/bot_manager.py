"""
bot_manager.py — Bot profile management for BombaPVP auto-improvements.

Profiles are stored as JSON files in bot_memory/bots/<botId>/profile.json.
The roster index lives at bot_memory/roster.json.
"""

import json
import time
from copy import deepcopy
from pathlib import Path
from typing import Any


MEMORY_DIR = Path(__file__).resolve().parent / "bot_memory"
BOTS_DIR = MEMORY_DIR / "bots"
ROSTER_PATH = MEMORY_DIR / "roster.json"


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def compact_line(value: str) -> str:
    return " ".join((value or "").strip().split())


def _load_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return deepcopy(fallback)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return deepcopy(fallback)


def _save_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=True), encoding="utf-8")


# ---------------------------------------------------------------------------
# Default structures
# ---------------------------------------------------------------------------

DEFAULT_ROSTER: dict[str, Any] = {"bots": [], "updatedAt": ""}

DEFAULT_PROFILE: dict[str, Any] = {
    "botId": "",
    "displayName": "",
    "provider": "claude",
    "model": "",
    "reasoningEffort": "",
    "codexHome": "",
    "ollamaHost": "",
    "openRouterApiKeyEnvVar": "OPENROUTER_API_KEY",
    "openRouterBaseUrl": "https://openrouter.ai/api/v1",
    "playstyle": "balanced",
    "aggressionBias": 0.5,
    "notes": [],
    "modelValidation": {"status": "unvalidated", "message": "", "provider": "", "requestedModel": ""},
    "createdAt": "",
    "updatedAt": "",
}

PLAYSTYLE_PRESETS = [
    "balanced",
    "aggressive bomb spammer",
    "defensive powerup collector",
    "corner controller",
    "mobility focused",
]

AGGRESSION_PRESETS = [
    ("0.2", "Passive — collect powerups, avoid fights"),
    ("0.4", "Cautious — bomb only when safe"),
    ("0.5", "Balanced — standard play"),
    ("0.7", "Aggressive — pressure opponents often"),
    ("0.9", "Maximum aggression — constant pressure"),
]


# ---------------------------------------------------------------------------
# BotManager
# ---------------------------------------------------------------------------

class BotManager:
    def __init__(self) -> None:
        self._roster: dict[str, Any] = {}
        self._profiles: dict[str, dict[str, Any]] = {}
        self.reload()

    def reload(self) -> None:
        self._roster = _load_json(ROSTER_PATH, DEFAULT_ROSTER)
        self._profiles = {}
        for entry in self._roster.get("bots", []):
            bot_id = str(entry.get("botId", "") or "")
            if bot_id:
                self._profiles[bot_id] = self._load_profile(bot_id)

    def _profile_path(self, bot_id: str) -> Path:
        return BOTS_DIR / bot_id / "profile.json"

    def _load_profile(self, bot_id: str) -> dict[str, Any]:
        path = self._profile_path(bot_id)
        data = _load_json(path, {})
        return {**deepcopy(DEFAULT_PROFILE), **data}

    def _save_profile(self, profile: dict[str, Any]) -> None:
        bot_id = str(profile.get("botId", "") or "")
        _save_json(self._profile_path(bot_id), profile)

    def _save_roster(self) -> None:
        self._roster["updatedAt"] = now_iso()
        _save_json(ROSTER_PATH, self._roster)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list_bots(self) -> list[dict[str, Any]]:
        return list(self._profiles.values())

    def get_profile(self, bot_id: str) -> dict[str, Any]:
        if bot_id not in self._profiles:
            self.reload()
        return deepcopy(self._profiles.get(bot_id, {**deepcopy(DEFAULT_PROFILE), "botId": bot_id}))

    def create_bot(self, bot_id: str, display_name: str = "") -> dict[str, Any]:
        bot_id = compact_line(bot_id)
        if not bot_id:
            raise ValueError("bot_id is required")
        profile = {
            **deepcopy(DEFAULT_PROFILE),
            "botId": bot_id,
            "displayName": display_name or bot_id,
            "createdAt": now_iso(),
            "updatedAt": now_iso(),
        }
        self._save_profile(profile)
        self._profiles[bot_id] = profile

        # Add to roster if not present
        ids_in_roster = {e.get("botId") for e in self._roster.get("bots", [])}
        if bot_id not in ids_in_roster:
            self._roster.setdefault("bots", []).append({"botId": bot_id, "displayName": profile["displayName"]})
            self._save_roster()

        return deepcopy(profile)

    def ensure_bot(self, bot_id: str, display_name: str = "") -> dict[str, Any]:
        """Get or create a bot profile."""
        if bot_id in self._profiles:
            return self.get_profile(bot_id)
        return self.create_bot(bot_id, display_name=display_name)

    def update_profile(self, bot_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        profile = self.get_profile(bot_id)
        profile.update(patch)
        profile["updatedAt"] = now_iso()
        self._save_profile(profile)
        self._profiles[bot_id] = profile

        # Sync displayName in roster
        for entry in self._roster.get("bots", []):
            if entry.get("botId") == bot_id:
                entry["displayName"] = profile.get("displayName", bot_id)
        self._save_roster()

        return deepcopy(profile)

    def delete_bot(self, bot_id: str) -> None:
        self._profiles.pop(bot_id, None)
        self._roster["bots"] = [e for e in self._roster.get("bots", []) if e.get("botId") != bot_id]
        self._save_roster()

    def bot_dir(self, bot_id: str) -> Path:
        path = BOTS_DIR / bot_id
        path.mkdir(parents=True, exist_ok=True)
        return path
