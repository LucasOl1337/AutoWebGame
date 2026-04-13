# Agent Handoff

Technical brief for future agents working on layout and arena visuals.

## Scope

This repo already has a playable baseline. The current work is not "make it prettier" in the abstract.
The real problem splits into two separate systems:

1. Match shell layout and chrome density.
2. Arena readability and theme discipline.

Do not mix those into one vague "visual polish" task. They have different owners and different fixes.

## Runtime Ownership

- Match shell DOM and responsive layout live in [src/online/session-client.ts](C:\Users\user\Desktop\AutoWebGame\src\online\session-client.ts) and [src/styles/main.css](C:\Users\user\Desktop\AutoWebGame\src\styles\main.css).
- The game canvas, HUD, arena floor, walls, crates, danger overlays, bomb previews, and theme rendering live in [src/app/game-app.ts](C:\Users\user\Desktop\AutoWebGame\src\app\game-app.ts).
- Arena topology and crate placement live in [src/game/arena.ts](C:\Users\user\Desktop\AutoWebGame\src\game\arena.ts).
- Theme definitions live in [src/app/arena-theme-library.ts](C:\Users\user\Desktop\AutoWebGame\src\app\arena-theme-library.ts) and [configs/arena-theme-library.json](C:\Users\user\Desktop\AutoWebGame\configs\arena-theme-library.json).
- Existing visual planning notes live in [docs/next-map-creation-guide.md](C:\Users\user\Desktop\AutoWebGame\docs\next-map-creation-guide.md).

## Match Layout Facts

- The match screen is always rendered as `left rail + center viewport + right rail`.
- The DOM structure is built in [src/online/session-client.ts:1128](C:\Users\user\Desktop\AutoWebGame\src\online\session-client.ts:1128), [src/online/session-client.ts:1143](C:\Users\user\Desktop\AutoWebGame\src\online\session-client.ts:1143), and [src/online/session-client.ts:1146](C:\Users\user\Desktop\AutoWebGame\src\online\session-client.ts:1146).
- The shell styling is defined in [src/styles/main.css:965](C:\Users\user\Desktop\AutoWebGame\src\styles\main.css:965), [src/styles/main.css:974](C:\Users\user\Desktop\AutoWebGame\src\styles\main.css:974), and [src/styles/main.css:981](C:\Users\user\Desktop\AutoWebGame\src\styles\main.css:981).
- Low-height desktop behavior is handled mostly by breakpoint compression, not by changing the information architecture:
  - [src/styles/main.css:1517](C:\Users\user\Desktop\AutoWebGame\src\styles\main.css:1517)
  - [src/styles/main.css:1783](C:\Users\user\Desktop\AutoWebGame\src\styles\main.css:1783)
  - [src/styles/main.css:2071](C:\Users\user\Desktop\AutoWebGame\src\styles\main.css:2071)
- The canvas itself is fixed-resolution and only scales to fit the remaining viewport space in [src/app/game-app.ts:946](C:\Users\user\Desktop\AutoWebGame\src\app\game-app.ts:946).

### What This Means

- If the match screen feels cramped, the first suspect is not the canvas.
- The likely issue is that always-visible side rails are competing with the playfield for width and height.
- Breakpoint-only shrinking is already heavily used. More shrinking is the weakest next move.

## Arena Visual Facts

- Arena rendering is cached into an offscreen static layer in [src/app/game-app.ts:3245](C:\Users\user\Desktop\AutoWebGame\src\app\game-app.ts:3245).
- Dynamic hazards and actors are then drawn on top in [src/app/game-app.ts:3330](C:\Users\user\Desktop\AutoWebGame\src\app\game-app.ts:3330).
- Procedural floor language is implemented in [src/app/game-app.ts:3402](C:\Users\user\Desktop\AutoWebGame\src\app\game-app.ts:3402).
- Procedural wall language is implemented in [src/app/game-app.ts:3626](C:\Users\user\Desktop\AutoWebGame\src\app\game-app.ts:3626).
- Procedural crate language is implemented in [src/app/game-app.ts:3715](C:\Users\user\Desktop\AutoWebGame\src\app\game-app.ts:3715).
- Arena topology is deterministic and symmetry-driven in [src/game/arena.ts](C:\Users\user\Desktop\AutoWebGame\src\game\arena.ts).

### Important Separation

- Topology problems belong in `arena.ts`.
- Readability, value grouping, and material language belong in `game-app.ts` and the theme library.
- Do not "fix visuals" by changing arena topology unless the real complaint is route fairness or combat pacing.

## Observed State From Inspection

Inspection date: `2026-03-31`

### Layout

- Landing and setup screens hold up reasonably well at `1365x620`.
- Match mode fits at `1365x620` and `1365x580`, but the shell is dense and fragile.
- The current design spends a lot of space on two persistent side rails even in bot matches where chat has almost no value.
- The viewport survives because the shell keeps compressing text, padding, and controls around it.

### Arena Visuals

- `tournament-clean` is the clearest board in the repo.
- `royal-marble` is also strong because it keeps the same category discipline while adding personality.
- Sprite themes like `verdant-ruins` and `skyfoundry-bastion` are visibly noisier during live play.
- In the noisy themes, floor detail and decorative contrast compete with:
  - bombs
  - flames
  - powerups
  - player silhouettes
- The visual debt is strongest in tile centers, not on tile edges.

## High-Value Fix Directions

Use one of these tracks. Do not attempt all of them blindly in one pass.

### Track 1: Make Match Layout Gameplay-First

