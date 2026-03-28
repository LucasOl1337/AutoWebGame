# Ultimate Creation Guide

This file is the contract for adding new character ultimates without repeating the earlier mistakes.

## Goals

- Keep each ultimate isolated by `skill.id`.
- Reuse the shared input, simulation, and render pipeline.
- Preserve local and online parity.
- Require a deterministic mechanic test before shipping.

## Current Skill Model

- Character skill binding lives in `src/app/game-app.ts` inside `getPlayerSkillId()`.
- Runtime state lives in `PlayerState.skill`.
- Shared phases:
  - `idle`
  - `channeling`
  - `cooldown`
- Shared fields already available:
  - `channelRemainingMs`
  - `cooldownRemainingMs`
  - `castElapsedMs`
  - `projectedPosition`
  - `projectedLastMoveDirection`

## Implementation Path

1. Add the new skill id
   - File: `src/core/types.ts`
   - Extend `CharacterSkillId`.

2. Bind character -> skill
   - File: `src/app/game-app.ts`
   - Add the character UUID constant.
   - Return the new skill id in `getPlayerSkillId()`.

3. Add balance constants
   - File: `src/app/game-app.ts`
   - Distance, duration, cooldown, and skill animation frame rate live near the main gameplay constants.

4. Implement three explicit handlers
   - `startXSkill(...)`
   - `updateXSkill(...)`
   - `finishXSkill(...)`
   - Route them only through:
     - `activatePlayerSkill(...)`
     - `updatePlayerSkillChannel(...)`

5. Handle immunity separately when needed
   - If the skill changes death or damage rules, wire it into `isPlayerImmuneDuringSkillChannel(...)` or another explicit rule.
   - Do not bury invulnerability inside movement code.

6. Add the render override
   - File: `src/app/game-app.ts`
   - Use `getActiveSkillAnimationFrames(...)`.
   - Prefer exact-direction skill frames first.
   - Fall back to generic movement frames only when the custom strip is missing locally.

7. Add or update PixelLab import rules
   - File: `scripts/import_pixellab_characters.mjs`
   - Filter by the exact ultimate animation name or a tight pattern.
   - Do not rely on generic `"run"` or `"attack"` matching when a named ult strip exists.

8. Add a mechanic test
   - File: `tests/<character>-ult-*.mjs`
   - Validate:
     - activation
     - movement/result
     - cooldown
     - collision/blocking
     - immunity or cancel behavior if the skill has one

9. Revalidate previous ultimates
   - Minimum after every new ultimate:
     - `npm run test:ranni-ult`
     - the new ultimate test
     - `npm run build`

## Asset Rules

- If the correct strip is already in the repo, use it directly.
- If it exists only in PixelLab:
  - add the name filter to `scripts/import_pixellab_characters.mjs`
  - sync the character pack
  - only fall back visually if the downloaded strip is still incomplete by direction
- Never force east frames for every direction in gameplay render.

## Existing Ultimates

### Ranni

- Skill id: `ranni-ice-blink`
- Input: `Space`
- Behavior:
  - freezes in place
  - keeps movement input active into a projected destination
  - resolves after `1.5s` or on early recast
  - invulnerable while frozen

### Killer Bee

- Skill id: `killer-bee-wing-dash`
- Input: `Space`
- Behavior:
  - cardinal dash
  - up to 3 tiles forward
  - blocked by solid tiles and bombs
  - 10 second cooldown
  - named PixelLab target strip: `super fast bee dash with particle effects`

## Review Checklist

- Does the skill have a unique `CharacterSkillId`?
- Is the behavior routed by `skill.id`, not by scattered character checks?
- Does it simulate the same way locally and online?
- Does the visual use the right strip for the current direction?
- Is there a deterministic test for the core mechanic?
