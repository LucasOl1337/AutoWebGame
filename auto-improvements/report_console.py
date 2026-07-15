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

# Keep the Windows dashboard alive when its console inherits a legacy code page.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    from memory import count_matches, load_insights, pending_tasks, MEMORY_DIR
except ModuleNotFoundError:
    from auto_improvements.memory import count_matches, load_insights, pending_tasks, MEMORY_DIR


BROKER_BASE = os.environ.get("BROKER_BASE", "http://127.0.0.1:8766").rstrip("/")
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


def _human_error(error_code: str) -> str:
    code = str(error_code or "")
    if code.startswith("action_") and code.endswith("_invalid"):
        action_number = code[len("action_"):-len("_invalid")]
        if action_number.isdigit():
            return f"ação {action_number} inválida"
    if code.startswith("action_count_"):
        count = code[len("action_count_"):]
        if count.isdigit():
            return f"{count} ações recebidas"
    if code.startswith("plan_oscillation_"):
        count = code[len("plan_oscillation_"):]
        if count.isdigit():
            return f"plano oscila em {count} reversões imediatas"
    return {
        "invalid_json": "JSON inválido",
        "response_not_object": "resposta não estruturada",
        "micro_actions_missing": "lista de ações ausente",
        "no_valid_actions": "nenhuma ação válida",
        "repair_budget_exhausted": "orçamento de reparo esgotado",
        "model_timeout": "modelo excedeu o tempo",
        "model_access_error": "acesso ao modelo falhou",
        "agent_error": "falha do agente",
    }.get(code, "plano recusado")


