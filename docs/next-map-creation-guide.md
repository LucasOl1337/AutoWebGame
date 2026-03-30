# Next Map Creation Guide

## Purpose
This file is a handoff for future arena-theme work.

The current default, `tournament-clean`, solved the biggest readability problem:
- the board is now easy to parse
- terrain categories are separated by color family
- visual noise is low enough that bombs, flames, players, and pickups stay readable

The next map should **keep that clean basis** while adding:
- more personality
- more life
- higher source resolution
- a stronger sense of place

Do not fall back into noisy texture soup.

## Current Baseline
- Default theme id: `tournament-clean`
- Theme registry: `src/app/arena-theme-library.ts`
- Runtime theme selection: `?arenaTheme=<id>`
- Arena render path: `src/app/game-app.ts`
- Theme catalog / planning notes: `configs/arena-theme-library.json`
- Existing research: `docs/arena-tileset-research.md`

## Non-Negotiables
These rules should survive every new map:

1. Floor family must stay visually quieter than gameplay objects.
2. Walls must read as one structural family.
3. Breakable crates must read as a separate warm/destructible family.
4. Accent colors are reserved for gameplay landmarks:
   - spawn
   - portal
   - danger
   - preview
   - pickups / VFX
5. Readability comes before texture richness.
6. The arena should feel calm to look at even during long sessions.

## Category Color Model
This is the core design system for future themes.

### 1. Floor Family
Use cool or neutral tones.
Examples:
- pale stone
- desaturated slate
- cold marble
- soft steel-blue tile

What floor should do:
- hold the board together
- show route logic
- support players and hazards

What floor should not do:
- steal attention
- carry saturated accents everywhere
- use heavy micro-noise in the center of tiles

### 2. Wall Family
Use one darker structural family.
Examples:
- navy steel
- blue-gray fortress stone
- graphite masonry

Wall should feel:
- heavy
- safe
- stable
- indestructible

### 3. Crate Family
Use one warmer destructible family.
Examples:
- oak / pine wood
- reinforced cargo box
- lacquered storage chest face

Crates should always read as:
- breakable
- lighter than walls in emotional weight
- warmer than the rest of the terrain

### 4. Accent Family
Accent is scarce and intentional.

Reserve it for:
- spawn ring
- portal ring
- route guidance if really needed
- hazard telegraph support

If accent starts appearing everywhere, the map will lose clarity.

## The Right Next Step
The next arena should not be "more detail everywhere".
It should be:

- clean first
- then richer shapes
- then controlled secondary details
- then very small life details only at edges or landmarks

Good upgrades:
- carved edges
- stronger material separation
- elegant trim
- subtle wear on borders
- landmark-specific ornament

Bad upgrades:
- noisy stone pores everywhere
- moss on every tile
- high-contrast cracks on the whole board
- too many competing hues
- bright trim on walls, floors, and crates at the same time

## Higher Resolution Strategy
Use higher source resolution, but keep the same gameplay readability.

Recommended direction:
- generate / paint source tiles at `96x96` or `128x128`
- render them down into the current gameplay tile footprint cleanly
- preserve broad shapes after downscale

Rules for higher-res source art:
- large forms must survive first
- edge detail second
- micro-detail last
- never depend on tiny texture noise for identity

If the 40x40 gameplay result looks muddy, the source art is too busy.

## Personality Without Noise
To add personality, focus on:

- material language
  - fortress
  - sanctum
  - royal courtyard
  - ice temple
  - foundry
- edge treatment
  - beveled stone
  - metal inlay
  - carved trim
  - polished slab seams
- landmark logic
  - spawn tiles
  - center cross
  - portal ends

Personality should come from:
- shape language
- material choice
- limited motif repetition

Not from:
- random ornament everywhere

## Suggested Theme Directions
These are safer next targets than "just make it prettier".

### 1. Royal Marble Arena
- Floor: pale cool marble
- Walls: deep blue-gray stone
- Crates: refined warm wood with metal brackets
- Accent: muted gold + soft cyan
- Mood: premium / ceremonial / clean

### 2. Glacier Sanctum
- Floor: icy pale stone, low saturation
- Walls: dark frozen slate
- Crates: warm expedition wood
- Accent: frosted blue only on landmarks
- Mood: calm / sharp / elegant

### 3. Obsidian Garden
- Floor: dark neutral volcanic stone
- Walls: charcoal with subtle teal-black depth
- Crates: warm wood to preserve breakability read
- Accent: restrained jade or cyan on spawn / portal only
- Mood: dramatic but controlled

## Workflow For Future Agents
Use this sequence:

1. Start from `tournament-clean`, not from the noisy sprite themes.
2. Define the new category families first:
   - floor
   - wall
   - crate
   - accent
3. Write the visual intention in plain language before generating anything.
4. Generate or paint only the minimum arena set:
   - floor base
   - lane
   - spawn
   - wall
   - crate
5. Test the map in-game before adding extra polish.
6. Only after the base reads well should you add higher-res detail.

## Prompting Template
Use prompts like this:

`clean low top-down arena tileset, premium readable 2D game board, category-separated colors, quiet cool floor family, dark structural wall family, warm destructible crate family, minimal noise, elegant material definition, crisp silhouettes, readable when downscaled`

Then append map-specific personality:

`royal marble`, `glacier sanctum`, `obsidian garden`, etc.

### Prompt Rules
- explicitly say `clean`
- explicitly say `minimal noise`
- explicitly say `readable when downscaled`
- explicitly say `quiet floor`
- explicitly say `warm destructible crate`

Avoid prompts that overemphasize:
- ornate
- gritty
- weathered everywhere
- moss everywhere
- hyper-detailed texture

## Integration Checklist
When adding a new theme:

1. Add the theme to `src/app/arena-theme-library.ts`
2. Add planning metadata to `configs/arena-theme-library.json`
3. Put tiles in `public/assets/tiles/themes/<theme-id>/`
4. Verify `renderMode`
   - `procedural` for code-driven clean themes
   - `sprite` for imported tilesets
5. Build the app
6. Capture a gameplay screenshot
7. Compare against `tournament-clean`

## QA Checklist
A theme is acceptable only if all of these are true:

- players are readable in under a second
- flames dominate the screen when active
- crates are immediately distinguishable from walls
- spawn tiles are visible without screaming
- the board still looks calm when full of bombs
- no tile center is doing too much work
- the arena feels better after 30 seconds, not just at first glance

## Rejection Signals
Reject the next theme if:

- you need to squint to separate wall from crate
- the floor is more interesting than the gameplay
- accent color appears on too many categories
- the screenshot looks "busy" before anything even happens
- downscaled tiles lose their identity

## Best Practical Path
If time is limited, the best next move is:

1. keep `tournament-clean` as the structural template
2. make a more premium version of it
3. increase source resolution
4. add material richness only at edges and landmarks

That path is safer than inventing a totally different visual language from scratch.
