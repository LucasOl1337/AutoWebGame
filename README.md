# BOMBA v0.1

`BOMBA` is a browser-first Bomberman-style arena game with a TypeScript/Vite client and a Cloudflare Worker backend for online sessions.

This repository is the central `v0.1` baseline. The goal of this branch is to keep one trustworthy release state that combines the parallel agent work into a single source of truth.

## What Ships In v0.1

- Local classic matches with offline bot fill.
- Online lobby flow through the Cloudflare Worker shell.
- Quick match and manual lobby entry points.
- Four skill-enabled signature characters: `Ranni`, `Killer Bee`, `Nico`, and `Crocodilo Arcano`.
- Arena theme system with a clean default and optional alternate themes.
- Asset-manifest based character loading so roster changes stay data-driven.

## Tech Stack

- Frontend: Vite + TypeScript
- Backend: Cloudflare Worker
- Runtime split: `src/app/` for shell, rendering, skills, and UI orchestration.
- Runtime split: `src/game/` for arena/gameplay helpers.
- Runtime split: `src/online/` for client protocol, lobby rules, matchmaking/session state, and telemetry.
- Runtime split: `worker/` for authoritative online room state.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the full local stack:

```bash
npm run dev
```

That command builds once, then starts:

- frontend on `http://127.0.0.1:5173`
- local Worker backend on `http://127.0.0.1:8787`

Useful alternatives:

- `npm run dev:frontend` for frontend-only Vite dev
- `npm run serve:online` for a local Worker-focused online session run
- `npm run build` for the production bundle
- `npm run deploy:cloudflare` to publish the Worker-backed build

## Release-Oriented Test Commands

Core checks used to keep `v0.1` stable:

```bash
npm run build
npm run test:lobby-rules
npm run test:matchmaking-state
npm run test:online-4p
npm run test:online-character-selection
npm run test:server-character-skill
npm run test:skill-contract
npm run test:online-skill-reconcile
npm run test:bomb-hit-window
npm run test:bomb-chain
npm run test:shield
npm run test:player-sprite
npm run test:roster-sync
```

## Arena Themes

The official default theme is `tournament-clean`, a procedural board built for low visual noise and fast route readability.

Optional alternates currently in the repo:

- `arcane-citadel`
- `verdant-ruins`
- `skyfoundry-bastion`

You can preview a theme with:

```text
?arenaTheme=<theme-id>
```

Theme definitions live in [src/app/arena-theme-library.ts](C:\Users\user\Desktop\AutoWebGame\src\app\arena-theme-library.ts).

## Code Principles

- Gameplay readability first. Floor, walls, crates, bombs, flames, and pickups must remain easy to parse under pressure.
- Online logic stays authoritative in the Worker. Client-side features should not fork the rules of the match.
- Character skills are modular. New signature abilities should live in `src/app/characters/` and plug into the registry/contract, instead of expanding one monolithic skill file.
- Assets and rosters are data-driven. Character manifests and theme libraries are intended to be edited as release data, not scattered as hardcoded exceptions.
- Scratch outputs do not belong in release commits. Temporary screenshots, exported remote HTML, and local notes should stay ignored so `main` remains trustworthy.

## Important Files

- [package.json](C:\Users\user\Desktop\AutoWebGame\package.json)
- [src/app/game-app.ts](C:\Users\user\Desktop\AutoWebGame\src\app\game-app.ts)
- [src/online/session-client.ts](C:\Users\user\Desktop\AutoWebGame\src\online\session-client.ts)
- [worker/index.js](C:\Users\user\Desktop\AutoWebGame\worker\index.js)
- [public/assets/characters/manifest.approved.json](C:\Users\user\Desktop\AutoWebGame\public\assets\characters\manifest.approved.json)
- [docs/next-map-creation-guide.md](C:\Users\user\Desktop\AutoWebGame\docs\next-map-creation-guide.md)

## Notes For Future Changes

- Treat `main` as the official release line once this `v0.1` consolidation lands.
- Prefer adding new checks to `package.json` scripts when introducing new gameplay or online behavior.
- If a feature generates lots of local inspection artifacts, route them into ignored paths instead of the repo root.
