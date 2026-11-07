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

### Approved palette order

Recorded from the approved style anchor (`art-01-style-anchor`, attempt 4, seed
`313021788`):

`0 void · 1 asphalt · 2 asphalt-light · 3 steel · 4 steel-light · 5 bone · 6 white ·
7 rust · 8 signal-red · 9 amber · 10 sand · 11 olive · 12 teal · 13 deep-blue ·
14 violet · 15 hot-pink`

Quantisation does not walk this order. For each opaque pixel `quantize()` chooses the
palette entry with the smallest weighted RGB distance (`2R² + 4G² + 3B²`, a cheap
approximation of perceived difference); the index order above only breaks ties, because
the lowest index wins when two entries are equally close. See `quantize()` in
`pipeline/lib/image.ts`.

The approved attempt uses 15 of the 16 indices — it does not draw `14 violet` — and
contains no colour outside this table after quantisation. The per-index pixel counts behind
that statement are recorded in
`pipeline/work/art-01-style-anchor/attempt-4/palette-usage.json`.

Attempt 4 is a full-bleed scene with no keyed background, so the whole 640 × 640 cell is
image content: 361,187 pixels are opaque and 48,413 (11.8%) are transparent after
processing. It draws 10 `15 hot-pink` pixels. Later sheets are judged against this
palette, not against this anchor's exact index usage.

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

Every generation is a **packed grid of equal cells, one sprite per cell**. The grid is
fixed per slot, not globally:

| Sheet family | Grid | Cell size |
| --- | --- | --- |
| Player vehicle (`art-02`), bosses (`art-07`) | **2 × 2, 4 cells** | **128 × 128** |
| Enemy, civilian and prop sheets | 4 × 4, 16 cells | 64 × 64 |
| Tile and UI sheets | 4 × 4, 16 cells | 32 × 32 |
| Single-image slots (`art-01`) | 1 × 1 | full frame |

**Vehicle sheets are 2 × 2 at 128 px and carry axis-aligned subjects only.** A vehicle
cell is a hero sprite, not a catalogue of every state: at 64 px a car that keeps its
road surface trims down to roughly a third of its cell, and rotated states cannot be
gridded at all.

Required sheet properties — this is the prompt spec, not a suggestion:

- Exactly the declared number of columns and rows, equal cell size, no grid lines.
- Every sprite centred in its cell, un-rotated, un-angled, top-down.
- Vehicle sheets carry axis-aligned subjects only: every vehicle nose up and square to
  the frame, never side-on, never three-quarter, with no scenery painted behind it.
- Flat solid `#FF00FF` background — magenta is never in the palette, so background removal
  is a pure chroma-key with zero risk of eating a sprite pixel. The key is a
  **hue-and-saturation** predicate, not a distance from one hex: a pixel is backdrop when
  its brightest channel is ≥ 90, its saturation is ≥ 0.55, and its hue sits in
  287.5°–357.5° (the key's 300° drifted 22.5° warm, widened by `tolerance / 12`), and it
  is **4-connected to the image border**. Measured plates on this endpoint land at `#df0b63`
  (335.1° at 0.95 saturation) and `#c60756`, which are 194–236 away from `#ff00ff` in
  Manhattan distance — a radius test cannot separate them from palette `15 hot-pink`
  (`#ff2e63`, 345°, 0.82), which survives only because it never touches the border. Pale
  lane paint the model draws has saturation 0.18–0.30 and is therefore kept, by design.
- No text, no labels, no numbers, no borders, no drop shadows outside the sprite.
- Consistent scale across the sheet: one vehicle occupies the same footprint in every cell.
- Empty cells are acceptable; the slicer discards them and they cost nothing.

Sheets are sliced, quantised, outlined and re-packed by `pipeline/steps/`. Model output is
never shipped.

### Gate: is a 4 × 4 sheet viable at 64 px for `fal-ai/flux-2/turbo`? (WO-11, re-read by WO-21)

Measured on `art-02-player-vehicle` attempt 1 (seed `944511190`, `fal-ai/flux-2/turbo`),
re-processed with the hue/saturation key introduced by WO-19. No second image was spent.

- **The key now works on this endpoint.** The sheet is **79.9% transparent** after
  `chromaKey()` (211,277 of 1,048,576 pixels opaque), against 0% in round 1. Per cell the
  plate drops to **65.0–86.5% transparent**, and un-keyed plate residue is 0.00–1.11% of a
  cell. The old 0/16 result was a measurement bug, not a bad sheet.
- **`art:process` reports `usableCells 16/16` — still not the gate.** It counts non-empty
  cells. Checked cell by cell against the four conditions (background removed, subject
  whole, not straddling a boundary, pointing up) the real yield is **9/16**: cells 0, 1, 2,
  3, 4, 5, 7, 12 and 15.
- **The other seven are off-contract in orientation.** Cells 8–11 (speedboat clean,
  damaged, wrecked, and the hover craft) are drawn **horizontally facing right**; cells 13
  and 14 are banked on a diagonal; cell 6 reads as a white pod overlay rather than a car
  with an oil pod fitted.
- **No cell straddles a boundary.** Every cell-boundary column and row is fully transparent
  (checked at x = 255/256 and 511/512, y = 255/256), so no car was cut in two. Cell 11's
  flames reach within ~2 px of its left boundary and cell 15's plume is clipped by the
  sheet's bottom edge — clipped content, not a split car.
- **Lane paint survives, correctly.** The model painted white lane markings with magenta
  bloom (`#e5bbc3`, `#dc95aa`; saturation 0.18–0.30 — not backdrop). In cells 0, 2 and 12
  those hairlines run the full cell height and therefore set the trim box, shrinking the
  car to a **19 × 34 px** footprint inside the 64 px canvas (fill 0.17 against 0.18–0.34
  for the rest). The cars are whole, but roughly half the size of their neighbours.
- **Taillights do not meet the colour contract.** `15 hot-pink` survives on 10 of 16 cells
  but only 1–24 px each (cell 7, 24 px); cells 1, 3, 9, 11, 12 and 15 have none. `8
  signal-red` — the hostile accent — appears in 11 of 16 cells, 1–21 px each.
- Metrics: `score 83.19`, `meanPaletteDistance 51.8`, `sizeVariance 0.13`,
  `meanSymmetry 0.66`, `meanDistinctColors 12.6`.
- Shipped: `public/assets/assets.json` carries `player-vehicle/interceptor-clean` (the id
  `src/entities/player.ts` asks for first) and the sheet packs **16 frames** at 64 × 64;
  `art:validate` passes over 17 sprite ids and `npm run test:e2e` passes. That is the
  WO-11 state of the shipped sheet; the slot has since been re-scoped to 2 × 2 at 128 px
  and is regenerated by a later art order.

**Decision (WO-21): `art-02-player-vehicle` is 2 × 2 at 128 px.** The measured facts are:
**9 of 16 cells usable at 64 px**, the chroma key correct on this endpoint at **79.9%
transparent** (211,277 of 1,048,576 pixels opaque), and the seven failures are size and
orientation problems caused by the prompt, not grid-detection errors. No more than that
is claimed here.

### Owed player states

The player states that no longer fit in the 2 × 2 sheet are **owed**, not dropped:
speedboat clean, damaged and wrecked; oil pod fitted; smoke pod fitted; headlights on;
shield active; trailing exhaust; banking left; banking right; airborne. They must be
carried by **new 2 × 2 slots at 128 px** when the art batch order runs. Until those slots
exist, `src/art/placeholders.ts` draws a deterministic stand-in for their ids, so gameplay
never blocks on them.

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
