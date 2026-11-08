# DEADLANE — Art Bible

A style guide for the art, not a rejection gate. It describes the look the game is going
for, the technical constraints the atlas actually needs, and the preferences a reviewer
should raise. Only [section 2.1](#21-hard--atlas-compatibility) and the hard list in
[section 5](#5-sprite-sheets) can reject a sheet; everything else is guidance, and
disagreeing with it is a warning, not a failure.

## 1. Read of the world

**1980s arcade highway thriller, seen from directly above.** Not a cute retro game, not a
neo-retro pseudo-3D thing. Think: a cabinet game that was restored and re-issued with
taste. Chunky pixels, hard flat colour, aggressive contrast, visible road markings that
read at speed.

Tone words, in priority order:

`COLD · FAST · INDUSTRIAL · COVERT · LOUD`

Anti-tone words — art that reads this way will usually be asked to change:

`cute · pastel · painterly · glossy plastic · isometric · photographic · 3D render · soft
gradient · thin outline · anti-aliased`

## 2. Technical requirements and preferences

### 2.1 Hard — atlas compatibility

These are the only hard rules. A sheet that breaks one cannot ship, because the atlas
builder, the sprite lookup or the keying step would break with it.

| Requirement | What it means | Why it is hard |
| --- | --- | --- |
| **Fixed cell grid** | The declared columns × rows, equal cell size, one subject centred per cell, nothing crossing a cell boundary (the last two are reviewed, not machine-checked). | `pipeline/steps/` slices by equal cells. A subject on a boundary becomes two half-sprites. |
| **Background keying** | A flat, saturated key colour (currently `#FF00FF` magenta) behind every subject, connected to the image border. | Background removal is a flood key. A backdrop the key cannot reach ships as an opaque plate. |
| **Frame bounds** | Every shipped frame is non-empty and lies wholly inside its sheet. | An empty or out-of-sheet frame is a missing sprite and a wrong read. |
| **No text in UI icons** | No letters, numbers or labels baked into the icon and chrome sheets. | The game renders its own text at runtime; baked text cannot be localised and reads as noise at 32 px. |
| **No magenta bleed** | No opaque pixel of the key colour inside a shipped sprite. | A key-coloured pixel inside an outline means keying did not finish and the sprite will carry a hole or a plate. |

`art:validate` machine-checks six things and fails the gate on any of them: the sheet is
exactly the declared columns × cell size by rows × cell size, every frame lies inside the
sheet, no frame is fully transparent, no magenta key pixel survives inside a sprite, every
declared surface tile wraps without a seam, and a tile-target sheet actually declares at
least one surface frame (with none declared the seam test has nothing to run on, so the
sheet is rejected rather than passed). It does **not** look for a subject straddling a cell
boundary and it cannot read text; "no boundary bleed" and "no text in UI icons" are
reviewed requirements — the reviewer looks for them on the processed cells and on `art-19`
/ `art-20`.

### 2.2 Preferences — style warnings

The following are the house style. `art:validate` reports deviations as **warnings**, and a
reviewer may ask for a retry, but a sheet is not rejected on any of them alone. Quantisation
and outlining remain the default post-processing pass in `pipeline/steps/`, which is how the
preferences usually get honoured without a retry.

| Preference | Usual value | Warn when |
| --- | --- | --- |
| **Palette** | The 16 indexed colours in section 3. | More than ~1% of opaque pixels land off-palette after quantisation. |
| **Outline** | Exactly 1 px, darker than the fill, on every subject. | No outline, or more than one outline weight on a sheet. |
| **Pixel density** | 1 px = 1 px at the final sprite size. | Detail that only survives downscaling by smearing. |
| **Rotation** | 90° increments only. | A sprite would need an arbitrary angle to face its direction of travel. |
| **Alpha** | Binary alpha; no semi-transparent edge pixels. | Soft or feathered edges survive processing. |
| **Shadow** | A 1-colour offset to the lower right, or none at all. | A soft, blurred or baked-in background shadow. |

Everything ships at **1×**. Display scaling is the game's job, never the artist's.

## 3. Palette

Sixteen colours, indexed. `pipeline/registry/palette.json` is generated from this table and
is what the default style pass quantises to. Using it is a **preference**: a sheet that
drifts off the table still ships, with a warning, and the quantiser will pull it back to the
nearest colour anyway.

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
Hot pink is the player accent. Enemy art that uses it is a warning rather than a failure:
it blurs the read of who is who, so it usually earns a retry.

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

**Division water.** Boats read best bow-up and square to the frame, exactly like the land
vehicles. A painted wake or water ring is scenery, not part of the hull, and tends to read
as an opaque plate once keyed — keep it out of the cell.

**Civilians.** Rounded, weaker silhouettes: sedans, wagons, vans, pickups, buses. Muted
factory colours, always lower contrast than any combatant. Civilians should not look
threatening — their job is to be avoided, not feared.

## 5. Sprite sheets

Every generation is a **packed grid of equal cells, one sprite per cell**. The grid is
fixed per slot, not globally:

| Sheet family | Grid | Cell size |
| --- | --- | --- |
| Player vehicle (`art-02`), bosses (`art-07`), enemy vehicles (`art-03` – `art-06`), transporter (`art-21`) | **2 × 2, 4 cells** | **128 × 128** |
| Civilian, prop, scenery and effect sheets (`art-08` – `art-12`, `art-22` – `art-25`) | 4 × 4, 16 cells | 64 × 64 |
| Tile and UI sheets (`art-13` – `art-20`) | 4 × 4, 16 cells | 32 × 32 |
| Single-image slots (`art-01`) | 1 × 1 | full frame |

**Vehicle sheets are 2 × 2 at 128 px and read best with axis-aligned subjects.** A vehicle
cell is a hero sprite, not a catalogue of every state: at 64 px a car that keeps its
road surface trims down to roughly a third of its cell, and rotated states cannot be
gridded at all.

What the atlas needs from a sheet — **hard**. `art:validate` machine-checks the items marked
*(checked)* and fails the gate on them; the rest is reviewed, and a reviewer rejecting one
blocks the sheet just as firmly:

- *(checked)* Exactly the declared number of columns and rows at the declared cell size.
- No grid lines drawn on the sheet.
- *(checked)* Every frame wholly inside the sheet and non-empty: an empty frame would be a
  missing sprite.
- Every sprite wholly inside its own cell — no opaque pixel on a cell boundary *(reviewed;
  `art:validate` does not detect this)*.
- Empty cells are acceptable; the slicer discards them and they cost nothing.
- Flat solid `#FF00FF` background behind every subject. Removing it is the keying step's
  job, not `art:validate`'s: `chromaKey` in `pipeline/lib/image.ts`, run from
  `pipeline/steps/process-slot.ts`, turns the plate transparent before slicing. Magenta is
  never in the palette, so keying is a pure chroma-key with zero risk of eating a sprite
  pixel. The key is a **hue-and-saturation** predicate, not a distance from one hex: a pixel
  is backdrop when its brightest channel is ≥ 90, its saturation is ≥ 0.55, and its hue sits
  in 287.5°–357.5° (the key's 300° drifted 22.5° warm, widened by `tolerance / 12`), and it
  is **4-connected to the image border**. Measured plates on this endpoint land at `#df0b63`
  (335.1° at 0.95 saturation) and `#c60756`, which are 194–236 away from `#ff00ff` in
  Manhattan distance — a radius test cannot separate them from palette `15 hot-pink`
  (`#ff2e63`, 345°, 0.82), which survives only because it never touches the border. Pale
  lane paint the model draws has saturation 0.18–0.30 and is therefore kept, by design.
  `art:validate` checks only the narrower symptom: an opaque pixel whose hex is exactly the
  palette key (`#ff00ff`) inside a frame *(checked)*. A plate left at a drifted colour such
  as `#df0b63` is not caught by that test — it surfaces as palette warnings only.
- *(checked)* Declared surface tiles wrap without a seam.
- *(checked)* A tile-target sheet declares at least one surface frame — with none declared
  the seam test has nothing to run on, so the sheet is rejected (`art:validate` reports
  *"tile sheet declares no surface frames"*).

What the prompt asks for — **preferred**, and a warning when it is missing:

- Every sprite centred in its cell, un-rotated, un-angled, top-down.
- Vehicle sheets carry axis-aligned subjects: every vehicle nose up and square to
  the frame, never side-on, never three-quarter, with no scenery painted behind it.
- No text, no labels, no numbers, no borders, no drop shadows outside the sprite.
- Consistent scale across the sheet: one vehicle occupies the same footprint in every cell.

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

### Owed enemy cells (WO-23)

The four enemy vehicle slots were cut from 4 × 4 @ 64 px to **2 × 2 @ 128 px** so that each
cell is a hero sprite with an axis-aligned, nose-up subject. Each slot keeps its four most
distinct silhouettes; the other twelve cells are **owed**, not dropped. They are work for
later 2 × 2 slots, exactly like the player states above:

| Slot | Kept (2 × 2 @ 128 px) | Owed cells |
| --- | --- | --- |
| `art-03-enemy-ground-a` | enforcer motorcycle, switchblade interceptor, road lord heavy, division sports coupe | enforcer motorcycle alt, switchblade interceptor alt, road lord heavy alt, division sports coupe alt, division armoured pickup, division pursuit van, division scout buggy, division scout buggy alt, division muscle car, division muscle car alt, division limousine, division limousine alt |
| `art-04-enemy-ground-b` | hauler armoured truck, turret rig, ram bulldozer, missile trailer | hauler armoured truck alt, turret rig firing, wrecking rig, mobile roadblock, mobile roadblock alt, fuel tanker hostile, drill vehicle, drill vehicle alt, prisoner transport, comms van, repair crawler, heavy flatbed |
| `art-05-enemy-air` | attack helicopter, gunship large, hunter drone, jet fighter | attack helicopter firing, gunship large firing, hunter drone alt, quad drone, surveillance drone, light aircraft, cargo plane, jet fighter alt, helicopter with missile pods, helicopter with searchlight, heavy transport helicopter, autogyro |
| `art-06-enemy-sea` | gunboat, speedboat hostile, hovercraft, torpedo boat | gunboat firing, speedboat hostile alt, jet boat, jet boat alt, patrol craft, patrol craft alt, hovercraft alt, torpedo boat alt, hydrofoil, hydrofoil alt, river barge hostile, swamp skiff |

The `alt` poses are the bulk of the owed cells: at 64 px they were cheap catalogue filler,
but at 128 px a second pose of the same hull costs a whole hero cell, so it waits for a
slot of its own. No image was generated by WO-23; this is a spec change only.

### Measured yield: enemy sheets 03–06 (WO-24, one attempt per slot)

Measured on the four attempts already pulled under the 2 × 2 @ 128 px contract. `art:process`
reports `usableCells 4/4` for all four slots, but that counter only counts non-empty cells,
so the per-cell read below is the gate.

| Slot | Attempt | `usableCells` (non-empty tool counter) | Transparency, cells 0–3 | Opaque border px, cells 0–3 | Shipped footprint, cells 0–3 |
| --- | --- | --- | --- | --- | --- |
| `art-03-enemy-ground-a` | 2 | **4/4** | 74.5 / 61.5 / 74.3 / 55.4 % | 0 / 0 / 0 / 0 | 69×120, 65×120, 53×92, 70×120 |
| `art-04-enemy-ground-b` | 1 | **4/4** | 52.3 / 53.9 / 71.3 / 64.8 % | 0 / 0 / 0 / 0 | 72×120, 98×120, 60×89, 61×120 |
| `art-05-enemy-air` | 1 | **4/4** | 66.6 / 70.9 / 83.8 / 75.4 % | 0 / 0 / 0 / 0 | 110×120, 109×120, 79×92, 85×120 |
| `art-06-enemy-sea` | 1 | **4/4** | 72.6 / 70.3 / 74.4 / 75.6 % | 0 / 0 / 0 / 0 | 44×120, 101×120, 61×95, 59×120 |

Background removal is complete in all 16 cells: no magenta field, plate or drop shadow
survives, every remaining pixel is one of the 16 palette colours, and `art:validate` reports
0 off-palette pixels in 456,917 opaque pixels across the 6 shipped sheets. No cell carries
baked-in text or a label (`art-03` attempt 1 was rejected for exactly that reason and is not
selected). Every shipped cell has 0 opaque pixels on all four border rings. The raw sheets
are **not** clean to their own edge, though: the bottom-left quadrant of all four carries
1–3 border-adjacent stray pixels (`x = 0`, `y = 1022–1023`), measured in the trim-collapse
paragraph below. They fall outside the trim box only after the damage is done — they are
what stretches it.

Off-contract cells, read by eye on the processed 128 px cells:

- **`art-03` — nose orientation.** Cells 1–3 (switchblade interceptor, road lord heavy,
  division sports coupe) present their nose at the **bottom** of the cell: the split prow,
  the bumper and the red lamps all sit on the lower edge and the engine deck is at the top.
  Cell 0 (enforcer motorcycle) is end-ambiguous. Nothing else is wrong with the sheet, and a
  uniform 180° flip would align all four, but the nose-up clause is not met as delivered.
- **`art-04` — nose orientation, mixed.** Cell 3 (missile trailer) is nose-up and correct;
  cell 1 (turret rig) points its barrel up; cells 0 (hauler) and 2 (ram bulldozer) are
  nose-down, with cab, grille and blade at the bottom.
- **`art-05` — two cells fail outright.** Cell 0 (attack helicopter) has a solid **hot-pink
  rotor fan** wedged above the cabin — it is palette colour 15, the player accent, and it
  survives the chroma key because the fan is enclosed by outline pixels — plus a rotor blade
  drawn as a full-width hairline instead of a four-pixel cross. Cell 3 (jet fighter) carries
  an **amber afterburner plume** and a single hot-pink pixel at the plume tip; the contract
  forbids exhaust plumes. Cells 1 and 2 are clean and nose-up.
- **`art-06` — one cell fails.** Cell 1 (speedboat hostile) is drawn in **three-quarter
  view**, not square-on overhead, and is ringed with dark spray speckle from
  model-drawn water. Cells 0, 2 and 3 (gunboat, hovercraft, torpedo boat) are clean,
  bow-up and have strongly distinct hull silhouettes.

On-contract cell count, counting a cell only when it is whole, on-palette, square-on and
nose-up: `art-03` 0–1 of 4, `art-04` 2 of 4, `art-05` 2 of 4, `art-06` 3 of 4. Only
`art-06` reaches the ≥ 3 of 4 gate; `art-05` is explicitly recorded as below it. All four
sheets are shipped anyway, because the alternative is placeholder art for sixteen sprites.

One pipeline artefact, not model art: in **cell 2 of all four slots** a stray opaque pixel
or two survive on the sheet's own left column (`x = 0`) and bottom rows (`y = 1022–1023`).
`alphaBounds` has no residue guard, so that pixel stretches the trim box to the full 512 px
quadrant and the sprite ships at 89–95 px instead of 120 px, pushed into the top-right
corner of its cell. It costs roughly a quarter of the drawable size in the road lord heavy,
the ram bulldozer, the hunter drone and the hovercraft. The fix belongs in
`pipeline/lib/image.ts` or `pipeline/steps/process-slot.ts`, neither of which WO-24 may
touch; the cells are shipped as measured and this paragraph is the record.

Metrics as reported by `art:process`: `art-03` palette 40.4, size variance 0.12, symmetry
75 %, score 87.0; `art-04` 40.3 / 0.11 / 73 % / 86.8; `art-05` 50.0 / 0.09 / 73 % / 85.3;
`art-06` 43.4 / 0.09 / 59 % / 84.3. The scorer ranks all four well and cannot see a
180° rotation, which is exactly why the numbers are not the gate.

### Measured yield: enemy sheets 03–06 (WO-27, fixed pipeline)

Re-packed the same four paid attempts under the WO-25 trim/rotation and WO-26 chroma/plume
fixes. **No image was generated, claimed or pulled.** This read supersedes the WO-24
numbers above, which were taken before those fixes.

`art:process` prints `usable cells 4/4` for all four slots. That counter only rejects empty
cells: it is **not** the gate and it is not the yield. It reads 4/4 even for the two slots
that ship three frames, because the cells the gate rejects are dropped by hand after
`art:process` has already written `metrics.json`, and that file is not rewritten afterwards.
Every `4/4` below is the tool counter and nothing more; the gate column is the yield.

| Slot | Attempt | Non-empty cells — tool counter (`usableCells` in `metrics.json`) | Cells passing gate (yield) |
| --- | --- | --- | --- |
| `art-03-enemy-ground-a` | 2 | 4/4 | **3/4** |
| `art-04-enemy-ground-b` | 1 | 4/4 | **4/4** |
| `art-05-enemy-air` | 1 | 4/4 | **4/4** |
| `art-06-enemy-sea` | 1 | 4/4 | **3/4** |

Per-cell readings, taken from the processed 128 px cell files written by the final
`art:process` run, before the two drops described at the end of this section:

| Slot | Cell | Transparency | Opaque border px | Shipped footprint | Gate |
| --- | --- | --- | --- | --- | --- |
| `art-03` | 0 | 74.5 % | 0 | not packed | **fail — nose-down; deleted** |
| `art-03` | 1 | 61.4 % | 0 | 65 × 120 | pass |
| `art-03` | 2 | 55.3 % | 0 | 71 × 120 | pass |
| `art-03` | 3 | 55.4 % | 0 | 69 × 120 | pass |
| `art-04` | 0 | 52.3 % | 0 | 72 × 120 | pass |
| `art-04` | 1 | 53.9 % | 0 | 98 × 120 | pass |
| `art-04` | 2 | 47.3 % | 0 | 82 × 120 | pass |
| `art-04` | 3 | 64.9 % | 0 | 61 × 120 | pass |
| `art-05` | 0 | 72.3 % | 0 | 110 × 120 | pass |
| `art-05` | 1 | 70.9 % | 0 | 109 × 120 | pass |
| `art-05` | 2 | 71.9 % | 0 | 106 × 120 | pass |
| `art-05` | 3 | 68.7 % | 0 | 97 × 120 | pass |
| `art-06` | 0 | 72.6 % | 0 | 44 × 120 | pass |
| `art-06` | 1 | 70.3 % | 0 | not packed | **fail — three-quarter + spray; deleted** |
| `art-06` | 2 | 59.2 % | 0 | 78 × 120 | pass |
| `art-06` | 3 | 75.6 % | 0 | 59 × 120 | pass |

Off-contract cells, read by eye on the processed 128 px cells:

- **`art-03` cell 0 (enforcer motorcycle) is nose-down.** The handlebars, front fork and
  front lamp sit at the bottom of the cell, with the rear wheel and tail at the top. WO-24
  already called this cell end-ambiguous; WO-25's uniform 180° flip of all four `art-03`
  cells left it inverted. It is deleted from `pipeline/work/` and is absent from the packed
  sheet, so `enemy-ground-a/enforcer-motorcycle` no longer exists and the game falls back to
  placeholder art for that id. Cells 1–3 (switchblade interceptor, road lord heavy,
  division sports coupe) are nose-up with the red nose lamps at the top.
- **`art-04` — all four pass.** Cells 0 and 2 are nose-up after the declared 180° flip;
  cell 1 (turret rig) and cell 3 (missile trailer) are upright as declared. Every cell is
  one whole tracked/wheeled machine, square to the frame.
- **`art-05` — all four pass.** All four aircraft are nose-up and square-on. The
  hot-pink rotor fan on cell 0 is gone (the rotor now reads as a clean cross), and the
  afterburner plume on cell 3 is gone. No plume pixel survives in any cell.
- **`art-06` cell 1 (speedboat hostile) still fails.** It is drawn in three-quarter view,
  not square-on overhead, and is ringed with model-drawn white spray. It is the cell
  WO-24 identified and it was not re-generated. It is deleted from `pipeline/work/` and is
  absent from the packed sheet, so `enemy-sea/speedboat-hostile` no longer exists and the
  game falls back to placeholder art for that id. Cells 0, 2 and 3 (gunboat, hovercraft,
  torpedo boat) are bow-up, spray-free and have distinct hulls.

Pipeline fixes confirmed on all sixteen processed cells: every footprint is 120 px on its
long axis, so the WO-24 trim collapse (89–95 px sprites pushed into a corner) is gone; there
are **0 `15 hot-pink` pixels**; there are **0 off-palette pixels** (`art:validate` checks
459,540 opaque pixels across the 6 shipped sheets, 19 frames); and every cell has **0 opaque
border-ring pixels** on all four sides.

Metrics as reported by `art:process`: `art-03` palette 40.7, size variance 0.01, symmetry
98 %, score 92.0; `art-04` 40.3 / 0.03 / 94 % / 91.1; `art-05` 47.9 / 0.04 / 88 % / 88.8;
`art-06` 43.5 / 0.03 / 79 % / 88.2.

**Gate outcome (WO-27): 14 of 16 cells pass.** `art-03` is **3/4**, `art-04` **4/4**,
`art-05` **4/4**, `art-06` **3/4**.

**The two drops are a manual step. No script performs or enforces them.** After the final
`art:process` run and before `art:atlas`, the two failing cell files were removed by hand:

```
rm pipeline/work/art-03-enemy-ground-a/attempt-2/cell-0.png
rm pipeline/work/art-06-enemy-sea/attempt-1/cell-1.png
```

`pipeline/steps/process-slot.ts` rewrites `cell-<index>.png` for every non-empty cell, so
re-running `npm run art:process -- --slot art-03-enemy-ground-a` (or `art-06-enemy-sea`)
**restores both dropped cells**, and an `art:atlas` run after that packs them again. The
drop survives only in the ordering process → `rm` → `atlas`; anyone re-running the work
order's verification must repeat the two `rm` commands before `art:atlas`.

Because the drop was performed in that order, `public/assets/sheets/art-03-enemy-ground-a.png`
and `art-06-enemy-sea.png` each pack **3 frames**, and `enemy-ground-a/enforcer-motorcycle`
and `enemy-sea/speedboat-hostile` are absent from `assets.json`. The game draws placeholder
art for those two ids. Fourteen enemy sprites are shipped from these four slots. No claim
beyond these numbers is made here.

### Measured yield: civilian sheet 08 (WO-40, one attempt, gate applied as a drop)

One attempt of `art-08-civilians` (4 × 4 @ 64 px, seed `1473907335`) was paid for and
pulled; the order forbids a retry, so the gate is applied as a drop rather than a re-roll.
`art:process` reports `usableCells 16/16`, which as stated above is only the non-empty
counter and is **not** the yield.

| Cell | Declared subject | Gate |
| --- | --- | --- |
| 0 | sedan | pass — top-down, nose up |
| 1 | sedan alt | **fail — three vehicles fused into a cross** |
| 2 | estate wagon | **fail — three vehicles fused into a cross** |
| 3 | hatchback | **fail — drawn side-on** |
| 4 | pickup truck | pass — top-down, nose up |
| 5 | delivery van | **fail — three vehicles fused into a cross** |
| 6 | box truck | **fail — drawn side-on** |
| 7 | taxi | pass — top-down, nose up |
| 8 | city bus | pass — top-down, nose up |
| 9 | skiff | **fail — a side-on red sedan, not a watercraft** |
| 10 | civilian sports car | **fail — a side-view motorboat ringed with water** |
| 11 | small lorry | pass — top-down, nose up |
| 12 | limousine | pass — top-down, nose up |
| 13 | barge | **fail — side-on, ringed with water and ripple** |
| 14 | flatbed lorry | **fail — side-on, ringed with water and ripple** |
| 15 | pleasure boat | **fail — side-on, ringed with water and ripple** |

**Gate outcome: 6 of 16 cells pass, and zero watercraft.** The water civilian ids are the
entire civilian pool of the `river` level, so `skiff`, `barge` and `boat` stay on the
procedural placeholder — the gap this sheet was generated to close is still open and needs
a **new** 4 × 4 attempt, not a re-roll of this one.

The ten failures are declared as `droppedCellsByAttempt: { 1: [...] }` in
`pipeline/registry/slots.ts`, which `build-atlas` enforces together with the permanent
`droppedCells` of other slots: the cells are excluded even though their processed PNGs are
still in `pipeline/work/`, so no `rm` step and no ordering constraint is involved. The drop
is **attempt-scoped on purpose** — a retry draws sixteen new cells and must be judged on
those, so attempt 1's rejects cannot ban the subjects a new attempt exists to supply. The
packed sheet carries 6 frames — `civilians/sedan`, `civilians/pickup-truck`,
`civilians/taxi`, `civilians/city-bus`, `civilians/small-lorry`, `civilians/limousine` — and
`src/content/civilians.json` declares `art` for exactly those six civilians. The other eight
(`wagon`, `hatchback`, `coupe`, `van`, `box-truck`, `skiff`, `barge`, `boat`) declare no
`art` and draw their placeholder. No claim beyond these numbers is made here.

**The slot is open, not approved.** After the review the attempt was kept in the ledger and
`npm run art:reopen -- --slot art-08-civilians` cleared only `status`/`selected`; the seed,
request id, url and cost of attempt 1 remain for audit, and at the time of writing the
ledger recorded 13 images and no ceiling (both caps were retired in WO-51 — see
`pipeline/BUDGET.md`). A
new 4 × 4 attempt can therefore be claimed and judged on its own cells. `art:atlas` only
packs approved slots, so the six frames above live in the committed manifest until a new
attempt is selected and packed — re-running `art:atlas` while the slot is open would drop
them from the manifest, and the content tests fail loudly if that happens.

**This is a blocker for the `river` civilian pool.** `src/levels/types.ts` sets the river
level's `vehiclePool` to `['skiff', 'barge', 'boat']`, and attempt 1 produced zero
watercraft — all three cells that were meant to hold one were side-on and ringed with
model-drawn water. Until a new attempt supplies them, the entire river civilian pool draws
procedural placeholder art.

### Measured yield: scenery sheets 22–24 (WO-54, one attempt per slot)

One attempt per scenery slot was paid for and pulled under the 4 × 4 @ 64 px prop contract.
`art:process` reports `usableCells 16/16` for all three, which as stated above is only the
non-empty counter and **not** the yield. None of these sheets declares surface tiles, so
`meanSeamError 255` is the documented no-tile sentinel, not a gate; `meanPaletteDistance`
and `sizeVariance` are score inputs.

| Slot | Attempt | `usableCells` (non-empty tool counter) | `meanPaletteDistance` | `sizeVariance` | `meanSymmetry` | `meanDistinctColors` | `score` | Cells used |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `art-22-scenery-roadside` | 1 | 16/16 | 48.8 | 0.106 | 78.5% | 12.1 | 89.57 | 11 of 16 |
| `art-23-scenery-water` | 1 | 16/16 | 53.6 | 0.150 | 83.8% | 12.3 | 88.06 | 14 of 16 |
| `art-24-scenery-urban` | 1 | 16/16 | 43.4 | 0.123 | 88.1% | 10.9 | 88.83 | 16 of 16 |

Cells left unused, and why:

- **art-22 cells 4–7** each carry a second, half-drawn object below its subject, so slicing
  them ships a fence fragment. **Cell 11** is a whole van labelled `wrecked sedan`; the
  genuine wrecks are cells 12–13.
- **art-23 cells 11 and 13.** The sheet drifts one cell from its labels from cell 8 onward:
  8 is the rock in water, 9 the brick jetty corner, 10 the truss bridge pier, 11 a dock
  ladder and 12 the tyre fender, while 13 is a second truss pier. No scenery id wants a
  ladder, and the second pier adds nothing over the cleaner cell 10. `src/art/ids.ts` maps
  every water prop at the cell that actually holds it, so the labels and the table disagree
  on purpose; cell 3 is a moored hull rather than a ladder and is spent as a third `boat`.
- **art-24** uses all sixteen cells.

No claim beyond these numbers is made here.

## 6. Motion

We prefer **not** to ask a diffusion model for animation. Animation is assembled in code:

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

This keeps the art in a small number of slots instead of hundreds of animation frames,
and keeps motion crisp, because no frame has resampled pixels.

## 7. Review rubric

The reviewer scores every attempt 0–5 on each axis and records the score in the verdict.
**Technical axes fail the attempt when they are unsafe to ship; style axes are warnings the
reviewer weighs.**

| Axis | Kind | What good looks like |
| --- | --- | --- |
| Grid integrity | technical | Declared grid, centred subjects, no bleed between cells. |
| Background and bounds | technical | Flat key colour, no key residue, every frame whole. |
| Silhouette | style | Readable at its final size, distinguishable from the other sprites on the sheet. |
| Palette | style | After quantisation, close to the 16-colour table. |
| Perspective | style | Top-down, top-left key light, no isometric drift. |
| Consistency | style | Same scale and outline weight as previously approved sheets. |

If two attempts both pass, prefer the one with the higher automated score from
`pipeline/steps/score.ts`, then the earlier attempt.

## 8. Things that are usually wrong

Preferences, not prohibitions — but each of these costs the reviewer a second look:

- Vehicles drawn at an angle on a road sheet; axis-aligned reads better and keeps motion cheap.
- More than one outline weight on a sheet.
- Gradients, glows or soft shadows; they do not survive quantisation.
- Text baked into a sprite; it cannot be localised and reads as noise at small sizes.
  (Baked text on the UI icon and chrome sheets is a hard failure — see 2.1.)
- Hot pink on an enemy; it is the player's accent.
- Sprites that straddle a cell boundary (hard — see 2.1).
