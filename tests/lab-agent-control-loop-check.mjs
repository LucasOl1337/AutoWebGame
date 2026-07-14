import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gameApp = fs.readFileSync(path.join(root, "src", "Engine", "game-app.ts"), "utf8");

assert.match(
  gameApp,
  /navigation:\s*this\.getLabNavigationSnapshot\(\)/,
  "Lab telemetry must expose walkable/blocked directions so a model can recover from obstacles",
);
assert.match(gameApp, /localTiles/, "Lab telemetry must expose a local spatial map");
assert.match(gameApp, /powerUps:\s*this\.arena\.powerUps/, "Lab telemetry must expose visible powerups");

const python = String.raw`
import json
import copy
import sys
sys.path.insert(0, r"${path.join(root, "auto-improvements")}")
import live_agent

state = {
    "tick": 120,
    "phase": "match",
    "players": [
        {"id": 1, "name": "P1", "active": True, "alive": True, "tile": {"x": 2, "y": 1}, "activeBombs": 0, "maxBombs": 1, "flameRange": 2, "speedLevel": 0},
        {"id": 2, "name": "P2", "active": True, "alive": True, "tile": {"x": 9, "y": 9}, "activeBombs": 0, "maxBombs": 1, "flameRange": 2, "speedLevel": 0},
    ],
    "bombs": [],
    "flames": [],
    "powerUps": [{"type": "speed", "tile": {"x": 2, "y": 3}}],
    "navigation": {
        "1": {
            "walkableDirections": ["down", "left"],
            "blockedDirections": ["up", "right"],
            "stalledForMs": 1800,
            "lastMovementDelta": {"x": 0, "y": 0},
            "localTiles": [
                {"x": 2, "y": 1, "kind": "self", "dangerEtaMs": None},
                {"x": 2, "y": 2, "kind": "open", "dangerEtaMs": None},
                {"x": 3, "y": 1, "kind": "breakable", "dangerEtaMs": None},
                {"x": 1, "y": 1, "kind": "open", "dangerEtaMs": 900},
            ],
        }
    },
}

prompt = live_agent.build_prompt(state)
assert "Walkable directions: down, left" in prompt, prompt
assert "Blocked directions: up, right" in prompt, prompt
assert "stalledForMs=1800" in prompt, prompt
assert "Local map:" in prompt, prompt
assert "(3,1)=breakable" in prompt, prompt
assert "(1,1)=open danger=900ms" in prompt, prompt
assert "Nearby powerups:" in prompt, prompt
assert "powerup type=speed tile=(2,3)" in prompt, prompt

memory = live_agent.ActionOutcomeMemory()
attempt = {
    "direction": "right",
    "placeBomb": False,
    "detonate": False,
    "useSkill": False,
    "reason": "approach enemy",
}
memory.record(attempt, state)
memory.observe(state)

learning = memory.prompt_context(state)
assert "FAILED direction=right tile=(2,1)" in learning, learning
assert memory.should_reject(attempt, state), "the same failed action must not be repeated at the same tile"

learned_prompt = live_agent.build_prompt(state, outcome_context=learning)
assert "Recent action outcomes" in learned_prompt, learned_prompt
assert "Do not repeat FAILED actions at the same tile" in learned_prompt, learned_prompt

recovery = live_agent.build_recovery_decision(state, memory.failed_directions(state))
assert recovery is not None, "a stalled agent must produce a tactical recovery"
assert recovery["direction"] in {"down", "left"}, recovery
assert recovery["direction"] != "right", recovery

no_escape_state = copy.deepcopy(state)
no_escape_state["navigation"]["1"]["walkableDirections"] = []
no_escape_state["navigation"]["1"]["blockedDirections"] = ["up", "down", "left", "right"]
no_escape_state["navigation"]["1"]["localTiles"] = [
    {"x": 2, "y": 1, "kind": "self", "dangerEtaMs": None},
    {"x": 2, "y": 0, "kind": "solid", "dangerEtaMs": None},
    {"x": 2, "y": 2, "kind": "breakable", "dangerEtaMs": None},
    {"x": 1, "y": 1, "kind": "solid", "dangerEtaMs": None},
    {"x": 3, "y": 1, "kind": "breakable", "dangerEtaMs": None},
]
trapped_recovery = live_agent.build_recovery_decision(no_escape_state, {"up", "down", "left", "right"})
assert trapped_recovery["direction"] is None, trapped_recovery
assert trapped_recovery["placeBomb"] is False, "a trapped agent must not plant a bomb without a proven escape route"

unsafe_model_bomb = live_agent.enforce_survival_safety({
    "playerId": "1",
    "botId": "lab-agent-1",
    "direction": None,
    "placeBomb": True,
    "detonate": False,
    "useSkill": False,
    "reason": "open crates",
}, no_escape_state)
assert unsafe_model_bomb["placeBomb"] is False, unsafe_model_bomb
assert "no proven escape" in unsafe_model_bomb["reason"].lower(), unsafe_model_bomb

own_bomb_state = copy.deepcopy(state)
own_bomb_state["bombs"] = [{
    "ownerId": 1,
    "tile": {"x": 2, "y": 1},
    "fuseMs": 1800,
    "flameRange": 2,
}]
own_bomb_state["navigation"]["1"]["walkableDirections"] = ["down"]
own_bomb_state["navigation"]["1"]["blockedDirections"] = ["up", "left", "right"]
own_bomb_state["navigation"]["1"]["localTiles"] = [
    {"x": 2, "y": 1, "kind": "self", "dangerEtaMs": 1800},
    {"x": 2, "y": 2, "kind": "open", "dangerEtaMs": 1800},
    {"x": 2, "y": 3, "kind": "open", "dangerEtaMs": 1800},
    {"x": 3, "y": 2, "kind": "open", "dangerEtaMs": None},
]
survival = live_agent.build_survival_decision(own_bomb_state)
assert survival is not None, "an agent standing on its bomb must enter survival control"
assert survival["direction"] == "down", survival
assert survival["placeBomb"] is False, survival

escape_turn_state = copy.deepcopy(own_bomb_state)
escape_turn_state["players"][0]["tile"] = {"x": 2, "y": 2}
escape_turn_state["navigation"]["1"]["walkableDirections"] = ["down", "right"]
escape_turn_state["navigation"]["1"]["blockedDirections"] = ["up", "left"]
escape_turn_state["navigation"]["1"]["localTiles"] = [
    {"x": 2, "y": 1, "kind": "bomb", "dangerEtaMs": 1800},
    {"x": 2, "y": 2, "kind": "self", "dangerEtaMs": 1800},
    {"x": 2, "y": 3, "kind": "open", "dangerEtaMs": 1800},
    {"x": 3, "y": 2, "kind": "open", "dangerEtaMs": None},
]
escape_turn = live_agent.build_survival_decision(escape_turn_state)
assert escape_turn is not None, escape_turn
assert escape_turn["direction"] == "right", escape_turn

safe_model_bomb_state = copy.deepcopy(state)
safe_model_bomb_state["navigation"]["1"]["walkableDirections"] = ["down"]
safe_model_bomb_state["navigation"]["1"]["blockedDirections"] = ["up", "left", "right"]
safe_model_bomb_state["navigation"]["1"]["localTiles"] = copy.deepcopy(own_bomb_state["navigation"]["1"]["localTiles"])
safe_model_bomb_state["navigation"]["1"]["localTiles"][0]["dangerEtaMs"] = None
safe_model_bomb_state["navigation"]["1"]["localTiles"][1]["dangerEtaMs"] = None
safe_model_bomb_state["navigation"]["1"]["localTiles"][2]["dangerEtaMs"] = None
safe_model_bomb = live_agent.enforce_survival_safety({
    "playerId": "1",
    "botId": "lab-agent-1",
    "direction": None,
    "placeBomb": True,
    "detonate": False,
    "useSkill": False,
    "reason": "open crates",
}, safe_model_bomb_state)
assert safe_model_bomb["placeBomb"] is True, safe_model_bomb
assert safe_model_bomb["direction"] == "down", safe_model_bomb

posted = []
live_agent._http_post = lambda path, payload: (posted.append((path, payload)) or (200, {"ok": True}))
live_agent.send_heartbeat = lambda *args, **kwargs: None
agent = live_agent.LiveAgent()
agent._action_memory = memory
agent._maybe_post_tactical_recovery(state, 121)
assert posted, "the live loop must post a recovery without waiting for the slow model"
assert posted[-1][0] == "/decision", posted
assert posted[-1][1]["direction"] in {"down", "left"}, posted
posted.clear()
assert agent._maybe_post_survival_decision(own_bomb_state, 122) is True
assert posted[-1][0] == "/decision", posted
assert posted[-1][1]["direction"] == "down", posted
assert posted[-1][1]["placeBomb"] is False, posted
safe_after_escape = copy.deepcopy(escape_turn_state)
safe_after_escape["players"][0]["tile"] = {"x": 3, "y": 2}
safe_after_escape["bombs"] = []
safe_after_escape["navigation"]["1"]["localTiles"] = [
    {"x": 3, "y": 2, "kind": "self", "dangerEtaMs": None},
]
posted.clear()
assert agent._maybe_post_survival_decision(safe_after_escape, 123) is False
assert posted[-1][1]["direction"] is None, posted
assert "escape complete" in posted[-1][1]["reason"].lower(), posted
print("lab-agent-control-loop-check: ok")
`;

const result = spawnSync("python", ["-c", python], {
  cwd: root,
  env: { ...process.env, AGENT_PLAYER_ID: "1" },
  encoding: "utf8",
});

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

