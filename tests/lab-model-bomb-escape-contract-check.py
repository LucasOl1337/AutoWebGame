from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROMPT_PATH = ROOT / "auto-improvements" / "live_agent_system_prompt.txt"
SCHEMA_PATH = ROOT / "auto-improvements" / "live_agent_output_schema.json"


def main() -> None:
    prompt = PROMPT_PATH.read_text(encoding="utf-8")
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    normalized = " ".join(prompt.lower().split())
    action_schema = schema["properties"]["microActions"]["items"]
    checks = {
        "provider_compatible_array_items": isinstance(action_schema.get("items"), dict),
        "unsupported_tuple_keyword_removed": "prefixItems" not in action_schema,
        "escape_before_bomb": "before any microaction with placebomb=true" in normalized,
        "outside_full_blast": "outside the bomb's full projected blast" in normalized,
        "fits_before_fuse": "fit before the fuse expires" in normalized,
        "short_fuse_or_chain_deadline": "shortfuselevel or a possible chain reaction" in normalized,
        "bomb_before_movement": "bomb is placed on the current tile before movement begins" in normalized,
        "blocked_route_is_unsafe": "walls, crates, bombs, flames, and closing sudden-death tiles" in normalized,
        "players_are_dynamic_risk": "players as dynamic collision risks" in normalized,
        "no_route_means_no_bomb": "if that route is missing or uncertain, keep placebomb=false" in normalized,
        "no_repeated_press": "never repeat placebomb=true on consecutive microactions" in normalized,
        "new_placement_revalidated": "after leaving the previous bomb tile and independently revalidating a new escape route" in normalized,
        "human_intent_prefix": "escape:, bomb:, chase:, powerup:, or hold:" in normalized,
        "bomb_reason_has_escape_evidence": "include the escape direction and approximate time to clear the blast" in normalized,
    }
    passed = sum(checks.values())
    result = {
        "scenario": "model bomb self-trap contract",
        "passed": passed,
        "total": len(checks),
        "checks": checks,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if passed != len(checks):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
