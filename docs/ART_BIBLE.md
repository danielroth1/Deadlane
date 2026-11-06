# DEADLANE — Art Bible

The single source of truth for every image decision. Prompts, post-processing and review
rubrics all derive from this document. If a generated image disagrees with this file, the
image is wrong.

## 1. Read of the world

**1980s arcade highway thriller, seen from directly above.** Not a cute retro game, not a
neo-retro pseudo-3D thing. Think: a cabinet game that was restored and re-issued with
taste. Chunky pixels, hard flat colour, aggressive contrast, visible road markings that
read at speed.

Tone words, in priority order:

`COLD · FAST · INDUSTRIAL · COVERT · LOUD`

Anti-tone words — an image containing any of these is rejected:

`cute · pastel · painterly · glossy plastic · isometric · photographic · 3D render · soft
gradient · thin outline · anti-aliased`

## 2. Technical contract

| Property | Value | Why |
| --- | --- | --- |
| Internal canvas | 640 × 360 | 16:9, integer-scales to 1280/1920/2560 |
| Tile grid | 32 × 32 | Road, terrain, walls |
| Vehicle cell | 64 × 64 | 2×2 tiles, leaves room for a shadow |
| Icon cell | 16 × 16 or 32 × 32 | HUD |
| Pixel density | 1 px = 1 px | No sub-pixel. Ever. |
| Outlines | Exactly 1 px, darker-than-fill | Reads against any background |
| Transparency | Binary alpha only | No semi-transparent edge pixels |
| Rotation | Only 90° increments | Anything else creates off-grid pixels |
| Lighting | Top-left key, flat fill | Consistent across every asset |
| Shadows | Dropped 2 px down-right, 1 colour | Grounds vehicles without soft shading |

Everything ships at **1×**. Display scaling is the game's job, never the artist's.

## 3. Palette

Sixteen colours, indexed. Locked. `pipeline/registry/palette.json` is generated from this
table and every sprite is quantised to it.

| Index | Hex | Name | Role |
| --- | --- | --- | --- |
| 0 | `#0b0d10` | Void | Outlines, deepest shadow |
| 1 | `#161a21` | Asphalt | Road base |
| 2 | `#232a34` | Asphalt light | Road grain, seams |
| 3 | `#3d4753` | Steel | Guardrails, chrome shadow |
| 4 | `#7a8794` | Steel light | Chrome highlight |
| 5 | `#c8d2dc` | Bone | Markings, highlights |
| 6 | `#f2f6f9` | White | Spray, headlights, flash |
| 7 | `#7a2f2f` | Rust | Dry terrain, damage |
| 8 | `#b8452f` | Signal red | Enemy accents, warnings, damage |
| 9 | `#e0762a` | Amber | Explosions, fire, oil warning |
| 10 | `#e8c15a` | Sand | Canyon, desert shoulder |
| 11 | `#4e7a3f` | Olive | Vegetation, military |
| 12 | `#2f6f6a` | Teal | Water, glass, friendly UI |
| 13 | `#2b4c7e` | Deep blue | Water shadow, night sky |
| 14 | `#6a4fa3` | Violet | Enemy faction tint, boss |
| 15 | `#ff2e63` | Hot pink | Player accent, critical UI only |

**Usage ratios:** roughly 60% neutrals (0–6), 25% one accent family, 15% everything else.
Hot pink is reserved for the player and must never appear on an enemy.

## 4. Iconography of the factions

The game must be readable in a single glance at 60fps. Silhouette carries the meaning.

**Player — Interceptor.** Low, wide, matte black wedge. Two white headlight pixels at the
nose. Pink tail-light pixels at the stern. Reads as an arrow from above.

**Division ground forces.** Angular, aggressive, almost always wider at the front.
- *Enforcer*: motorcycle, single rider, narrow and fast.
- *Switchblade*: wedge-shaped interceptor, twin exhausts, red nose.
- *Road Lord*: heavy, blocky, six wheels, brass ram plate.
- *Hauler*: armoured truck, cargo box, high mass, slow.
- *Turret rig*: static platform with a rotating barrel.

**Division air.** Helicopters are the only asset that shows a **cast shadow offset by
16 px** to imply altitude. A helicopter is always drawn with its rotor as a 4-pixel cross,
never as a blurred disc.

**Division water.** Gunboats and speedboats are drawn at a slight 3/4 angle so they read
as floating rather than hovering — the only permitted angle deviation in the game.

**Civilians.** Rounded, weaker silhouettes: sedans, wagons, vans, pickups, buses. Muted
factory colours, always lower contrast than any combatant. Civilians must never look
threatening.

## 5. Sprite sheets

Every generation is a **4 × 4 grid of 16 cells**, one sprite per cell.

Required sheet properties — this is the prompt spec, not a suggestion:

- Exactly 4 columns, 4 rows, equal cell size, no grid lines.
- Every sprite centred in its cell, un-rotated, un-angled, top-down.
- Flat solid `#FF00FF` background — magenta is never in the palette, so background removal
  is a pure chroma-key with zero risk of eating a sprite pixel.
- No text, no labels, no numbers, no borders, no drop shadows outside the sprite.
- Consistent scale across the sheet: one vehicle occupies the same footprint in every cell.
- Empty cells are acceptable; the slicer discards them and they cost nothing.

Sheets are sliced, quantised, outlined and re-packed by `pipeline/steps/`. Model output is
never shipped.

## 6. Motion

We do **not** ask a diffusion model for animation. Animation is assembled in code:

| Motion | Technique |
| --- | --- |
| Steering | 2–3° sprite rotation with integer snapping |
| Bank/lean | 1 px horizontal shear at high lateral speed |
| Engine vibration | 1 px vertical jitter at a fixed 8 Hz |
| Damage | Palette swap toward `Signal red` + 1 px shake |
| Destruction | 3 generated states (intact → burning → wreck), then a code-drawn explosion |
| Wheels | 2 px overlay strip, scrolling |
| Water | UV scroll on the tile layer |
| Rotors | 2-frame code-drawn cross |
| Exhaust | Emitter reusing 2 pixels of the palette |

This keeps the image budget at 20 slots instead of 200, and keeps motion crisp, because
no frame has resampled pixels.

## 7. Review rubric

The reviewer scores every attempt 0–5 on each axis. **Any axis below 3 fails the attempt.**

1. **Grid integrity** — 4×4 cells, centred, no bleed between cells.
2. **Silhouette** — readable at 64×64, distinguishable from the other sprites on the sheet.
3. **Palette** — after quantisation, ≤ 1% of pixels deviate from the 16-colour table.
4. **Perspective** — top-down, top-left key light, no isometric drift.
5. **Consistency** — same scale and outline weight as previously approved sheets.
6. **Background** — flat magenta, no gradients, no stray marks.

If two attempts both pass, prefer the one with the higher automated score from
`pipeline/steps/score.ts`, then the earlier attempt.

## 8. Things that are always wrong

- Vehicles drawn at an angle on a road sheet (they must be axis-aligned).
- More than one outline weight on a sheet.
- Gradients, glows, or soft shadows.
- Any text baked into a sprite.
- Sprites that use hot pink (reserved for the player).
- Sprites that straddle a cell boundary.