def _format_agent_plan_status(status: dict[str, Any], heartbeat_age_seconds: float) -> tuple[str, str]:
    provider = str(status.get("provider", "") or "controlador não informado")
    model = str(status.get("model", "") or "modelo padrão")
    controller = f"{provider} · {model}"
    if heartbeat_age_seconds >= 10:
        return red(f"HEARTBEAT ATRASADO {heartbeat_age_seconds:.0f}s"), controller

    state = str(status.get("status", "online") or "online")
    action_count = int(status.get("planActionCount", 0) or 0)
    valid_count = int(status.get("planValidActionCount", 0) or 0)
    required_count = int(status.get("planRequiredActionCount", 0) or 0)
    latency_ms = int(status.get("latencyMs", 0) or 0)
    repair_latency_ms = int(status.get("repairLatencyMs", 0) or 0)
    duration_ms = int(status.get("planDurationMs", 0) or 0)
    reversal_count = int(status.get("planReversalCount", 0) or 0)
    oscillation_run = int(status.get("planOscillationRun", 0) or 0)
    valid_until_ms = int(status.get("planValidUntilMs", 0) or 0)
    validity_remaining_ms = max(0, valid_until_ms - now_ms()) if valid_until_ms else 0
    plan_ratio = f"{valid_count}/{required_count}" if required_count else f"{action_count} ações"
    reversal_label = f"{reversal_count} reversão" if reversal_count == 1 else f"{reversal_count} reversões"
    oscillation_error = str(status.get("error", "") or "").startswith("plan_oscillation_")
    blocked_streak = int(status.get("blockedActionStreak", 0) or 0)
    model_requests_in_flight = int(status.get("modelRequestsInFlight", 0) or 0)
    stale_model_requests = int(status.get("staleModelRequests", 0) or 0)
    replan_request_id = int(status.get("replanRequestId", 0) or 0)
    replan_triggered_at = int(status.get("replanTriggeredAt", 0) or 0)
    replan_reason = {
        "MOVE_NO_PROGRESS": "sem progresso",
        "MOVE_OPPOSITE": "movimento oposto",
        "MOVE_DIVERTED": "desvio lateral",
        "BOMB_NO_EFFECT": "bomba não colocada",
        "DETONATE_NO_EFFECT": "detonação sem efeito",
        "SKILL_NO_EFFECT": "habilidade não iniciou",
        "SKILL_HOLD_NO_EFFECT": "habilidade não sustentou",
        "SKILL_RELEASE_NO_EFFECT": "habilidade não liberou",
    }.get(str(status.get("replanReason", "") or ""), "ação bloqueada")

    if state == "inactive":
        return yellow("BOT INATIVO · sem plano válido"), controller
    if state == "draining_stale" and stale_model_requests > 0:
        call_label = "chamada em descarte" if stale_model_requests == 1 else "chamadas em descarte"
        extra_running = max(0, model_requests_in_flight - stale_model_requests)
        extra_detail = f" · {extra_running} chamada nova ainda ativa" if extra_running == 1 else ""
        if extra_running > 1:
            extra_detail = f" · {extra_running} chamadas novas ainda ativas"
        return yellow(
            f"AGUARDANDO RESPOSTA ANTIGA · {stale_model_requests} {call_label}"
            f"{extra_detail} · nenhum plano novo iniciado · limite de concorrência protegido"
        ), controller
    if state == "replanning_blocked" or (
        state == "thinking" and blocked_streak >= 2 and replan_request_id > 0
    ):
        block_label = "bloqueio seguido" if blocked_streak == 1 else "bloqueios seguidos"
        age_detail = ""
        if replan_triggered_at:
            age_detail = f" · há {max(0, now_ms() - replan_triggered_at) / 1000:.1f}s"
        return yellow(
            f"REPLANEJANDO · {blocked_streak} {block_label} · plano #{replan_request_id} descartado"
            f" · {replan_reason}{age_detail}"
        ), controller
    current_plan_expected = state == "active" or (
        state == "thinking"
        and not status.get("error")
        and required_count > 0
        and valid_count == required_count
    )
    if current_plan_expected and valid_until_ms and validity_remaining_ms == 0:
        expired_seconds = max(0.0, (now_ms() - valid_until_ms) / 1000)
        return red(f"PLANO EXPIRADO · há {expired_seconds:.1f}s · aguardando resposta"), controller

    if state == "repairing_plan":
        if oscillation_error:
            return yellow(
                f"PLANO INSTÁVEL · {reversal_label} · sequência alternada de {oscillation_run} ações · reparando"
            ), controller
        detail = f"REPARANDO PLANO {plan_ratio}"
        if latency_ms:
            detail += f" · {latency_ms}ms até a rejeição"
        return yellow(detail), controller
    if state == "plan_invalid":
        if oscillation_error:
            return red(
                f"PLANO INSTÁVEL · {reversal_label} · sequência alternada de {oscillation_run} ações · aguardando nova tentativa"
            ), controller
        detail = f"PLANO INVÁLIDO {plan_ratio} · {_human_error(str(status.get('error', '')))} · aguardando nova tentativa"
        return red(detail), controller
    if state == "active":
        stability = "rota estável" if reversal_count == 0 else "sem oscilação repetida"
        detail = f"PLANO ATIVO {plan_ratio}"
        if duration_ms:
            detail += f" · {duration_ms / 1000:.1f}s"
        if valid_until_ms:
            detail += f" · válido por {validity_remaining_ms / 1000:.1f}s"
        if latency_ms:
            detail += f" · {latency_ms}ms"
        if status.get("planRepaired"):
            detail += " · reparado"
            if repair_latency_ms:
                detail += f" em {repair_latency_ms}ms"
        detail += f" · {stability} · {reversal_label}"
        if blocked_streak >= 2 and replan_request_id > 0:
            detail += f" · REPLANO APLICADO após #{replan_request_id}"
        return green(detail), controller
    if state == "thinking":
        detail = "MODELO PENSANDO · sem plano novo"
        if oscillation_error:
            detail += (
                f" · último plano recusado · {reversal_label}"
                f" · sequência alternada de {oscillation_run} ações"
            )
        elif required_count and valid_count == required_count:
            detail += f" · plano atual {plan_ratio}"
            stability = "rota estável" if reversal_count == 0 else "sem oscilação repetida"
            if duration_ms:
                detail += f" · {duration_ms / 1000:.1f}s"
            if valid_until_ms:
                detail += f" · válido por {validity_remaining_ms / 1000:.1f}s"
            if latency_ms:
                detail += f" · {latency_ms}ms"
            if status.get("planRepaired"):
                detail += " · reparado"
                if repair_latency_ms:
                    detail += f" em {repair_latency_ms}ms"
            detail += f" · {stability} · {reversal_label}"
        elif required_count and valid_count < required_count and status.get("error"):
            detail += f" · última resposta {plan_ratio} ({_human_error(str(status.get('error', '')))})"
        return cyan(detail), controller
    if state == "error":
        detail = f"ERRO DO MODELO · {_human_error(str(status.get('error', '')))}"
        if required_count:
            detail += f" · plano {plan_ratio}"
        if latency_ms:
            detail += f" · {latency_ms}ms totais"
        return red(detail), controller
    return green("AGENTE CONECTADO · aguardando plano"), controller


