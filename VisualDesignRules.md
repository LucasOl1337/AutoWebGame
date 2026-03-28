# Visual Design Rules

## 1) Goal
Keep a strong, readable pixel-art identity for a Bomberman-like arena where gameplay clarity is always above decoration.

## 2) Core Principles
- Readability first: players, bombs, flames, crates, and powerups must be recognizable in less than 200ms.
- High contrast silhouettes: every gameplay object must keep a clean shape against all floor tiles.
- Consistent perspective: use low top-down for arena objects and pickups.
- Controlled detail: avoid noisy textures that hide hitboxes.
- Pixel integrity: no blur, no subpixel scaling, keep integer-friendly sprite sizes.

## 3) Resolution and Grid Rules
- Tile size: 40x40 in gameplay.
- Canvas: 480x480.
- Grid: 11x9.
- Gameplay sprites should target 64x64 source art then be rendered down cleanly when needed.
- Preserve transparent background for all pickup and VFX assets.

## 4) Color and Contrast
- Arena floor should stay neutral/cool to support hot VFX readability.
- Powerups should use distinct accent colors:
  - bomb-up: warm yellow/orange
  - flame-up: red/orange
  - speed-up: green
  - remote-up: cyan/blue
- Enemy/player sprites must not share identical dominant hue with pickup icons.

## 5) HUD Rules
- Show all active powerup categories in fixed order:
  1. bomb-up
  2. flame-up
  3. speed-up
  4. remote-up
- Stackable powerups show `xN` bonus amount (not base stat).
- Remote shows `ON` and input key label when active.
- HUD icon size should remain 8x8 in slot rendering unless full HUD rework is planned.

## 6) Asset Naming Rules
Use stable names so runtime code does not need frequent changes:
- `public/assets/ui/power-bomb.png`
- `public/assets/ui/power-flame.png`
- `public/assets/ui/power-speed.png`
- `public/assets/ui/power-remote.png`

Animation naming (recommended):
- Character death: `public/assets/characters/<id>/death-<direction>-<frame>.png`
- Crate break: `public/assets/tiles/crate-break-<frame>.png`

## 7) PixelLab Generation Rules
Default prompt structure:
- "pixel art game icon/object, low top-down, transparent background, crisp silhouette for HUD"

Default params:
- size: 64x64
- outline: single color outline
- shading: medium shading
- detail: high detail
- view: low top-down

Acceptance checks after generation:
- Transparent background is correct
- Shape is readable at small size
- No noisy anti-aliased edges
- Distinct from other pickup icons

## 8) Animation Rules (Next Sprint)
### Character death animation
- Duration: 350ms to 550ms
- Frames: 6 to 10
- Motion beats: hit -> collapse -> vanish/fade
- Must keep direction variants (south/east/north/west) when available
- Last frame should not block map readability

### Crate break animation
- Duration: 180ms to 260ms
- Frames: 4 to 6
- Motion beats: crack -> split -> debris settle
- Keep center mass aligned with tile center to avoid visual jump

### Optional useful animations
- Powerup spawn pop (very short, 100ms to 140ms)
- Bomb armed pulse (loop, subtle brightness pulse)
- Flame dissipate tail frame for cleaner explosion ending

## 9) Technical Integration Rules
- Introduce animation with fallback to current static sprite.
- Add feature flags for new animation rollout when possible.
- Keep deterministic gameplay state independent from animation playback.
- Do not change collision/hit timing based on animation frame count.

## 10) QA Checklist
Before merge:
- Build passes
- Powerup HUD still readable for all players
- Remote detonation key remains visible when active
- No frame stutter on low-end laptop test
- New assets pass basic visual snapshot check

## 11) Prioritized Backlog
1. Crate break animation (highest gameplay feedback value)
2. Character death animation (high polish value)
3. Powerup spawn pop (medium value)
4. Bomb armed pulse (medium value)
5. Flame dissipate tail (medium value)
