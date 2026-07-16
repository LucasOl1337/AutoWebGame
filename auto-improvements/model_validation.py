"""Shared model-validation freshness rules for the bot operator surfaces."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


MODEL_VALIDATION_MAX_AGE_SECONDS = 15 * 60


def parse_validation_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def assess_model_validation(
    profile: dict[str, Any],
    provider: str,
    model: str,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    raw = profile.get("modelValidation")
    validation = raw if isinstance(raw, dict) else {}
    status = str(validation.get("status", "unvalidated") or "unvalidated").strip().lower()
    validated_at = parse_validation_time(validation.get("validatedAt"))
    now_utc = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    age_seconds = max(0.0, (now_utc - validated_at).total_seconds()) if validated_at else None
    validated_provider = str(validation.get("provider", "") or "").strip()
    validated_model = str(validation.get("requestedModel", "") or "").strip()

    reason = ""
    if status == "ready" and (validated_provider != provider or validated_model != model):
        status, reason = "stale", "configuration_changed"
    elif status == "ready" and validated_at is None:
        status, reason = "stale", "missing_timestamp"
    elif status == "ready" and age_seconds is not None and age_seconds > MODEL_VALIDATION_MAX_AGE_SECONDS:
        status, reason = "stale", "expired"
    elif status not in {"ready", "error"}:
        status = "unvalidated"

    return {
        "status": status,
        "reason": reason,
        "ageSeconds": age_seconds,
        "validation": validation,
    }
