import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gameApp = fs.readFileSync(path.join(root, "src", "Engine", "game-app.ts"), "utf8");

assert.match(gameApp, /navigation:\s*this\.getLabNavigationSnapshot\(\)/);
assert.match(gameApp, /localTiles/);
assert.match(gameApp, /powerUps:\s*this\.arena\.powerUps/);

const python = String.raw`
import json
import sys
sys.path.insert(0, r"${path.join(root, "auto-improvements")}")
import live_agent

state = {
    "tick": 120,
    "phase": "match",
    "players": [
        {"id": 1, "active": True, "alive": True, "tile": {"x": 2, "y": 1}, "activeBombs": 0, "maxBombs": 1},
        {"id": 2, "active": True, "alive": True, "tile": {"x": 9, "y": 9}, "activeBombs": 0, "maxBombs": 1},
    ],
    "bombs": [],
    "flames": [],
    "powerUps": [{"type": "speed", "tile": {"x": 2, "y": 3}}],
    "navigation": {"1": {
        "walkableDirections": ["down", "left"],
        "blockedDirections": ["up", "right"],
        "stalledForMs": 1800,
        "lastMovementDelta": {"x": 0, "y": 0},
        "localTiles": [
            {"x": 2, "y": 1, "kind": "self", "dangerEtaMs": None},
            {"x": 3, "y": 1, "kind": "breakable", "dangerEtaMs": None},
        ],
    }},
}

prompt = live_agent.build_prompt(state)
assert "You alone choose every gameplay action" in prompt, prompt
payload = json.loads(prompt.split("STATE=", 1)[1])
assert payload["navigation"]["walkableDirections"] == ["down", "left"], payload
assert payload["navigation"]["blockedDirections"] == ["up", "right"], payload
assert payload["navigation"]["stalledForMs"] == 1800, payload
assert payload["powerUps"][0]["type"] == "speed", payload

memory = live_agent.ActionOutcomeMemory()
attempt = {"direction": "right", "placeBomb": False, "detonate": False, "useSkill": False}
memory.record(attempt, state)
memory.observe(state)
learning = memory.prompt_context(state)
assert "FAILED direction=right tile=(2,1)" in learning, learning
learned_payload = json.loads(live_agent.build_prompt(state, outcome_context=learning).split("STATE=", 1)[1])
assert any("FAILED direction=right" in line for line in learned_payload["recentOutcomes"]), learned_payload

agent = live_agent.LiveAgent()
for forbidden in (
    "_post_bootstrap_decision",
    "_maybe_post_survival_decision",
    "_maybe_post_tactical_recovery",
):
    assert not hasattr(agent, forbidden), f"runtime still exposes deterministic policy {forbidden}"

print("lab-agent-control-loop-check: ok")
`;

const result = spawnSync("python", ["-c", python], {
  cwd: root,
  env: { ...process.env, AGENT_PLAYER_ID: "1" },
  encoding: "utf8",
});

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
