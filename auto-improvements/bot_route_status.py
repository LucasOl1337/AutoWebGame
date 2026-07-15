"""Human-readable, secret-safe view of the next configured Codex route."""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timezone
from typing import Any

from bot_manager import BotManager, compact_line


STATUS_LABELS = {
    "ready": "PRONTA SALVA · frescor desconhecido",
    "unvalidated": "NÃO VERIFICADA",
    "error": "ERRO",
}

CONTROL_TEXT_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")
MODEL_VALIDATION_MAX_AGE_SECONDS = 15 * 60


def _safe_text(value: Any, fallback: str) -> str:
    cleaned = CONTROL_TEXT_RE.sub(" ", str(value or ""))
    return compact_line(cleaned)[:120] or fallback


def _controller_for_next_start(profile: dict[str, Any]) -> tuple[str, str, str]:
    provider = _safe_text(profile.get("provider"), "openai_codex")
    model = _safe_text(profile.get("model"), "")
    reasoning = _safe_text(profile.get("reasoningEffort"), "")
    # Mirrors the defaults applied by MainBot._start_live_agent.
    if provider == "openai_codex":
        model = model or "gpt-5.4-mini"
        reasoning = reasoning or "low"
    return provider, model or "padrão do provedor", reasoning or "padrão do provedor"


def _parse_validation_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _model_validation_label(
    profile: dict[str, Any],
    provider: str,
    configured_model: str,
    *,
    now: datetime | None = None,
) -> tuple[str, str]:
    validation = profile.get("modelValidation")
    status = ""
    if isinstance(validation, dict):
        status = compact_line(str(validation.get("status", "") or "")).lower()
    if status == "ready" and isinstance(validation, dict):
        validated_provider = compact_line(str(validation.get("provider", "") or ""))
        validated_model = compact_line(str(validation.get("requestedModel", "") or ""))
        validated_at = _parse_validation_time(validation.get("validatedAt"))
        now_utc = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
        age_seconds = max(0.0, (now_utc - validated_at).total_seconds()) if validated_at else None
        if validated_provider != provider or validated_model != configured_model:
            return "DESATUALIZADO · configuração mudou", "stale"
        if age_seconds is None:
            return "DESATUALIZADO · sem timestamp", "stale"
        if age_seconds > MODEL_VALIDATION_MAX_AGE_SECONDS:
            return "DESATUALIZADO · mais de 15 min", "stale"
        age_minutes = max(0, int(age_seconds // 60))
        return f"VALIDADO · há {age_minutes} min", "ready"
    if status == "error":
        return "ERRO NA ÚLTIMA VALIDAÇÃO", "error"
    return "NÃO VALIDADO", "unvalidated"


def _model_action(model_status: str, provider: str) -> str:
    if model_status == "ready":
        return f"acompanhe a saúde de {provider} e as decisões no HUD."
    if model_status == "error":
        return "corrija a última falha e valide o modelo antes da partida."
    if model_status == "stale":
        return "revalide o modelo para a configuração atual antes da partida."
    return "valide o modelo antes da partida."


def _route_health_and_action(route: list[dict[str, Any]]) -> tuple[str, str]:
    if not route:
        return "SEM ROTA NO PERFIL", "associe uma conta ou confirme o fallback local automático antes de iniciar."
    first_status = route[0].get("validationStatus")
    if first_status == "ready":
        return "PRONTA SALVA · FRESCOR DESCONHECIDO", "se o agente já roda, reinicie-o para aplicar a ordem; acompanhe o HUD."
    if first_status == "error":
        return "ERRO", "corrija ou revalide a conta antes de iniciar o controlador."
    return "NÃO VERIFICADA", "valide a primeira conta antes de confiar no controlador."


def _route_role(entry: dict[str, Any], index: int) -> str:
    if index == 0:
        return "primeira no próximo início"
    if entry.get("validationStatus") == "error":
        return "último recurso"
    if entry.get("validationStatus") == "ready":
        return "fallback verificado"
    return "fallback não verificado"


def format_bot_route_status(manager: BotManager, profile: dict[str, Any]) -> str:
    """Render route health without exposing CODEX_HOME values or credentials."""
    bot_id = _safe_text(profile.get("botId"), "desconhecido")
    display_name = _safe_text(profile.get("displayName"), bot_id)
    provider, model, reasoning = _controller_for_next_start(profile)
    configured_model = compact_line(str(profile.get("model", "") or ""))
    model_validation, model_status = _model_validation_label(profile, provider, configured_model)
    route = manager.resolve_codex_route_for_profile(profile) if provider == "openai_codex" else []
    if provider != "openai_codex":
        return "\n".join([
            f"BOT OBSERVADO: {display_name} ({bot_id})",
            f"CONTROLADOR NO PRÓXIMO INÍCIO: {provider} / {model} / raciocínio {reasoning}",
            f"MODELO: {model_validation}",
            "ROTA CODEX CONFIGURADA: INATIVA · provedor não Codex",
            "FALLBACK CODEX: NÃO SE APLICA",
            f"AÇÃO: {_model_action(model_status, provider)}",
            "ESCOPO: nenhuma chamada de modelo foi executada por este relatório.",
        ])
    health, action = _route_health_and_action(route)
    if route and route[0].get("validationStatus") == "ready" and model_status != "ready":
        action = f"{_model_action(model_status, provider)} Reinicie o agente para aplicar esta ordem."
    lines = [
        f"BOT OBSERVADO: {display_name} ({bot_id})",
        f"CONTROLADOR NO PRÓXIMO INÍCIO: {provider} / {model} / raciocínio {reasoning}",
        f"MODELO: {model_validation}",
        f"SAÚDE DA ROTA CONFIGURADA: {health}",
        "ROTA PARA A PRÓXIMA INICIALIZAÇÃO:",
    ]
    if route:
        for index, entry in enumerate(route):
            label = _safe_text(entry.get("label"), _safe_text(entry.get("accountId"), "conta"))
            status = STATUS_LABELS.get(str(entry.get("validationStatus", "")), "NÃO VERIFICADA")
            lines.append(f"  {index + 1}. {label} · {status} · {_route_role(entry, index)}")
    else:
        lines.append("  — nenhuma conta utilizável")
    lines.extend([
        "FALLBACK LOCAL AUTOMÁTICO: adicionado pelo agente no início · saúde não avaliada",
        "POLÍTICA DE ROTAÇÃO: imediata em auth/quota ou após 3 falhas consecutivas",
        f"AÇÃO: {action}",
        "ESCOPO: não identifica o controlador atual nem avalia a saúde dos fallbacks locais",
        "e não comprova resposta do modelo; nenhuma chamada foi executada por este relatório.",
    ])
    return "\n".join(lines)


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Mostra a próxima rota configurada dos bots Codex sem revelar caminhos.")
    parser.add_argument("--bot", dest="bot_id", help="Exibe somente o bot informado.")
    args = parser.parse_args()

    manager = BotManager()
    profiles = manager.list_bots()
    if args.bot_id:
        requested = _safe_text(args.bot_id, "")
        profiles = [profile for profile in profiles if profile.get("botId") == requested]
        if not profiles:
            print(f"Bot não encontrado: {requested}")
            return 2

    for index, profile in enumerate(profiles):
        if index:
            print()
        print(format_bot_route_status(manager, profile))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
