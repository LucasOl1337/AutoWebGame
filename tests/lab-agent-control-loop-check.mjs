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
    "navigation": {
        "1": {
            "walkableDirections": ["down", "left"],
            "blockedDirections": ["up", "right"],
            "stalledForMs": 1800,
            "lastMovementDelta": {"x": 0, "y": 0},
        }
    },
}

prompt = live_agent.build_prompt(state)
assert "Walkable directions: down, left" in prompt, prompt
assert "Blocked directions: up, right" in prompt, prompt
assert "stalledForMs=1800" in prompt, prompt
print("lab-agent-control-loop-check: ok")
`;

const result = spawnSync("python", ["-c", python], {
  cwd: root,
  env: { ...process.env, AGENT_PLAYER_ID: "1" },
  encoding: "utf8",
});

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

