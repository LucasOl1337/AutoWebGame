# Swarm coordination

Shared coordination file for recurring Codex swarm sessions. Each session should claim a small, valuable, disjoint scope before editing and append evidence before closing.

## Active claims

| Session | Area | Scope | Files | Status |
|---------|------|-------|-------|--------|
| ux-local-controls-reference | UX e polimento de fluxo | Add a visible local-match controls reference to reduce first-match friction. | `src/NetCode/session-client.ts`, `src/UiLayouts/i18n.ts`, `src/UiLayouts/main.css` | in progress |
| bot-target-live-opponents | Correção de bugs reais | Make bots target live active opponents in 3/4-player matches instead of chasing defeated P1. | `src/Engine/bot-ai.ts`, `tests/bot-target-selection-check.mjs`, `package.json` | in progress |
| powerup-utility-drops | Correção de bugs reais | Make shield, bomb-pass and kick upgrades appear as real crate drops instead of hidden/manual-only mechanics. | `src/Gameplay/types.ts`, `src/Gameplay/powerups.ts`, `src/Arenas/arena.ts`, `tests/powerup-drop-rate-check.mjs`, `tests/powerup-hud-slots-check.mjs`, `tests/shield-powerup-check.mjs`, `tests/bomb-push-check.mjs` | in progress |
| bug-player-sprite-manifest-recovery | Correção de bugs reais | Preserve the approved character roster when the public character manifest request fails. | `src/Engine/assets.ts`, `tests/character-roster-manifest-fallback-check.mjs` | in progress |

## Completed work

| Session | Before | After | Evidence | Commit |
|---------|--------|-------|----------|--------|
| bomb-explosion-sfx-variation | Bomb explosions always used the same `bomb_explode_default.mp3` clip, so repeated blasts sounded identical. | Explosion SFX now uses the existing default/main variants and avoids replaying the same variant back-to-back when alternatives exist. | `npm run compile:esm && node tests/sound-manager-variation-check.mjs`; `npm run build` | `04d5bff` |
| server-tick-monotonic-clock | Backward or invalid Worker clock samples could rewind the authoritative match tick clock and make the next pump over-catch-up. | The tick pump now clamps samples to a monotonic timestamp, preserving normal catch-up without bursts after clock regressions. | `npm run test:server-tick`; `npm run build` | `4e5f52c` |
