"""
live_agent.py — Real-time gameplay observer and bot controller for BombaPVP.

This agent:
1. Polls GET /state from the broker every POLL_INTERVAL_SECONDS
2. When a new game tick arrives, builds a compact state prompt
3. Calls the configured model (Codex / Claude / OpenRouter)
4. Posts the bot decision back to POST /decision
5. On match end, logs a summary event for the insights pipeline

Environment variables
---------------------
BROKER_BASE             http://127.0.0.1:8766  (default)
AGENT_BOT_ID            bot-default
AGENT_PLAYER_ID         1
AGENT_PROVIDER          claude | openai_codex | openrouter | ollama
AGENT_MODEL             model name (empty = provider default)
AGENT_POLL_INTERVAL_SEC 0.25
AGENT_IDLE_INTERVAL_SEC 1.0
CODEX_HOME              path to .codex home
ANTHROPIC_API_KEY       for Claude provider
OPENROUTER_API_KEY      for OpenRouter provider
"""

import json
import os
import sys
import threading
import time
from collections import deque
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# Force UTF-8 so log output doesn't crash on Windows cp1252 consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    from model_manager import call_model, compact_line
    from memory import append_event, append_match
except ModuleNotFoundError:
    from auto_improvements.model_manager import call_model, compact_line
    from auto_improvements.memory import append_event, append_match


BROKER_BASE = os.environ.get("BROKER_BASE", "http://127.0.0.1:8766").rstrip("/")
BROKER_INTERNAL_SECRET = os.environ.get("BROKER_INTERNAL_SECRET", "").strip()
AGENT_ID = os.environ.get("AGENT_BOT_ID", "bot-default")
PLAYER_ID = str(os.environ.get("AGENT_PLAYER_ID", "1"))
POLL_INTERVAL = float(os.environ.get("AGENT_POLL_INTERVAL_SEC", "0.25"))
IDLE_INTERVAL = float(os.environ.get("AGENT_IDLE_INTERVAL_SEC", "1.0"))
PROVIDER = compact_line(os.environ.get("AGENT_PROVIDER", "openai_codex"))
MODEL = compact_line(os.environ.get("AGENT_MODEL", ""))
REASONING_EFFORT = compact_line(os.environ.get("CODEX_REASONING_EFFORT", ""))
CODEX_HOME = os.environ.get("CODEX_HOME", "").strip()
CODEX_HOME_CHAIN_JSON = os.environ.get("AGENT_CODEX_HOME_CHAIN_JSON", "").strip()
OPENROUTER_API_KEY_ENV = os.environ.get("OPENROUTER_API_KEY_ENV_VAR", "OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/")

TOOLS_DIR = Path(__file__).resolve().parent
SYSTEM_PROMPT = (TOOLS_DIR / "live_agent_system_prompt.txt").read_text(encoding="utf-8").strip()

VALID_DIRECTIONS = {"up", "down", "left", "right"}
DIR_STEP: dict[str, tuple[int, int]] = {
    "up": (0, -1),
    "down": (0, 1),
    "left": (-1, 0),
    "right": (1, 0),
}
ACCOUNT_FAILURE_THRESHOLD = 3
STALL_FAILURE_MS = 900
TACTICAL_RECOVERY_COOLDOWN_MS = 700
SURVIVAL_DECISION_COOLDOWN_MS = 120
SURVIVAL_DANGER_HORIZON_MS = 3000
ESTIMATED_TILE_TRAVEL_MS = 260
ESCAPE_TIMING_BUFFER_MS = 350
_QUOTA_OR_AUTH_ERROR_KEYWORDS = (
    "rate_limit",
    "rate limit",
    "quota",
    "429",
    "insufficient_quota",
    "billing",
    "auth",
    "unauthorized",
    "401",
    "403",
    "token limit",
    "usage limit",
    "try again at",
)


def log(msg: str) -> None:
    print(f"[live-agent pid={player_id_label()}] {msg}", flush=True)


def player_id_label() -> str:
    return f"P{PLAYER_ID}"


def now_ms() -> int:
    return int(time.time() * 1000)


def _load_codex_home_chain() -> list[str]:
    homes: list[str] = []
    seen: set[str] = set()

    def _push(value: str) -> None:
        value = compact_line(value)
        if not value or value in seen:
            return
        homes.append(value)
        seen.add(value)

    if CODEX_HOME:
        _push(CODEX_HOME)
    if CODEX_HOME_CHAIN_JSON:
        try:
            payload = json.loads(CODEX_HOME_CHAIN_JSON)
            if isinstance(payload, list):
                for item in payload:
                    if isinstance(item, str):
                        _push(item)
        except json.JSONDecodeError:
            for item in CODEX_HOME_CHAIN_JSON.split("||"):
                _push(item)
    default_home = Path.home() / ".codex"
    _push(str(default_home))
    for entry in sorted(Path.home().glob(".codex*")):
        if not entry.is_dir():
            continue
        if not (
            (entry / "auth.json").exists()
            or (entry / "config.toml").exists()
            or (entry / ".sandbox-bin" / "codex.exe").exists()
        ):
            continue
        _push(str(entry))
    codex2 = Path.home() / ".codex2"
    if codex2.exists():
        _push(str(codex2))
    return homes


def _is_quota_or_auth_error(status: str) -> bool:
    lowered = compact_line(status).lower()
    return any(keyword in lowered for keyword in _QUOTA_OR_AUTH_ERROR_KEYWORDS)


# ---------------------------------------------------------------------------
# Broker HTTP helpers
# ---------------------------------------------------------------------------

def _http_get(path: str) -> tuple[int, Any]:
    headers = {"x-bomba-lab-secret": BROKER_INTERNAL_SECRET} if BROKER_INTERNAL_SECRET else {}
    try:
        request = Request(f"{BROKER_BASE}{path}", headers=headers, method="GET")
        with urlopen(request, timeout=3) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode("utf-8", errors="replace"))
        except Exception:
            return exc.code, {"ok": False}
    except (URLError, OSError) as exc:
        return 0, {"ok": False, "error": str(exc)}