Best option when the complaint is "layout feels crowded" or "arena is too small".

Recommended approach:

- Treat the center playfield as the primary surface.
- Collapse or demote one side rail on shorter desktops.
- Make chat optional, hidden by default, or overlay-based during active gameplay.
- Keep room metadata and leave/invite actions in the top bar, not in a full-time heavy side column.
- Preserve the full rails for pre-match/setup, not necessarily for live match mode.

Avoid:

- another round of tiny-font breakpoint squeezing
- shrinking the canvas below the current comfort range unless absolutely necessary
- keeping chat equally prominent in offline bot matches

### Track 2: Move To Hybrid Arena Rendering

Best option when the complaint is "themes feel inconsistent" or "some maps are muddy".

Recommended approach:

- Keep procedural floor logic for category control.
- Allow sprite walls and crates only when they pass readability checks.
- Consider hybrid themes:
  - procedural floor
  - sprite wall
  - sprite crate
- This keeps lane/spawn/portal semantics stable while still allowing theme flavor on the props.

Avoid:

- importing full sprite floors just because the art looks richer in isolation
- treating all five tile types as equally decorative surfaces

### Track 3: Keep Sprite Themes But Enforce Hard Art Rules

Best option when the team wants authored tile art for all themes.

Rules that should be enforced:

- floor center must stay calm
- lane tiles must read brighter or simpler than neutral floor
- crate family must remain the warmest destructible category
- wall family must remain the heaviest structural category
- accent color must stay reserved for landmarks and VFX support
- moss, rivets, cracks, and trims should be edge-biased, not center-biased

If a theme only looks good in a still image and gets worse once bombs/flames spawn, reject it.

## Concrete Brainstorm Directions

If you need practical solution ideas instead of theory, start here:

1. Create a `compact match mode` CSS path that hides the right chat rail below a height threshold and replaces it with a small toggle button.
2. Keep the left info rail, but reduce it to score/room state/players only during gameplay.
3. Add a shell mode flag for offline bot matches so the match screen uses a simpler chrome profile than online rooms.
4. Promote `tournament-clean` and `royal-marble` as the visual baseline for category separation.
5. Convert `verdant-ruins` and `skyfoundry-bastion` into hybrid or procedural-first themes before trying to polish them with more texture.
6. Build a theme QA rubric around live-action screenshots, not just static tile previews.
7. If a sprite theme stays noisy, reduce floor contrast first. Do not start by dimming bombs, flames, or pickups.

## Fastest Repro Path

Use this when you need to inspect layout or arena visuals quickly.

1. Run `npm run dev`
2. Open `http://127.0.0.1:5173`
3. Click `Partida contra bots`
4. Use `?arenaTheme=<theme-id>` to compare themes quickly

Useful themes:

- `tournament-clean`
- `royal-marble`
- `arcane-citadel`
- `verdant-ruins`
- `skyfoundry-bastion`

## QA Baseline

Minimum desktop checks:

- `1365x620`
- `1365x580`

For each candidate fix, verify:

- the center canvas still feels primary
- bombs and flames dominate the board when active
- players are readable at a glance
- wall vs crate separation is obvious without staring
- no important match action is hidden behind unnecessary chrome

## Working Rule For Future Agents

If the complaint is about the shell, work in:

- [src/online/session-client.ts](C:\Users\user\Desktop\AutoWebGame\src\online\session-client.ts)
- [src/styles/main.css](C:\Users\user\Desktop\AutoWebGame\src\styles\main.css)

If the complaint is about board readability, work in:

- [src/app/game-app.ts](C:\Users\user\Desktop\AutoWebGame\src\app\game-app.ts)
- [src/app/arena-theme-library.ts](C:\Users\user\Desktop\AutoWebGame\src\app\arena-theme-library.ts)

If the complaint is about fairness, route control, or spawn flow, work in:

- [src/game/arena.ts](C:\Users\user\Desktop\AutoWebGame\src\game\arena.ts)

Do not patch all three subsystems at once unless the evidence clearly requires it.

## 2026-04-13 Auto-Improvements Pass

- Fixed the bot profile contract in `auto-improvements/bot_menu.py`: provider/model changes now keep full `modelValidation` metadata instead of dropping `provider` and `requestedModel`.
- Updated `auto-improvements/bot_memory/bots/bot-p1/profile.json` to restore the missing validation fields for the current P1 profile.
- Validation passed with `python -m py_compile auto-improvements/bot_menu.py auto-improvements/bot_manager.py auto-improvements/live_agent.py auto-improvements/model_manager.py auto-improvements/game_broker.py auto-improvements/mainbot.py`.

Next agent:

- If you keep working in automation tooling, check whether any other profile-edit paths or reports still assume partial `modelValidation` objects.
- Otherwise, resume the broader game/workflow work from the most recent active notes in `progress.md`.

## 2026-04-13 Sudden Death Warning Meter

- Added a sudden-death warning meter to both HUD layouts so the countdown now has a readable fill bar, not just text.
- `render_game_to_text` now exposes `match.suddenDeath.warningLabel` and `warningProgress`, which keeps the phase state observable in tests.
- The sudden-death regression now covers the warning-state snapshot before activation and the active-state snapshot after collapse begins.
- Validation passed with `node tests/sudden-death-check.mjs`, `npm run test:online-audio`, and `npm run build`.

Next agent:

- If you keep polishing match UX, consider applying the same meter treatment to other phase-based warnings so the HUD reads faster at a glance.
- If you keep working in automation tooling, keep the `modelValidation` fix in mind and avoid reintroducing partial profile writes.
