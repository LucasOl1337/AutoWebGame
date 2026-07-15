"""Safe, deterministic classification of observed model micro-actions."""

from typing import Any, NamedTuple


MOVEMENT_EPSILON_PX = 0.5
EXECUTED_CODES = {"MOVE_SUCCEEDED", "MOVE_IN_PROGRESS"}
BLOCKED_CODES = {"MOVE_NO_PROGRESS", "MOVE_OPPOSITE", "MOVE_DIVERTED"}
PUBLIC_ACTION_CODES = EXECUTED_CODES | BLOCKED_CODES | {
    "UNACKNOWLEDGED", "WAITED", "BOMB_PLACED", "BOMB_NO_EFFECT",
    "DETONATED", "DETONATE_NO_EFFECT", "SKILL_STARTED", "SKILL_NO_EFFECT",
    "SKILL_HELD", "SKILL_HOLD_NO_EFFECT", "SKILL_RELEASED", "SKILL_RELEASE_NO_EFFECT",
    "DIED_AFTER",
}


class MovementOutcome(NamedTuple):
    code: str
    execution_state: str
    delta_x: float
    delta_y: float


def _finite_float(value: Any) -> float:
    try:
        number = float(value or 0)
    except (TypeError, ValueError):
        return 0.0
    if number != number or number in {float("inf"), float("-inf")}:
        return 0.0
    return max(-9_999.0, min(9_999.0, number))


def classify_directional_movement(
    direction: str,
    movement_delta: dict[str, Any] | None,
    *,
    tile_changed: bool,
) -> MovementOutcome:
    """Classify movement using progress along the requested direction.

    A tile change alone is not proof of success: collisions, lane correction or
    another effect can move the player sideways or backwards. The result feeds
    both the next model prompt and operator telemetry.
    """

    delta = movement_delta if isinstance(movement_delta, dict) else {}
    delta_x = _finite_float(delta.get("x"))
    delta_y = _finite_float(delta.get("y"))
    direction_key = str(direction or "").lower()

    if direction_key == "right":
        requested_progress, lateral_progress = delta_x, abs(delta_y)
    elif direction_key == "left":
        requested_progress, lateral_progress = -delta_x, abs(delta_y)
    elif direction_key == "down":
        requested_progress, lateral_progress = delta_y, abs(delta_x)
    elif direction_key == "up":
        requested_progress, lateral_progress = -delta_y, abs(delta_x)
    else:
        return MovementOutcome("MOVE_NO_PROGRESS", "blocked", delta_x, delta_y)

    if requested_progress <= -MOVEMENT_EPSILON_PX:
        code = "MOVE_OPPOSITE"
    elif lateral_progress >= MOVEMENT_EPSILON_PX and lateral_progress > max(requested_progress, 0):
        code = "MOVE_DIVERTED"
    elif requested_progress >= MOVEMENT_EPSILON_PX:
        code = "MOVE_SUCCEEDED" if tile_changed else "MOVE_IN_PROGRESS"
    else:
        code = "MOVE_NO_PROGRESS"

    execution_state = "executed" if code in EXECUTED_CODES else "blocked"
    return MovementOutcome(code, execution_state, delta_x, delta_y)


def public_action_code(value: Any) -> str:
    code = str(value or "").strip().upper()
    return code if code in PUBLIC_ACTION_CODES else "UNKNOWN"


def public_execution_state(value: Any) -> str:
    state = str(value or "").strip().lower()
    return state if state in {"executed", "blocked", "unconfirmed"} else ""