def _http_post(path: str, payload: dict[str, Any]) -> tuple[int, Any]:
    raw = json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode("utf-8")
    request = Request(
        f"{BROKER_BASE}{path}",
        data=raw,
        headers={
            "Content-Type": "application/json",
            **({"x-bomba-lab-secret": BROKER_INTERNAL_SECRET} if BROKER_INTERNAL_SECRET else {}),
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=3) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except HTTPError as exc:
        try:
            return exc.code, json.loads(exc.read().decode("utf-8", errors="replace"))
        except Exception:
            return exc.code, {"ok": False}
    except (URLError, OSError) as exc:
        return 0, {"ok": False, "error": str(exc)}


def send_heartbeat(status: str = "online", error: str = "") -> None:
    _http_post("/agent/heartbeat", {
        "agentId": f"live-{PLAYER_ID}",
        "botId": AGENT_ID,
        "provider": PROVIDER,
        "model": MODEL,
        "status": status,
        "error": error[:240],
    })


# ---------------------------------------------------------------------------
# Game state → compact prompt
# ---------------------------------------------------------------------------

def _fmt_player(p: dict[str, Any]) -> str:
    if not isinstance(p, dict):
        return ""
    return (
        f"P{p.get('id')} {p.get('name','')} tile=({p.get('tile',{}).get('x')},{p.get('tile',{}).get('y')}) "
        f"alive={p.get('alive')} bombs={p.get('activeBombs')}/{p.get('maxBombs')} "
        f"flame={p.get('flameRange')} speed={p.get('speedLevel')} "
        f"remote={p.get('remoteLevel',0)} shield={p.get('shieldCharges',0)}"
    )


def _fmt_bomb(b: dict[str, Any]) -> str:
    if not isinstance(b, dict):
        return ""
    tile = b.get("tile", {})
    return f"bomb owner=P{b.get('ownerId')} tile=({tile.get('x')},{tile.get('y')}) fuse={b.get('fuseMs')}ms range={b.get('flameRange')}"


def _fmt_flame(f: dict[str, Any]) -> str:
    if not isinstance(f, dict):
        return ""
    tile = f.get("tile", {})
    return f"flame tile=({tile.get('x')},{tile.get('y')}) rem={f.get('remainingMs')}ms"


def _fmt_powerup(powerup: dict[str, Any]) -> str:
    if not isinstance(powerup, dict):
        return ""
    tile = powerup.get("tile", {})
    return f"powerup type={powerup.get('type')} tile=({tile.get('x')},{tile.get('y')})"


def _fmt_enemy(me_tile: dict[str, Any], p: dict[str, Any]) -> str:
    tile = p.get("tile", {})
    return (
        f"P{p.get('id')} tile=({tile.get('x')},{tile.get('y')}) "
        f"d={_tile_distance(me_tile, tile)} alive={p.get('alive')} "
        f"bombs={p.get('activeBombs')}/{p.get('maxBombs')} flame={p.get('flameRange')}"
    )


def _tile_distance(a: dict[str, Any] | None, b: dict[str, Any] | None) -> int:
    if not isinstance(a, dict) or not isinstance(b, dict):
        return 999
    try:
        return abs(int(a.get("x", 0)) - int(b.get("x", 0))) + abs(int(a.get("y", 0)) - int(b.get("y", 0)))
    except (TypeError, ValueError):
        return 999


def _tile_key(tile: dict[str, Any] | None) -> tuple[int, int]:
    if not isinstance(tile, dict):
        return (0, 0)
    try:
        return int(tile.get("x", 0)), int(tile.get("y", 0))
    except (TypeError, ValueError):
        return (0, 0)


def _player_state(state: dict[str, Any], player_id: str) -> dict[str, Any] | None:
    players = state.get("players", [])
    return next((p for p in (players or []) if str(p.get("id")) == player_id), None)


def _current_life_active(state: dict[str, Any]) -> bool:
    me = _player_state(state, PLAYER_ID)
    return bool(me and me.get("alive") and me.get("active"))


def _navigation_for_player(state: dict[str, Any]) -> dict[str, Any]:
    navigation = state.get("navigation", {})
    if not isinstance(navigation, dict):
        return {}
    player_navigation = navigation.get(PLAYER_ID, {})
    return player_navigation if isinstance(player_navigation, dict) else {}


def _local_tile_index(state: dict[str, Any]) -> dict[tuple[int, int], dict[str, Any]]:
    index: dict[tuple[int, int], dict[str, Any]] = {}
    for tile in (_navigation_for_player(state).get("localTiles") or []):
        if not isinstance(tile, dict):
            continue
        index[_tile_key(tile)] = tile
    return index


def _bomb_fuse_ms(bomb: dict[str, Any]) -> int:
    try:
        return max(0, int(bomb.get("fuseMs", 99999)))
    except (TypeError, ValueError):
        return 99999


def _projected_danger_tiles(
    state: dict[str, Any],
    *,
    hypothetical_bomb: bool = False,
    detonate_owned: bool = False,
) -> set[tuple[int, int]]:
    """Project imminent flame crosses using the same wall/crate stop rules as GameApp."""
    tile_index = _local_tile_index(state)
    danger = {
        _tile_key(flame.get("tile", {}))
        for flame in (state.get("flames") or [])
        if isinstance(flame, dict)
    }
    bombs = [
        bomb
        for bomb in (state.get("bombs") or [])
        if isinstance(bomb, dict) and (
            _bomb_fuse_ms(bomb) <= SURVIVAL_DANGER_HORIZON_MS
            or (detonate_owned and str(bomb.get("ownerId")) == PLAYER_ID)
        )
    ]
    if hypothetical_bomb:
        me = _player_state(state, PLAYER_ID)
        if me:
            bombs.append({
                "tile": me.get("tile", {}),
                "flameRange": max(1, int(me.get("flameRange", 1) or 1)),
                "fuseMs": 2000,
            })

    for bomb in bombs:
        origin = _tile_key(bomb.get("tile", {}))
        danger.add(origin)
        try:
            flame_range = max(1, int(bomb.get("flameRange", 1) or 1))
        except (TypeError, ValueError):
            flame_range = 1
        for dx, dy in DIR_STEP.values():
            for step in range(1, flame_range + 1):
                position = (origin[0] + dx * step, origin[1] + dy * step)
                tile = tile_index.get(position)
                # The 7x7 snapshot is deliberately conservative: an unknown tile
                # is never accepted as proof that a bomb has a safe exit.
                if tile is None:
                    break
                kind = str(tile.get("kind", "open"))
                if kind == "solid":
                    break
                danger.add(position)
                if kind == "breakable":
                    break
    return danger


def _find_escape_direction(
    state: dict[str, Any],
    *,
    hypothetical_bomb: bool = False,
    excluded_directions: set[str] | None = None,
) -> str | None:
    """Return the first step of a locally proven route outside all imminent blasts."""
    me = _player_state(state, PLAYER_ID)
    if not me:
        return None
    start = _tile_key(me.get("tile", {}))
    tile_index = _local_tile_index(state)
    if start not in tile_index:
        return None

    danger = _projected_danger_tiles(state, hypothetical_bomb=hypothetical_bomb)
    navigation = _navigation_for_player(state)
    raw_walkable = navigation.get("walkableDirections")
    first_step_allowlist = None
    if isinstance(raw_walkable, list):
        first_step_allowlist = {
            str(direction) for direction in raw_walkable if str(direction) in VALID_DIRECTIONS
        }
    excluded = excluded_directions or set()
    blocked_kinds = {"solid", "breakable", "bomb", "flame", "enemy"}
    queue: deque[tuple[tuple[int, int], str | None, int]] = deque([(start, None, 0)])
    visited = {start}

    while queue:
        position, first_direction, depth = queue.popleft()
        tile = tile_index.get(position, {})
        if depth > 0 and position not in danger and tile.get("dangerEtaMs") is None:
            return first_direction
        if depth >= 6:
            continue

        for direction, (dx, dy) in DIR_STEP.items():
            if depth == 0:
                if direction in excluded:
                    continue
                if first_step_allowlist is not None and direction not in first_step_allowlist:
                    continue
            next_position = (position[0] + dx, position[1] + dy)
            if next_position in visited:
                continue
            next_tile = tile_index.get(next_position)
            if not next_tile or str(next_tile.get("kind", "open")) in blocked_kinds:
                continue
            arrival_ms = (depth + 1) * ESTIMATED_TILE_TRAVEL_MS
            danger_eta = next_tile.get("dangerEtaMs")
            if danger_eta is not None:
                try:
                    if int(danger_eta) <= arrival_ms + ESCAPE_TIMING_BUFFER_MS:
                        continue
                except (TypeError, ValueError):
                    continue
            visited.add(next_position)
            queue.append((next_position, first_direction or direction, depth + 1))
    return None


def _current_tile_threatened(state: dict[str, Any]) -> bool:
    me = _player_state(state, PLAYER_ID)
    if not me:
        return False
    current = _tile_key(me.get("tile", {}))
    if current in _projected_danger_tiles(state):
        return True
    tile = _local_tile_index(state).get(current, {})
    danger_eta = tile.get("dangerEtaMs")
    try:
        return danger_eta is not None and int(danger_eta) <= SURVIVAL_DANGER_HORIZON_MS
    except (TypeError, ValueError):
        return False


def build_survival_decision(state: dict[str, Any]) -> dict[str, Any] | None:
    """Deterministic high-priority escape action while the current tile will burn."""
    if not _current_tile_threatened(state):
        return None
    direction = _find_escape_direction(state)
    return {
        "playerId": PLAYER_ID,
        "botId": AGENT_ID,
        "direction": direction,
        "placeBomb": False,
        "detonate": False,
        "useSkill": False,
        "reason": (
            "Survival control: follow proven blast escape route"
            if direction
            else "Survival control: no proven escape path; never add another bomb"
        ),
    }


def enforce_survival_safety(decision: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    """Prevent model/local decisions from overriding deterministic self-preservation."""
    safe = dict(decision)
    survival = build_survival_decision(state)
    if survival is not None:
        return survival

    if safe.get("detonate"):
        me = _player_state(state, PLAYER_ID)
        current = _tile_key(me.get("tile", {})) if me else (0, 0)
        if current in _projected_danger_tiles(state, detonate_owned=True):
            safe["detonate"] = False
            safe["reason"] = "Survival guard: detonation rejected inside owned bomb blast"

    if safe.get("placeBomb"):
        escape_direction = _find_escape_direction(state, hypothetical_bomb=True)
        if escape_direction is None:
            safe["placeBomb"] = False
            safe["detonate"] = False
            safe["reason"] = "Survival guard: bomb rejected; no proven escape route"
        else:
            safe["direction"] = escape_direction
            safe["reason"] = f"Survival guard: bomb allowed with escape {escape_direction}"
    return safe


class ActionOutcomeMemory:
    """Short-lived per-round memory that connects actions to observed results."""

    def __init__(self, max_outcomes: int = 8) -> None:
        self._lock = threading.RLock()
        self._pending: dict[str, Any] | None = None
        self._outcomes: deque[dict[str, Any]] = deque(maxlen=max_outcomes)
        self._failed: dict[tuple[int, int, str], int] = {}

    def reset(self) -> None:
        with self._lock:
            self._pending = None
            self._outcomes.clear()
            self._failed.clear()

    def record(self, decision: dict[str, Any], state: dict[str, Any]) -> None:
        with self._lock:
            direction = str(decision.get("direction") or "")
            me = _player_state(state, PLAYER_ID)
            if direction not in VALID_DIRECTIONS or not me:
                self._pending = None
                return
            navigation = _navigation_for_player(state)
            self._pending = {
                "direction": direction,
                "origin": _tile_key(me.get("tile", {})),
                "stalledBeforeMs": int(navigation.get("stalledForMs", 0) or 0),
            }

    def observe(self, state: dict[str, Any]) -> None:
        with self._lock:
            pending = self._pending
            if not pending:
                return
            me = _player_state(state, PLAYER_ID)
            if not me or not me.get("alive"):
                self._pending = None
                return
            current = _tile_key(me.get("tile", {}))
            origin = pending["origin"]
            direction = pending["direction"]
            navigation = _navigation_for_player(state)
            try:
                stalled_ms = max(0, int(navigation.get("stalledForMs", 0) or 0))
            except (TypeError, ValueError):
                stalled_ms = 0

            if current != origin:
                outcome = "SUCCEEDED"
                self._failed.pop((origin[0], origin[1], direction), None)
            elif stalled_ms >= STALL_FAILURE_MS:
                outcome = "FAILED"
                key = (origin[0], origin[1], direction)
                self._failed[key] = self._failed.get(key, 0) + 1
            else:
                return

            self._outcomes.append({
                "outcome": outcome,
                "direction": direction,
                "origin": origin,
                "result": current,
                "stalledMs": stalled_ms,
            })
            self._pending = None

    def _failed_directions_unlocked(self, state: dict[str, Any]) -> set[str]:
        me = _player_state(state, PLAYER_ID)
        if not me:
            return set()
        x, y = _tile_key(me.get("tile", {}))
        return {
            direction
            for (tile_x, tile_y, direction), count in self._failed.items()
            if tile_x == x and tile_y == y and count > 0
        }

    def failed_directions(self, state: dict[str, Any]) -> set[str]:
        with self._lock:
            return self._failed_directions_unlocked(state)

    def should_reject(self, decision: dict[str, Any], state: dict[str, Any]) -> bool:
        with self._lock:
            direction = str(decision.get("direction") or "")
            return direction in self._failed_directions_unlocked(state)

    def prompt_context(self, state: dict[str, Any]) -> str:
        with self._lock:
            lines: list[str] = []
            for item in self._outcomes:
                ox, oy = item["origin"]
                rx, ry = item["result"]
                lines.append(
                    f"{item['outcome']} direction={item['direction']} tile=({ox},{oy}) "
                    f"result=({rx},{ry}) stalled={item['stalledMs']}ms"
                )
            failed_here = sorted(self._failed_directions_unlocked(state))
            if failed_here:
                lines.append(f"FAILED HERE: {', '.join(failed_here)}")
            return "\n".join(lines) if lines else "No evaluated actions yet."


def _local_fast_decision(
    state: dict[str, Any],
    *,
    excluded_directions: set[str] | None = None,
    recovery: bool = False,
) -> dict[str, Any] | None:
    me = _player_state(state, PLAYER_ID)
    if not me or not me.get("alive") or not me.get("active"):
        return None

    survival = build_survival_decision(state)
    if survival is not None:
        return survival

    me_tile = me.get("tile", {})
    mx, my = _tile_key(me_tile)
    bombs = [b for b in (state.get("bombs") or []) if isinstance(b, dict)]
    flames = [f for f in (state.get("flames") or []) if isinstance(f, dict)]
    enemies = [
        p for p in (state.get("players") or [])
        if isinstance(p, dict) and str(p.get("id")) != PLAYER_ID and p.get("alive") and p.get("active")
    ]
    nearest_enemy = min(enemies, key=lambda p: _tile_distance(me_tile, p.get("tile", {})), default=None)
    powerups = [p for p in (state.get("powerUps") or []) if isinstance(p, dict)]
    nearest_powerup = min(powerups, key=lambda p: _tile_distance(me_tile, p.get("tile", {})), default=None)
    threat_tiles = {_tile_key(f.get("tile", {})) for f in flames}
    close_flames = [f for f in flames if _tile_distance(me_tile, f.get("tile", {})) <= 1]
    close_bombs = [b for b in bombs if _tile_distance(me_tile, b.get("tile", {})) <= 2]
    immediate_danger = bool(close_flames or close_bombs)
    navigation = _navigation_for_player(state)
    reported_walkable = {
        str(direction)
        for direction in (navigation.get("walkableDirections") or [])
        if str(direction) in VALID_DIRECTIONS
    }
    excluded = excluded_directions or set()
    candidate_directions = [
        direction
        for direction in DIR_STEP
        if (not reported_walkable or direction in reported_walkable) and direction not in excluded
    ]

    best_direction: str | None = None
    best_score = -10**9
    for direction in candidate_directions:
        dx, dy = DIR_STEP[direction]
        candidate = {"x": mx + dx, "y": my + dy}
        score = 0
        if _tile_key(candidate) in threat_tiles:
            score -= 1000
        for bomb in close_bombs:
            score += _tile_distance(candidate, bomb.get("tile", {})) * 25
        if nearest_enemy is not None:
            enemy_tile = nearest_enemy.get("tile", {})
            enemy_dist = _tile_distance(candidate, enemy_tile)
            score += (-enemy_dist * 12) if not immediate_danger else 0
        if nearest_powerup is not None and not immediate_danger:
            score -= _tile_distance(candidate, nearest_powerup.get("tile", {})) * 18
        if direction == str(me.get("direction", "")):
            score += 3
        if score > best_score:
            best_score = score
            best_direction = direction

    place_bomb = False
    if not immediate_danger and nearest_enemy is not None:
        enemy_dist = _tile_distance(me_tile, nearest_enemy.get("tile", {}))
        bomb_here = any(_tile_distance(me_tile, b.get("tile", {})) == 0 for b in bombs)
        if enemy_dist <= 1 and not bomb_here and int(me.get("activeBombs", 0) or 0) < int(me.get("maxBombs", 0) or 0):
            place_bomb = True

    if recovery and best_direction is None:
        bomb_here = any(_tile_distance(me_tile, b.get("tile", {})) == 0 for b in bombs)
        can_bomb = int(me.get("activeBombs", 0) or 0) < int(me.get("maxBombs", 0) or 0)
        escape_direction = _find_escape_direction(
            state,
            hypothetical_bomb=True,
            excluded_directions=excluded,
        )
        place_bomb = bool(not immediate_danger and not bomb_here and can_bomb and escape_direction)
        if place_bomb:
            best_direction = escape_direction

    reason = (
        "Tactical recovery after failed movement"
        if recovery
        else "Immediate evasive bootstrap" if immediate_danger else "Fast bootstrap pressure"
    )
    return enforce_survival_safety({
        "playerId": PLAYER_ID,
        "botId": AGENT_ID,
        "direction": best_direction,
        "placeBomb": place_bomb,
        "detonate": False,
        "useSkill": False,
        "reason": reason,
    }, state)


def build_recovery_decision(
    state: dict[str, Any],
    failed_directions: set[str] | None = None,
) -> dict[str, Any] | None:
    return _local_fast_decision(
        state,
        excluded_directions=failed_directions or set(),
        recovery=True,
    )


def build_prompt(state: dict[str, Any], *, outcome_context: str = "") -> str:
    players = state.get("players", [])
    bombs = state.get("bombs", [])
    flames = state.get("flames", [])
    powerups = state.get("powerUps", [])
    sudden_death = state.get("suddenDeath", {})
    score = state.get("matchScore", {})

    me = next((p for p in (players or []) if str(p.get("id")) == PLAYER_ID), None)
    if me is None:
        return f"No data for player {PLAYER_ID}. Return idle: {{\"direction\":null,\"placeBomb\":false,\"detonate\":false,\"useSkill\":false,\"reason\":\"no_self_state\"}}"
    me_tile = me.get("tile", {}) if isinstance(me, dict) else {}
    living_enemies = [
        p for p in (players or [])
        if isinstance(p, dict) and str(p.get("id")) != PLAYER_ID and p.get("alive")
    ]
    nearest_enemies = sorted(living_enemies, key=lambda p: _tile_distance(me_tile, p.get("tile", {})))[:3]
    nearby_bombs = sorted(
        [b for b in (bombs or []) if isinstance(b, dict)],
        key=lambda b: _tile_distance(me_tile, b.get("tile", {})),
    )[:6]
    nearby_flames = sorted(
        [f for f in (flames or []) if isinstance(f, dict)],
        key=lambda f: _tile_distance(me_tile, f.get("tile", {})),
    )[:8]
    nearby_powerups = sorted(
        [p for p in (powerups or []) if isinstance(p, dict)],
        key=lambda p: _tile_distance(me_tile, p.get("tile", {})),
    )[:6]
    nearest_enemy_distance = _tile_distance(me_tile, nearest_enemies[0].get("tile", {})) if nearest_enemies else 999
    close_bomb_threats = [
        b for b in nearby_bombs
        if _tile_distance(me_tile, b.get("tile", {})) <= 2 and int(b.get("fuseMs", 99999) or 99999) <= 2200
    ]
    close_flame_threats = [f for f in nearby_flames if _tile_distance(me_tile, f.get("tile", {})) <= 1]
    immediate_danger = bool(close_bomb_threats or close_flame_threats)
    navigation = state.get("navigation", {}) if isinstance(state.get("navigation"), dict) else {}
    my_navigation = navigation.get(PLAYER_ID, {}) if isinstance(navigation.get(PLAYER_ID), dict) else {}
    walkable_directions = [
        str(direction) for direction in (my_navigation.get("walkableDirections") or [])
        if str(direction) in VALID_DIRECTIONS
    ]
    blocked_directions = [
        str(direction) for direction in (my_navigation.get("blockedDirections") or [])
        if str(direction) in VALID_DIRECTIONS
    ]
    try:
        stalled_for_ms = max(0, int(my_navigation.get("stalledForMs", 0) or 0))
    except (TypeError, ValueError):
        stalled_for_ms = 0

    lines = [
        f"Tick: {state.get('tick', 0)} | Phase: {state.get('phase')} | Score: {json.dumps(score)}",
        f"Sudden death: {sudden_death.get('active', False)}",
        (
            "Tactical summary: "
            f"nearestEnemy={nearest_enemy_distance} "
            f"bombThreats={len(close_bomb_threats)} "
            f"flameThreats={len(close_flame_threats)} "
            f"immediateDanger={immediate_danger}"
        ),
        f"Walkable directions: {', '.join(walkable_directions) if walkable_directions else 'unknown'}",
        f"Blocked directions: {', '.join(blocked_directions) if blocked_directions else 'unknown'}",
        f"Movement feedback: stalledForMs={stalled_for_ms} lastDelta={json.dumps(my_navigation.get('lastMovementDelta', {}))}",
        "Local map:",
        *[
            (
                f"  ({tile.get('x')},{tile.get('y')})={tile.get('kind', 'unknown')}"
                + (f" danger={tile.get('dangerEtaMs')}ms" if tile.get("dangerEtaMs") is not None else "")
            )
            for tile in (my_navigation.get("localTiles") or [])
            if isinstance(tile, dict)
        ],
        "Recent action outcomes:",
        outcome_context or "No evaluated actions yet.",
        "",
        "Players:",
    ]
    for p in (players or []):
        lines.append("  " + _fmt_player(p))

    if nearest_enemies:
        lines.append("\nNearest enemies:")
        for p in nearest_enemies:
            lines.append("  " + _fmt_enemy(me_tile, p))

    if nearby_bombs:
        lines.append("\nNearest bombs:")
        for b in nearby_bombs:
            lines.append("  " + _fmt_bomb(b))

    if nearby_flames:
        lines.append("\nNearest flames:")
        for f in nearby_flames:
            lines.append("  " + _fmt_flame(f))

    if nearby_powerups:
        lines.append("\nNearby powerups:")
        for powerup in nearby_powerups:
            lines.append("  " + _fmt_powerup(powerup))

    lines.append(f"\nYou are: {_fmt_player(me)}")
    lines.append(
        f"\nDecide the next action for P{PLAYER_ID}. "
        "Survive immediate danger first; otherwise pressure the nearest enemy and create trap bombs when close. "
        "Never choose a blocked direction. If stalledForMs is above 700, change to a walkable direction immediately. "
        "Do not repeat FAILED actions at the same tile. Use the local map and action outcomes to choose a different route, "
        "place a bomb only when a complete escape route outside its flame cross exists, or wait when movement would be lethal. "
        "Never remain in the same row or column of your own bomb through detonation. "
        "Be decisive and low-latency. Return JSON only."
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Decision parsing
# ---------------------------------------------------------------------------

def parse_decision(raw: str) -> dict[str, Any] | None:
    text = raw.strip()
    # strip markdown fences if present
    if "```" in text:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            text = text[start:end]
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        # try to extract first JSON object
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            try:
                data = json.loads(text[start:end])
            except json.JSONDecodeError:
                return None
        else:
            return None

    if not isinstance(data, dict):
        return None

    direction = data.get("direction")
    if direction is not None and str(direction).lower() not in VALID_DIRECTIONS:
        direction = None

    return {
        "playerId": PLAYER_ID,
        "botId": AGENT_ID,
        "direction": direction,
        "placeBomb": bool(data.get("placeBomb", False)),
        "detonate": bool(data.get("detonate", False)),
        "useSkill": bool(data.get("useSkill", False)),
        "reason": str(data.get("reason", ""))[:120],
    }


# ---------------------------------------------------------------------------
# Codex call helpers (session-aware, mirrors The-Last-Arrow architecture)
# ---------------------------------------------------------------------------

def _codex_new(prompt: str, *, codex_home: str = "") -> tuple[str | None, str | None, str]:
    """Start a new Codex session. Returns (text, session_id, status)."""
    if PROVIDER != "openai_codex":
        text, status = call_model(
            prompt, SYSTEM_PROMPT,
            provider=PROVIDER, model=MODEL, reasoning_effort=REASONING_EFFORT,
            codex_home=codex_home or CODEX_HOME,
            openrouter_api_key_env=OPENROUTER_API_KEY_ENV,
            openrouter_base_url=OPENROUTER_BASE_URL,
            max_tokens=120, timeout=45.0,
        )
        return text, None, status

    # openai_codex: use the low-level new-session call that returns thread_id
    try:
        from model_manager import _call_codex_new
    except ImportError:
        from auto_improvements.model_manager import _call_codex_new  # type: ignore

    return _call_codex_new(
        prompt, SYSTEM_PROMPT,
        model=MODEL, reasoning_effort=REASONING_EFFORT,
        codex_home=codex_home or CODEX_HOME, timeout=45.0,
    )


def _codex_resume(session_id: str, prompt: str, *, codex_home: str = "") -> tuple[str | None, str]:
    """Resume an existing Codex session. Returns (text, status)."""
    try:
        from model_manager import _call_codex_resume
    except ImportError:
        from auto_improvements.model_manager import _call_codex_resume  # type: ignore

    return _call_codex_resume(
        session_id, prompt,
        model=MODEL, reasoning_effort=REASONING_EFFORT,
        codex_home=codex_home or CODEX_HOME, timeout=45.0,
    )


# ---------------------------------------------------------------------------
# Warmup — establishes Codex session before the first match tick
# ---------------------------------------------------------------------------

WARMUP_PROMPT = (
    "This is a warm-up turn before a live Bomberman match.\n"
    "Return a default aggressive opening move: move right, do not place bomb.\n"
    f"You will be controlling player {PLAYER_ID}.\n"
)


def run_warmup(*, codex_home: str = "") -> tuple[str | None, str | None]:
    """Run a warmup Codex call. Returns (session_id, warmup_decision_raw)."""
    log("warmup: starting Codex session...")
    raw, session_id, status = _codex_new(WARMUP_PROMPT, codex_home=codex_home)
    if status == "ok" and raw:
        log(f"warmup OK  session={str(session_id or '')[:12]}  raw={raw[:60]}")
        return session_id, raw
    log(f"warmup FAILED: {status}")
    return None, None


# ---------------------------------------------------------------------------
# Main agent loop
# ---------------------------------------------------------------------------

class LiveAgent:
    def __init__(self) -> None:
        self.last_tick = -1
        self.last_phase = ""
        self.match_start_tick = 0
        self.decisions_this_match = 0
        self.running = True
        self._codex_session_id: str | None = None
        # Background thread so Codex calls don't block the poll loop
        self._ai_thread: threading.Thread | None = None
        self._ai_busy = False
        self._ai_lock = threading.Lock()
        self._ai_retry_at_ms = 0
        self._last_model_error = ""
        self._codex_homes = _load_codex_home_chain()
        self._codex_home_index = 0
        self._account_consecutive_failures = 0
        self._round_epoch = 0
        self._life_epoch = 0
        self._latest_state: dict[str, Any] = {}
        self._latest_state_lock = threading.Lock()
        self._was_alive_in_match = False
        self._action_memory = ActionOutcomeMemory()
        self._last_tactical_recovery_at_ms = 0
        self._last_survival_decision_at_ms = 0
        self._survival_active = False

    def _is_ai_busy(self) -> bool:
        with self._ai_lock:
            return self._ai_busy

    def _current_codex_home(self) -> str:
        if self._codex_homes:
            return self._codex_homes[self._codex_home_index]
        return CODEX_HOME

    def _current_codex_home_label(self) -> str:
        home = self._current_codex_home()
        if not home:
            return "(default)"
        try:
            return Path(home).name or home
        except OSError:
            return home

    def _rotate_codex_home(self, reason: str = "") -> bool:
        if PROVIDER != "openai_codex" or len(self._codex_homes) < 2:
            return False
        old_home = self._current_codex_home_label()
        old_index = self._codex_home_index
        self._codex_home_index = (self._codex_home_index + 1) % len(self._codex_homes)
        if self._codex_home_index == old_index:
            return False
        self._codex_session_id = None
        self._account_consecutive_failures = 0
        self._ai_retry_at_ms = now_ms() + 1000
        suffix = f" | reason={reason}" if reason else ""
        log(f"[auth-fallback] rotating Codex account: {old_home} -> {self._current_codex_home_label()}{suffix}")
        return True

    def _set_latest_state(self, state: dict[str, Any]) -> None:
        with self._latest_state_lock:
            self._latest_state = state

    def _get_latest_state(self) -> dict[str, Any]:
        with self._latest_state_lock:
            return dict(self._latest_state)

    def _post_bootstrap_decision(self, state: dict[str, Any], *, reason: str) -> None:
        decision = _local_fast_decision(state)
        if not decision:
            return
        decision = enforce_survival_safety(decision, state)
        decision["reason"] = f"{reason}: {decision['reason']}"[:120]
        status, _ = _http_post("/decision", decision)
        if status == 200:
            self._action_memory.record(decision, state)
        log(f"bootstrap | {decision['direction'] or '.'} | {decision['reason']}")

    def _maybe_post_survival_decision(self, state: dict[str, Any], tick: int) -> bool:
        decision = build_survival_decision(state)
        if decision is None:
            if self._survival_active:
                hold = {
                    "playerId": PLAYER_ID,
                    "botId": AGENT_ID,
                    "direction": None,
                    "placeBomb": False,
                    "detonate": False,
                    "useSkill": False,
                    "reason": "Survival control: escape complete; hold outside blast",
                }
                status, _ = _http_post("/decision", hold)
                if status == 200:
                    log(f"survival-control tick={tick:>5} action=hold reason=escape-complete")
            self._survival_active = False
            return False
        self._survival_active = True
        current_ms = now_ms()
        if current_ms - self._last_survival_decision_at_ms < SURVIVAL_DECISION_COOLDOWN_MS:
            return True
        status, _ = _http_post("/decision", decision)
        if status != 200:
            return True
        self._last_survival_decision_at_ms = current_ms
        self._action_memory.record(decision, state)
        send_heartbeat("active")
        log(
            f"survival-control tick={tick:>5} "
            f"action={decision.get('direction') or 'hold'} reason={decision['reason']}"
        )
        return True

    def _maybe_post_tactical_recovery(self, state: dict[str, Any], tick: int) -> None:
        navigation = _navigation_for_player(state)
        try:
            stalled_ms = max(0, int(navigation.get("stalledForMs", 0) or 0))
        except (TypeError, ValueError):
            stalled_ms = 0
        current_ms = now_ms()
        if stalled_ms < STALL_FAILURE_MS:
            return
        if current_ms - self._last_tactical_recovery_at_ms < TACTICAL_RECOVERY_COOLDOWN_MS:
            return

        failed = self._action_memory.failed_directions(state)
        recovery = build_recovery_decision(state, failed)
        if not recovery or (recovery.get("direction") is None and not recovery.get("placeBomb")):
            return
        status, _ = _http_post("/decision", recovery)
        if status != 200:
            return
        self._last_tactical_recovery_at_ms = current_ms
        self._action_memory.record(recovery, state)
        send_heartbeat("active")
        log(
            f"tactical-recovery tick={tick:>5} stalled={stalled_ms}ms "
            f"failed={sorted(failed)} action={recovery.get('direction') or 'bomb'}"
        )

    def run(self) -> None:
        log(
            f"starting  provider={PROVIDER} model={MODEL or '(default)'}  "
            f"player={PLAYER_ID} codexHome={self._current_codex_home_label()}"
        )
        if PROVIDER == "openai_codex":
            log(f"[auth-fallback] available Codex homes: {self._codex_homes or ['(default)']}")
        send_heartbeat()
        heartbeat_at = now_ms()

        # Warmup: establish Codex session and post a default decision immediately
        session_id, warmup_raw = run_warmup(codex_home=self._current_codex_home())
        if PROVIDER == "openai_codex" and not session_id and not warmup_raw and len(self._codex_homes) > 1:
            for _ in range(len(self._codex_homes) - 1):
                if not self._rotate_codex_home("warmup_failed"):
                    break
                session_id, warmup_raw = run_warmup(codex_home=self._current_codex_home())
                if session_id or warmup_raw:
                    self._ai_retry_at_ms = 0
                    break
        self._codex_session_id = session_id
        if warmup_raw:
            d = parse_decision(warmup_raw)
            if d:
                # Warmup has no live spatial state, so it can never prove that a
                # bomb or remote detonation is survivable.
                d["placeBomb"] = False
                d["detonate"] = False
                _http_post("/decision", d)
                log(f"warmup decision posted: {d['direction']}  {d['reason'][:50]}")

        while self.running:
            try:
                if now_ms() - heartbeat_at > 5000:
                    send_heartbeat()
                    heartbeat_at = now_ms()

                status, body = _http_get("/state")
                if status != 200 or not isinstance(body, dict) or not body.get("ok"):
                    time.sleep(IDLE_INTERVAL)
                    continue

                tick = int(body.get("tick", -1) or -1)
                state = body.get("state") or {}
                phase = str(state.get("phase", "") or "")
                self._set_latest_state(state)
                self._action_memory.observe(state)
                me_alive = _current_life_active(state)

                # Detect match start
                if phase == "match" and self.last_phase != "match":
                    self._round_epoch += 1
                    self.match_start_tick = tick
                    self.decisions_this_match = 0
                    self._codex_session_id = None
                    self._action_memory.reset()
                    self._last_tactical_recovery_at_ms = 0
                    self._last_survival_decision_at_ms = 0
                    self._survival_active = False
                    self._was_alive_in_match = me_alive
                    if me_alive:
                        self._life_epoch += 1
                        self._post_bootstrap_decision(state, reason="Round start")
                    log("=" * 55)
                    log(f"  MATCH STARTED  player={PLAYER_ID}  session={str(self._codex_session_id or 'new')[:12]}")
                    log("=" * 55)

                # Detect match end
                if phase == "match-result" and self.last_phase == "match":
                    self._round_epoch += 1
                    self._was_alive_in_match = False
                    self._on_match_ended(state)

                self.last_phase = phase

                if phase != "match":
                    time.sleep(IDLE_INTERVAL)
                    continue

                if me_alive and not self._was_alive_in_match:
                    self._life_epoch += 1
                    self._post_bootstrap_decision(state, reason="Respawn")
                self._was_alive_in_match = me_alive

                if not me_alive:
                    time.sleep(POLL_INTERVAL)
                    continue

                if tick == self.last_tick:
                    time.sleep(POLL_INTERVAL)
                    continue

                self.last_tick = tick
                if self._maybe_post_survival_decision(state, tick):
                    continue
                self._maybe_post_tactical_recovery(state, tick)

                # Fire AI call in background; skip tick if previous is still running.
                # The last decision (25s TTL) keeps the bot moving while we wait.
                if not self._is_ai_busy() and now_ms() >= self._ai_retry_at_ms:
                    self._fire_ai_call(state, tick)

            except KeyboardInterrupt:
                self.running = False
            except Exception as exc:
                log(f"error in loop: {exc}")
                time.sleep(1.0)

        log("stopped")

    def _fire_ai_call(self, state: dict[str, Any], tick: int) -> None:
        """Start an async AI call in a daemon thread."""
        send_heartbeat("thinking")
        prompt = build_prompt(state, outcome_context=self._action_memory.prompt_context(state))
        session_id = self._codex_session_id
        codex_home = self._current_codex_home()
        request_round_epoch = self._round_epoch
        request_life_epoch = self._life_epoch
        request_alive = _current_life_active(state)

        def _worker() -> None:
            new_session_id: str | None = None
            if session_id and PROVIDER == "openai_codex":
                raw, status = _codex_resume(session_id, prompt, codex_home=codex_home)
            else:
                raw, new_session_id, status = _codex_new(prompt, codex_home=codex_home)

            with self._ai_lock:
                self._ai_busy = False
                if new_session_id:
                    self._codex_session_id = new_session_id

            if status != "ok" or raw is None:
                self._handle_model_error(status, tick)
                return

            latest_state = self._get_latest_state()
            if request_round_epoch != self._round_epoch or request_life_epoch != self._life_epoch:
                log(f"discard stale response tick={tick:>5} round={request_round_epoch}->{self._round_epoch} life={request_life_epoch}->{self._life_epoch}")
                return
            if request_alive and not _current_life_active(latest_state):
                log(f"discard stale response tick={tick:>5} reason=life_inactive")
                return

            decision = parse_decision(raw)
            if decision is None:
                log(f"parse failed tick={tick:>5} raw={raw[:80]}")
                return

            if _current_life_active(latest_state) and "dead" in str(decision.get("reason", "")).lower():
                log(f"discard dead response tick={tick:>5} while player is alive")
                bootstrap = _local_fast_decision(latest_state)
                if bootstrap:
                    _http_post("/decision", enforce_survival_safety(bootstrap, latest_state))
                return

            if self._action_memory.should_reject(decision, latest_state):
                rejected_direction = str(decision.get("direction") or "")
                recovery = build_recovery_decision(
                    latest_state,
                    self._action_memory.failed_directions(latest_state),
                )
                log(f"reject repeated failed action tick={tick:>5} direction={rejected_direction}")
                if recovery is None:
                    return
                decision = recovery

            decision = enforce_survival_safety(decision, latest_state)

            self._last_model_error = ""
            self._account_consecutive_failures = 0
            self._ai_retry_at_ms = 0
            post_status, _ = _http_post("/decision", decision)
            if post_status != 200:
                self._handle_model_error(f"decision_post_{post_status}", tick)
                return
            self._action_memory.record(decision, latest_state)
            send_heartbeat("active")
            self.decisions_this_match += 1
            arrow = {"up": "^", "down": "v", "left": "<", "right": ">"}.get(
                str(decision["direction"] or ""), "."
            )
            bomb_flag = "BOMB" if decision["placeBomb"] else "    "
            det_flag  = "DET " if decision["detonate"] else "    "
            log(f"tick={tick:>5} | {arrow} {bomb_flag} {det_flag}| {decision['reason'][:60]}")

        with self._ai_lock:
            self._ai_busy = True
        t = threading.Thread(target=_worker, daemon=True, name=f"ai-p{PLAYER_ID}-t{tick}")
        self._ai_thread = t
        t.start()

    def _handle_model_error(self, status: str, tick: int) -> None:
        status_l = status.lower()
        retry_ms = 0
        self._account_consecutive_failures += 1
        should_rotate = _is_quota_or_auth_error(status) or self._account_consecutive_failures >= ACCOUNT_FAILURE_THRESHOLD

        if should_rotate and self._rotate_codex_home(status):
            retry_ms = 1000
        elif _is_quota_or_auth_error(status):
            retry_ms = 30_000
        elif "timeout" in status_l:
            retry_ms = 3000
        else:
            retry_ms = 1500

        self._ai_retry_at_ms = max(self._ai_retry_at_ms, now_ms() + retry_ms)

        suffix = f" retry_in={retry_ms // 1000}s" if retry_ms else ""
        rotate_suffix = f" fails={self._account_consecutive_failures}" if PROVIDER == "openai_codex" else ""
        if status != self._last_model_error or retry_ms:
            log(f"model error tick={tick:>5} status={status}{rotate_suffix}{suffix}")
        self._last_model_error = status
        send_heartbeat("error", status)

    def _on_match_ended(self, state: dict[str, Any]) -> None:
        players = state.get("players", [])
        me = next((p for p in (players or []) if str(p.get("id")) == PLAYER_ID), None)
        survivors = [p for p in (players or []) if p.get("alive")]
        won = me is not None and bool(me.get("alive"))

        event = {
            "type": "match_ended",
            "playerId": PLAYER_ID,
            "botId": AGENT_ID,
            "won": won,
            "decisionsCount": self.decisions_this_match,
            "survivorCount": len(survivors),
            "tick": state.get("tick", 0),
        }
        append_event(event)
        result = "WON" if won else "LOST"
        log(f"{'-' * 55}")
        log(f"  {result}  decisions={self.decisions_this_match}  survivors={len(survivors)}")
        log(f"{'-' * 55}")


def main() -> int:
    agent = LiveAgent()
    try:
        agent.run()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
