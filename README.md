# BOMBA PvP

`BOMBA PvP` is a browser-first Bomberman-style arena game with a TypeScript/Vite client and a Cloudflare Worker backend for online sessions.

Official public deployment: https://bombapvp.com/

This repository is the central release line for the deployed game. Keep `main` as the trustworthy source of truth that consolidates parallel agent work before publishing.

## What Ships Now

- Local classic matches with offline bot fill.
- Online lobby flow through the Cloudflare Worker shell.
- Quick match, manual room entry, and invite-link helpers.
- Four skill-enabled signature characters: `Ranni`, `Killer Bee`, `Nico`, and `Crocodilo Arcano`.
- Nine arena themes: `tournament-clean`, `arcane-citadel`, `verdant-ruins`, `skyfoundry-bastion`, `royal-marble`, `glacier-sanctum`, `obsidian-garden`, `tidal-foundry`, and `ember-kiln`.
- Asset-manifest based character loading so roster changes stay data-driven.

## Tech Stack

- Frontend: Vite + TypeScript
- Backend: Cloudflare Worker
- Game orchestration: `src/Engine/`
- Arena/theme data: `src/Arenas/`
- Character skills and manifests: `src/Characters/` and `src/ultimate/`
- Online client/session code: `src/NetCode/`
- UI entrypoint and layout: `src/UiLayouts/`
- Worker room/API state: `worker/`

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

Core checks used to keep the release line stable:

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
npm run test:arena-theme-selection
npm run test:character-sprite-fallback
```

Focused checks for recent consolidation work:

```bash
npm run test:input-page-scroll
npm run test:local-match-chrome
npm run test:pickup-sprint
npm run test:hud-critical
npm run test:powerup-hud
npm run test:round-outcome
npm run test:round-start-cue
npm run test:active-arena-fetch
npm run test:growth-telemetry-retry
```

## Arena Themes

The official default theme is `tournament-clean`, a procedural board built for low visual noise and fast route readability.

You can preview a theme with:

```text
?arenaTheme=<theme-id>
```

Theme definitions live in [src/Arenas/arena-theme-library.ts](src/Arenas/arena-theme-library.ts).

## Code Principles

- Gameplay readability first. Floor, walls, crates, bombs, flames, and pickups must remain easy to parse under pressure.
- Online logic stays authoritative in the Worker. Client-side features should not fork the rules of the match.
- Character skills are modular. New signature abilities should live in `src/Characters/CustomMechanics/` and plug into the registry/contract instead of expanding one monolithic skill file.
- Assets and rosters are data-driven. Character manifests and theme libraries are intended to be edited as release data, not scattered as hardcoded exceptions.
- Scratch outputs do not belong in release commits. Temporary screenshots, exported remote HTML, and local notes should stay ignored so `main` remains trustworthy.

## Important Files

- [package.json](package.json)
- [src/Engine/game-app.ts](src/Engine/game-app.ts)
- [src/NetCode/session-client.ts](src/NetCode/session-client.ts)
- [worker/index.js](worker/index.js)
- [public/Assets/Characters/Animations/manifest.approved.json](public/Assets/Characters/Animations/manifest.approved.json)
- [docs/next-map-creation-guide.md](docs/next-map-creation-guide.md)

## Notes For Future Changes

- Treat `main` as the official release line before deploys.
- Prefer adding new checks to `package.json` scripts when introducing new gameplay or online behavior.
- If a feature generates lots of local inspection artifacts, route them into ignored paths instead of the repo root.