def _format_agent_action_outcome(status: dict[str, Any], *, now: int | None = None) -> str:
    outcome = str(status.get("lastActionOutcome", "") or "")
    if outcome not in {"executed", "blocked", "unconfirmed"}:
        return ""

    labels = {
        "executed": green("EXECUTADA"),
        "blocked": red("BLOQUEADA"),
        "unconfirmed": yellow("NÃO CONFIRMADA"),
    }
    directions = {"up": "CIMA", "down": "BAIXO", "left": "ESQUERDA", "right": "DIREITA"}
    result_labels = {
        "MOVE_SUCCEEDED": "movimento concluído",
        "MOVE_IN_PROGRESS": "movimento em curso",
        "MOVE_NO_PROGRESS": "sem avanço",
        "MOVE_OPPOSITE": "movimento oposto",
        "MOVE_DIVERTED": "desvio lateral",
        "UNACKNOWLEDGED": "sem confirmação do jogo",
        "WAITED": "espera confirmada",
        "BOMB_PLACED": "bomba colocada",
        "BOMB_NO_EFFECT": "bomba não colocada",
        "DETONATED": "detonação executada",
        "DETONATE_NO_EFFECT": "detonação sem efeito",
        "SKILL_STARTED": "habilidade iniciada",
        "SKILL_NO_EFFECT": "habilidade não iniciada",
        "SKILL_HELD": "habilidade mantida",
        "SKILL_HOLD_NO_EFFECT": "habilidade não mantida",
        "SKILL_RELEASED": "habilidade liberada",
        "SKILL_RELEASE_NO_EFFECT": "habilidade não liberada",
        "DIED_AFTER": "bot morreu após a ação",
    }
    request_id = max(0, int(status.get("lastActionRequestId", 0) or 0))
    step = max(0, int(status.get("lastActionStep", 0) or 0)) + 1
    command = directions.get(str(status.get("lastActionDirection", "") or ""), "PARADO")
    result = result_labels.get(str(status.get("lastActionCode", "") or ""), "resultado não detalhado")
    try:
        delta_x = float(status.get("lastActionDeltaX", 0) or 0)
        delta_y = float(status.get("lastActionDeltaY", 0) or 0)
    except (TypeError, ValueError):
        delta_x = delta_y = 0.0

    if abs(delta_x) >= abs(delta_y) and abs(delta_x) > 0:
        moved = "DIREITA" if delta_x > 0 else "ESQUERDA"
        distance = abs(delta_x)
    elif abs(delta_y) > 0:
        moved = "BAIXO" if delta_y > 0 else "CIMA"
        distance = abs(delta_y)
    else:
        moved = "PARADO"
        distance = 0.0

    observed_at = max(0, int(status.get("lastActionObservedAt", 0) or 0))
    current_ms = now if now is not None else now_ms()
    age_seconds = max(0.0, (current_ms - observed_at) / 1000) if observed_at else 0.0
    movement = "sem deslocamento" if moved == "PARADO" else f"andou {moved} {distance:.1f}px"
    return f"#{request_id}.{step} {labels[outcome]} · {result} · comando {command} · {movement} · há {age_seconds:.1f}s"


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
        print(bold("Controle dos Bots:"))
        agent_statuses = report.get("agentStatuses", {})
        for agent_id, ts in sorted(heartbeats.items()):
            age = (now_ms() - ts) / 1000
            status, controller = _format_agent_plan_status(agent_statuses.get(agent_id, {}), age)
            print(f"  {agent_id}: {status} · heartbeat {age:.1f}s")
            print(f"           {controller}")
            action_outcome = _format_agent_action_outcome(agent_statuses.get(agent_id, {}))
            if action_outcome:
                print(f"           última microação {action_outcome}")
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
