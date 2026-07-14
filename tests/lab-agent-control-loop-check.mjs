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

trapped_recovery = live_agent.build_recovery_decision(state, {"up", "down", "left", "right"})
assert trapped_recovery["direction"] is None, trapped_recovery
assert trapped_recovery["placeBomb"] is True, "a trapped agent must open the route with a bomb"

posted = []
live_agent._http_post = lambda path, payload: (posted.append((path, payload)) or (200, {"ok": True}))
live_agent.send_heartbeat = lambda *args, **kwargs: None
agent = live_agent.LiveAgent()
agent._action_memory = memory
agent._maybe_post_tactical_recovery(state, 121)
assert posted, "the live loop must post a recovery without waiting for the slow model"
assert posted[-1][0] == "/decision", posted
assert posted[-1][1]["direction"] in {"down", "left"}, posted
print("lab-agent-control-loop-check: ok")
`;

const result = spawnSync("python", ["-c", python], {
  cwd: root,
  env: { ...process.env, AGENT_PLAYER_ID: "1" },
  encoding: "utf8",
});

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

