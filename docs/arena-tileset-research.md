# Arena Tileset Research

## Why This Exists
The current arena already plays like Bomberman, but it only exposes one visual language. This document captures the layout and readability rules gathered from Bomberman references and broader 2D readability material so arena themes can be iterated without drifting away from gameplay clarity.

## Source Takeaways
- [StrategyWiki - Super Bomberman Gameplay](https://strategywiki.org/wiki/Super_Bomberman/Gameplay)
  - Bomberman’s battle loop is about route comprehension on a single top-down screen, with soft blocks, chain reactions, and sudden-death closure turning the board into a fast spatial puzzle.
  - For this project, that means floor art must help players parse routes in under a second, not compete with bombs or flames.
- [Bomberman Wiki - Bomberman DS Battle Stage](https://bomberman.fandom.com/wiki/Bomberman_(DS)/Battle_Stage)
  - The franchise still frames a gimmick-free "Normal" stage as the baseline map. That is a useful test bed: if a theme fails there, it will fail harder on gimmick-heavy layouts later.
  - We should preserve a clean core arena before adding any environmental gimmicks.
- [Konami - Build-and-Bomb! Super Bomberman R 2](https://www.konami.com/games/bomberman/r2/us/en/pickup_build/)
  - Modern Bomberman explicitly treats custom stage creation and sharing as a flagship feature.
  - Building a local tileset library with reusable prompts is aligned with the current franchise direction instead of being a one-off art pass.
- [Game Developer - How Valve Makes Art To Enhance Gameplay](https://www.gamedeveloper.com/art/in-depth-how-valve-makes-art-to-enhance-gameplay)
  - The practical ordering is silhouette first, then color grouping, then fine detail.
  - For arena tiles, the consequence is simple: wall and crate contours matter more than texture richness.

## Layout Rules For This Project
- Keep the board readable as three layers: neutral floor, brighter route markers, then collision props.
- Spawn bays should be identifiable immediately, but not so bright that they look like powerups or danger telegraphs.
- Center cross and mirrored side lanes should read as intended rush routes.
- Solid walls should stay sparse, chunky, and easy to parse during sudden death.
- Breakable crates should always look warmer and more fragile than indestructible walls.

## Beauty Rules For 2D Arena Art
- Use floor detail near edges and grout lines, not in tile centers where bomb telegraphs and pickups need space.
- Favor cool or neutral floor palettes so flames, explosions, and damage overlays keep color authority.
- Preserve a strong value jump between floor, wall, crate, bomb, and powerup.
- Avoid decorative noise that erases the board rhythm created by lanes, spawns, and choke points.
- Keep landmark tiles purposeful: spawn seals, route lanes, and portal tiles can carry more ornament because they convey gameplay meaning.

## Immediate Translation
- `arcane-citadel` remains the default because it best supports hot VFX against a cool floor.
- `verdant-ruins` is kept as a preview theme to test a softer, mossier atmosphere without disturbing gameplay logic.
- New candidate prompts should keep the classic Bomberman board logic intact: normal floor, route floor, spawn floor, wall, and crate as the minimum tile set.

## Next Candidates
- `skyfoundry-bastion`: steel-blue fortress with brighter lane cues and heavy industrial walls.
- `glacier-sanctum`: icy but low-noise stone floor with warm gold spawn seals and dark crates.
- `obsidian-garden`: dark neutral volcanic stone with vegetation limited to borders so flames still dominate the palette.
