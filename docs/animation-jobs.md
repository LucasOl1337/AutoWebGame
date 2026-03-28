# Animation Jobs

This file tracks PixelLab jobs queued on 2026-03-28.

## Character Death (template: falling-back-death)

### Ranni
- character_id: `03a976fb-7313-4064-a477-5bb9b0760034`
- status: completed and imported (`death-south/east/north/west-*` files ready)
- check command:
  - `get_character(character_id="03a976fb-7313-4064-a477-5bb9b0760034")`

### Killer Bee
- character_id: `6ee8baa5-3277-413b-ae0e-2659b9cc52e9`
- status: completed and imported (`death-south/east/north/west-*` files ready)
- queued command used:
  - `animate_character(character_id="6ee8baa5-3277-413b-ae0e-2659b9cc52e9", template_animation_id="falling-back-death", animation_name="death-falling-back-4dir", directions=["south","east","north","west"])`
- import command used:
  - `$env:PIXELLAB_CHARACTER_IDS='6ee8baa5-3277-413b-ae0e-2659b9cc52e9'; node scripts/import_pixellab_characters.mjs`

## Crate Break Frames (map objects)

Target local files:
- `public/assets/tiles/crate-break-0.png`
- `public/assets/tiles/crate-break-1.png`
- `public/assets/tiles/crate-break-2.png`
- `public/assets/tiles/crate-break-3.png`

Generated object ids:
- `34954d46-c1fc-473e-bac9-22d6cfb01792` (intact)
- `05145641-8995-41d5-8b12-a55d6e7cdcdd` (light cracks)
- `aa0ea67c-22a1-4748-85b4-7d150d8f8c03` (heavy break)
- `0f1fd4f2-d99f-4eec-8eb4-60bf2c8f9e37` (debris)

Status:
- `crate-break-0.png` downloaded
- `crate-break-1.png` downloaded
- `crate-break-2.png` downloaded
- `crate-break-3.png` downloaded

Check command examples:
- `get_map_object(object_id="34954d46-c1fc-473e-bac9-22d6cfb01792")`
- `get_map_object(object_id="05145641-8995-41d5-8b12-a55d6e7cdcdd")`
- `get_map_object(object_id="aa0ea67c-22a1-4748-85b4-7d150d8f8c03")`
- `get_map_object(object_id="0f1fd4f2-d99f-4eec-8eb4-60bf2c8f9e37")`
