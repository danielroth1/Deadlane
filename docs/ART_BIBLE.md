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

### Gate: sheet yield on `art-02-player-vehicle` attempt 2 (WO-11, 2 × 2 @ 128 px per WO-21)

Measured on `art-02-player-vehicle` attempt 2 (seed `1475577038`, `fal-ai/flux-2/turbo`,
`square_hd`), processed at the 2 × 2 / 128 px contract. Attempt 1 was measured at the earlier
4 × 4 / 64 px contract, so its metrics are not comparable and are not quoted here.

- **Tool yield: `usableCells 4/4`.** `art:process` counts non-empty cells, so the
  per-cell read below is the gate.
- **Background removal is complete in every cell.** Transparency is 79.8%, 78.4%, 79.2%
  and 80.6% of the 128 × 128 cell (cells 0–3). Every remaining pixel is one of the 16
  palette colours; `art:validate` finds 0 off-palette pixels in 374,609 opaque pixels. No
  magenta field or plate residue survives.
- **All four cells are whole, axis-aligned and nose-up.** Each cell's content is a single
  car inside a 120 × 120 trim at x 4–123, y 4–123, and no cell has an opaque pixel on any
  border ring (top 0, bottom 0, left 0, right 0), so nothing straddles a cell boundary.
- **Only three states were drawn, not four.** Row-major the cells are: clean, wrecked,
  clean, hover. The contract asks for clean, damaged, wrecked, hover; the "damaged" cell is
  a second clean car. Cell 0 and cell 2 differ at 2,093 of 16,384 pixels (12.8%; mean
  |RGB| distance 16.2 over co-opaque pixels) — different pixels, same readable state. Cell
  0 vs cell 1 differ at 17.2%, cell 1 vs cell 2 at 21.5%.
- **`15 hot-pink` is present in all four cells but sparse:** 12, 2, 10 and 12 px
  (0.1–0.4% of opaque pixels). The side marker lights read pink; the rear light bar
  quantises darker and lands on `8 signal-red`.
- **`8 signal-red` is not absent:** 11, 29, 10 and 8 px in cells 0–3 (0.3–0.8%). In cells
  0 and 2 it is the rear light strip (y 95 and y 93); in cell 3 it includes a wing-tip pixel
  at (31, 51); in the wrecked cell (cell 1) the 29 px sit in the fire and debris inside the
  sprite. No cell is free of the hostile accent by pixel count.
- Metrics: `meanPaletteDistance 37.6`, `sizeVariance 0.00`, `meanSymmetry 78%`,
  `meanDistinctColors 11.75`, `score 89.25`.
- Shipped: `public/assets/assets.json` carries `player-vehicle/interceptor-clean` (the id
  `src/entities/player.ts` asks for first) and the sheet packs **4 frames** at 128 × 128:
  `interceptor-clean`, `interceptor-wrecked`, `interceptor-damaged`,
  `hover-interceptor`. Frames follow cell order, so `interceptor-wrecked` is the
  wrecked-looking cell (index 1) and `interceptor-damaged` is the second clean cell
  (index 2).

**Gate outcome (WO-11, amended target ≥3 of 4 usable cells): 4 of 4 cells are whole,
axis-aligned, nose-up and free of boundary straddles; 3 of 4 are distinct states. The
palette clause is not met — `8 signal-red` appears in every cell (8–29 px), so 0 of 4 cells
is entirely free of it.** No claim beyond these numbers is made here.

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
