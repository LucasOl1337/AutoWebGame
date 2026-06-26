# CodeGraph context notes

Generated at: 2026-06-25T22:16:45-03:00

This file records the structural context used to build the inventory. CodeGraph MCP was available and preferred over raw search for symbol relationships.

## Commands and tools used

- `codegraph --version`: `0.9.4`
- `codegraph sync .`: index already up to date
- `codegraph status .`: healthy WAL index
- `codegraph files --json`: 124 indexed files
- MCP `codegraph_status`: confirmed 124 files, 3,157 nodes, 7,226 edges
- MCP `codegraph_context`:
  - `GameApp local gameplay rendering input bombs powerups bot ai and menu UI architecture`
  - `OnlineSessionClient lobby quick match manual lobby websocket session sync protocol client architecture`
  - `Cloudflare worker backend GlobalLobby Durable Object rooms matchmaking endless classic authoritative match tick skill mapping`
  - `character skill system Ranni Killer Bee Nico Crocodilo skill registry activation channel cooldown mechanics`
- MCP `codegraph_explore` once for the main runtime flow:
  - `GameApp OnlineSessionClient GlobalLobby createDefaultArenaDefinition createArenaState buildSkillContext updatePlayerSkillChannel activatePlayerSkill syncPlayerSkill resolveOnlineSessionState pushOnlineRenderSample projectNetworkPlayerPosition InputController BotDecision`

## Main symbols identified

### Runtime game shell

- `GameApp` in `src/Engine/game-app.ts`
  - Main browser/headless game runtime.
  - Owns canvas rendering, local match state, online prediction/reconciliation, HUD, bot fill, input processing, bombs, flames, powerups, skills and round result flow.
  - CodeGraph shows this file as the largest source module: 372 nodes and about 183 KB.

- `InputController` in `src/Engine/input.ts`
  - Handles keyboard input aliases and exposes pressed/held actions used by `GameApp`.

- `SoundManager` in `src/Engine/sound-manager.ts`
  - Central one-shot audio manager used from gameplay and online transition code.

- `loadAssets` / character sprite helpers in `src/Engine/assets.ts`
  - Asset/roster loading layer for sprites and manifest-backed characters.

### Gameplay model

- `PlayerState`, `BombState`, `FlameState`, `PowerUpState`, `ArenaState` in `src/Gameplay/types.ts`
  - Shared TypeScript contracts for gameplay entities.

- `createDefaultArenaDefinition`, `createArena`, `validateArenaDefinition` in `src/Arenas/arena.ts`
  - Arena construction and runtime validation.

- `getPowerUpDefinition` and `POWER_UP_DEFINITIONS` in `src/Gameplay/powerups.ts`
  - Static powerup model for bomb, flame, speed and remote upgrades.

### Character skills

- `CharacterSkillId` in `src/Gameplay/types.ts`
  - Current IDs: `ranni-ice-blink`, `killer-bee-wing-dash`, `nico-arcane-beam`, `crocodilo-emerald-surge`.

- `CHARACTER_SKILL_DEFINITIONS` and `getCharacterSkillId` in `src/ultimate/skill-registry.ts`
  - Maps character IDs to skill IDs and cooldowns.

- `activatePlayerSkill`, `updatePlayerSkillChannel`, `syncPlayerSkill` in `src/ultimate/skill-system.ts`
  - Dispatches skills to per-character modules.

- Character mechanics:
  - `src/Characters/CustomMechanics/ranni-skill.ts`
  - `src/Characters/CustomMechanics/killer-bee-skill.ts`
  - `src/Characters/CustomMechanics/nico-skill.ts`
  - `src/Characters/CustomMechanics/crocodilo-skill.ts`

### Online client

- `OnlineSessionClient` in `src/NetCode/session-client.ts`
  - DOM-based experience shell for landing, lobby list, setup and match screens.
  - Handles language switcher, quick account creation, feedback, quick match, endless match, manual lobby, seat selection, chat and websocket messages.

- `ClientMessage` and `ServerMessage` in `src/NetCode/protocol.ts`
  - Shared online protocol contracts.

- `resolveOnlineSessionState`, `shouldResetPlayingRoom` in `src/NetCode/matchmaking.ts`
  - Client-side/state-machine helpers for online lobby and room status.

- `pushOnlineRenderSample`, `projectNetworkPlayerPosition`, input latch helpers in `src/NetCode/online-sync.ts`
  - Snapshot interpolation, guest prediction and input reconciliation helpers.

### Worker backend

- `GlobalLobby` in `worker/index.js`
  - Cloudflare Durable Object for rooms, websocket members, quick match queue, endless room, authoritative matches, account/session endpoints, admin arena APIs, telemetry and feedback.

- Worker handlers identified by CodeGraph:
  - `handleCreateLobby`, `handleJoinLobby`, `handleLeaveLobby`
  - `handleClaimSeat`, `handleSetCharacter`, `handleSetReady`
  - `handleQuickMatch`, `handleEndlessMatch`
  - `handleChatSend`, `handleMatchInput`, `handleMatchResultChoice`
  - `handleAccountMe`, `handleQuickAccountCreate`, `handleAccountLogout`
  - `handleTelemetryIngest`, `handleFeedbackIngest`
  - `handleAdminLogin`, `handleAdminSummary`, `handleAdminArenaList`, `handleAdminArenaCreate`, `handleAdminArenaGet`, `handleAdminArenaUpdate`, `handleAdminArenaValidate`, `handleAdminArenaActivate`

### Automation and support code

- `auto-improvements/*.py`
  - Python broker/manager/worker/live-agent tooling for automation and bot improvement loops.

- `scripts/pixellab_*.mjs`, `scripts/import_pixellab_characters.mjs`
  - Asset generation/import pipeline.

- `tools/airtest-assets/*`
  - Python image/template tooling for Airtest asset checks.

## Important structural observations

- `GameApp`, `OnlineSessionClient` and `worker/index.js` are large orchestration modules and are the main maintenance risk.
- `scripts/online_server.mjs` duplicates some legacy online server concepts also present in `worker/index.js`; package scripts label it as `serve:online:legacy-relay`.
- `scripts/.temp-static-server.cjs` is indexed and appears to be a temp support artifact; consider moving it out of tracked/indexed source if not intentional.
- Docs contain many TODO sections in `docs/progress.md` and `progress.md`; these are planning artifacts, not necessarily broken runtime code.
- The README paths point to `C:\Users\user\Desktop\AutoWebGame`, while this run used `C:\Projetos\AutoWebGame`; update README links if exact local paths matter.
