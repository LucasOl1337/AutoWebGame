from __future__ import annotations

import importlib.util
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
AUTO_DIR = ROOT / "auto-improvements"


def load_module(name: str, path: Path) -> Any:
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


bot_manager = load_module("lab_routing_bot_manager", AUTO_DIR / "bot_manager.py")
sys.modules.setdefault("bot_manager", bot_manager)
model_validation = load_module("lab_routing_model_validation", AUTO_DIR / "model_validation.py")
sys.modules.setdefault("model_validation", model_validation)


def make_manager(accounts: list[dict[str, Any]]) -> Any:
    manager = bot_manager.BotManager.__new__(bot_manager.BotManager)
    manager._codex_accounts = {account["id"]: account for account in accounts}
    return manager


def account(
    account_id: str,
    status: str,
    *,
    home: str | None = None,
    enabled: bool = True,
) -> dict[str, Any]:
    return {
        "id": account_id,
        "label": account_id.replace("-", " ").title(),
        "codexHome": home or f"C:/private/{account_id}",
        "enabled": enabled,
        "validation": {"status": status, "message": "fixture"},
    }


class CodexAccountRoutingTests(unittest.TestCase):
    def test_ready_account_is_attempted_before_known_error(self) -> None:
        manager = make_manager([
            account("error-first", "error"),
            account("ready-second", "ready"),
        ])

        route = manager.resolve_codex_route_for_profile({
            "codexAccountIds": ["error-first", "ready-second"],
            "codexHome": "",
        })

        self.assertEqual([entry["accountId"] for entry in route], ["ready-second", "error-first"])
        self.assertEqual([entry["validationStatus"] for entry in route], ["ready", "error"])
        self.assertEqual(manager.resolve_codex_homes_for_profile({
            "codexAccountIds": ["error-first", "ready-second"],
            "codexHome": "",
        }), ["C:/private/ready-second", "C:/private/error-first"])

    def test_route_is_stable_inside_each_health_group(self) -> None:
        manager = make_manager([
            account("unknown-a", "unvalidated"),
            account("ready-a", "ready"),
            account("ready-b", "ready"),
            account("error-a", "error"),
            account("unknown-b", "stale"),
        ])

        route = manager.resolve_codex_route_for_profile({
            "codexAccountIds": ["unknown-a", "ready-a", "ready-b", "error-a", "unknown-b"],
            "codexHome": "",
        })

        self.assertEqual(
            [entry["accountId"] for entry in route],
            ["ready-a", "ready-b", "unknown-a", "unknown-b", "error-a"],
        )

    def test_disabled_accounts_are_excluded_and_legacy_home_remains_a_fallback(self) -> None:
        manager = make_manager([
            account("disabled-ready", "ready", enabled=False),
            account("known-error", "error"),
        ])

        route = manager.resolve_codex_route_for_profile({
            "codexAccountIds": ["disabled-ready", "known-error"],
            "codexHome": "C:/private/legacy",
        })

        self.assertEqual([entry["accountId"] for entry in route], ["legacy-profile", "known-error"])
        self.assertEqual(route[0]["validationStatus"], "unvalidated")

    def test_duplicate_home_keeps_healthiest_route_without_repeating_attempt(self) -> None:
        manager = make_manager([
            account("known-error", "error", home="C:/private/shared"),
            account("ready-copy", "ready", home="C:/private/shared"),
        ])

        route = manager.resolve_codex_route_for_profile({
            "codexAccountIds": ["known-error", "ready-copy"],
            "codexHome": "",
        })

        self.assertEqual(len(route), 1)
        self.assertEqual(route[0]["accountId"], "ready-copy")
        self.assertEqual(route[0]["validationStatus"], "ready")

    def test_windows_equivalent_homes_do_not_repeat_the_same_attempt(self) -> None:
        manager = make_manager([
            account("known-error", "error", home="C:\\Private\\Codex"),
            account("ready-copy", "READY", home="c:/private/codex/"),
        ])

        route = manager.resolve_codex_route_for_profile({
            "codexAccountIds": ["known-error", "ready-copy"],
            "codexHome": "",
        })

        self.assertEqual(len(route), 1)
        self.assertEqual(route[0]["accountId"], "ready-copy")

    def test_malformed_and_unknown_validation_are_unvalidated(self) -> None:
        manager = make_manager([
            {**account("malformed", "ready"), "validation": "ready"},
            account("unknown", "sleepy"),
        ])

        route = manager.resolve_codex_route_for_profile({
            "codexAccountIds": ["malformed", "unknown"],
            "codexHome": "",
        })

        self.assertEqual([entry["validationStatus"] for entry in route], ["unvalidated", "unvalidated"])


class CodexRouteStatusUiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.status_ui = load_module("lab_routing_status_ui", AUTO_DIR / "bot_route_status.py")

    def test_status_names_controller_health_route_and_action_without_paths(self) -> None:
        manager = make_manager([
            account("error-first", "error"),
            account("ready-second", "ready"),
        ])
        profile = {
            "botId": "bot-p2",
            "displayName": "Bot P2",
            "provider": "openai_codex",
            "model": "",
            "reasoningEffort": "",
            "modelValidation": {"status": "unvalidated"},
            "codexAccountIds": ["error-first", "ready-second"],
            "codexHome": "",
        }

        output = self.status_ui.format_bot_route_status(manager, profile)

        self.assertIn("BOT OBSERVADO: Bot P2 (bot-p2)", output)
        self.assertIn("CONTROLADOR NO PRÓXIMO INÍCIO: openai_codex / gpt-5.4-mini / raciocínio low", output)
        self.assertIn("MODELO: NÃO VALIDADO", output)
        self.assertIn("SAÚDE DA ROTA CONFIGURADA: PRONTA SALVA · FRESCOR DESCONHECIDO", output)
        self.assertIn("ROTA PARA A PRÓXIMA INICIALIZAÇÃO", output)
        self.assertIn("1. Ready Second · PRONTA SALVA · frescor desconhecido · primeira no próximo início", output)
        self.assertIn("2. Error First · ERRO · último recurso", output)
        self.assertIn("AÇÃO: valide o modelo antes da partida. Reinicie o agente para aplicar esta ordem.", output)
        self.assertIn("FALLBACK LOCAL AUTOMÁTICO: adicionado pelo agente no início · saúde não avaliada", output)
        self.assertIn("POLÍTICA DE ROTAÇÃO: imediata em auth/quota ou após 3 falhas consecutivas", output)
        self.assertIn("não identifica o controlador atual", output)
        self.assertIn("nem avalia a saúde dos fallbacks locais", output)
        self.assertIn("nenhuma chamada foi executada", output)
        self.assertNotIn("C:/private", output)

    def test_unvalidated_and_missing_routes_have_honest_actions(self) -> None:
        unvalidated_manager = make_manager([account("unknown", "unvalidated")])
        profile = {
            "botId": "bot-p1",
            "displayName": "Bot P1",
            "provider": "openai_codex",
            "model": "gpt-configurado",
            "codexAccountIds": ["unknown"],
            "codexHome": "",
        }
        unvalidated = self.status_ui.format_bot_route_status(unvalidated_manager, profile)
        missing = self.status_ui.format_bot_route_status(make_manager([]), {
            **profile,
            "codexAccountIds": [],
        })

        self.assertIn("SAÚDE DA ROTA CONFIGURADA: NÃO VERIFICADA", unvalidated)
        self.assertIn("AÇÃO: valide a primeira conta antes de confiar no controlador.", unvalidated)
        self.assertIn("SAÚDE DA ROTA CONFIGURADA: SEM ROTA NO PERFIL", missing)
        self.assertIn("AÇÃO: associe uma conta ou confirme o fallback local automático antes de iniciar.", missing)

    def test_non_codex_provider_never_reports_a_ready_codex_route(self) -> None:
        manager = make_manager([account("ready", "ready")])
        output = self.status_ui.format_bot_route_status(manager, {
            "botId": "bot-p9",
            "displayName": "Bot P9",
            "provider": "nine_router",
            "model": "modelo-configurado",
            "reasoningEffort": "",
            "modelValidation": {"status": "ready"},
            "codexAccountIds": ["ready"],
            "codexHome": "",
        })

        self.assertIn("ROTA CODEX CONFIGURADA: INATIVA · provedor não Codex", output)
        self.assertIn("FALLBACK CODEX: NÃO SE APLICA", output)
        self.assertNotIn("SAÚDE DA ROTA CONFIGURADA: PRONTA", output)

    def test_saved_model_validation_must_match_configuration_and_be_fresh(self) -> None:
        now = datetime(2026, 7, 15, 3, 30, tzinfo=timezone.utc)
        base = {
            "provider": "nine_router",
            "model": "modelo-novo",
        }
        mismatched = self.status_ui._model_validation_label({
            **base,
            "modelValidation": {
                "status": "ready",
                "provider": "openai_codex",
                "requestedModel": "modelo-antigo",
                "validatedAt": now.isoformat(),
            },
        }, "nine_router", "modelo-novo", now=now)
        expired = self.status_ui._model_validation_label({
            **base,
            "modelValidation": {
                "status": "ready",
                "provider": "nine_router",
                "requestedModel": "modelo-novo",
                "validatedAt": (now - timedelta(minutes=16)).isoformat(),
            },
        }, "nine_router", "modelo-novo", now=now)
        fresh = self.status_ui._model_validation_label({
            **base,
            "modelValidation": {
                "status": "ready",
                "provider": "nine_router",
                "requestedModel": "modelo-novo",
                "validatedAt": (now - timedelta(minutes=2)).isoformat(),
            },
        }, "nine_router", "modelo-novo", now=now)

        self.assertEqual(mismatched[1], "stale")
        self.assertIn("configuração mudou", mismatched[0])
        self.assertEqual(expired[1], "stale")
        self.assertIn("mais de 15 min", expired[0])
        self.assertEqual(fresh, ("VALIDADO · há 2 min", "ready"))

    def test_fresh_validation_of_blank_codex_model_matches_runtime_default_profile(self) -> None:
        now = datetime(2026, 7, 15, 3, 30, tzinfo=timezone.utc)
        profile = {
            "provider": "openai_codex",
            "model": "",
            "modelValidation": {
                "status": "ready",
                "provider": "openai_codex",
                "requestedModel": "",
                "validatedAt": (now - timedelta(minutes=1)).isoformat(),
            },
        }

        controller = self.status_ui._controller_for_next_start(profile)
        validation = self.status_ui._model_validation_label(
            profile,
            controller[0],
            profile["model"],
            now=now,
        )

        self.assertEqual(controller, ("openai_codex", "gpt-5.4-mini", "low"))
        self.assertEqual(validation, ("VALIDADO · há 1 min", "ready"))

    def test_non_codex_action_reflects_model_error(self) -> None:
        output = self.status_ui.format_bot_route_status(make_manager([]), {
            "botId": "bot-p9",
            "displayName": "Bot P9",
            "provider": "nine_router",
            "model": "modelo-configurado",
            "modelValidation": {"status": "error"},
        })

        self.assertIn("MODELO: ERRO NA ÚLTIMA VALIDAÇÃO", output)
        self.assertIn("AÇÃO: corrija a última falha e valide o modelo antes da partida.", output)

    def test_control_characters_are_removed_from_human_labels(self) -> None:
        manager = make_manager([{**account("ready", "ready"), "label": "Conta\x1b[31m ruim\nlinha"}])
        output = self.status_ui.format_bot_route_status(manager, {
            "botId": "bot-p1",
            "displayName": "Bot\x1b[2J P1",
            "provider": "openai_codex",
            "model": "",
            "modelValidation": {"status": "unvalidated"},
            "codexAccountIds": ["ready"],
            "codexHome": "",
        })

        self.assertNotIn("\x1b", output)
        self.assertNotIn("C:/private", output)
        self.assertEqual(self.status_ui._safe_text("bot\x1b[31m", ""), "bot [31m")


if __name__ == "__main__":
    suite = unittest.TestSuite([
        unittest.defaultTestLoader.loadTestsFromTestCase(CodexAccountRoutingTests),
        unittest.defaultTestLoader.loadTestsFromTestCase(CodexRouteStatusUiTests),
    ])
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    print({
        "scenarios": result.testsRun,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "readyBeforeError": result.wasSuccessful(),
    })
    raise SystemExit(0 if result.wasSuccessful() else 1)
