/**
 * The sprite ids the game asks for, and the cell that really holds each subject.
 *
 * A frame id in `public/assets/assets.json` is derived from its cell label in
 * `pipeline/registry/slots.ts`. The generator does not always draw the subject its label
 * promised — art-09 attempt 1 puts the toolbox case in `shield-cell` and shifts the ramp
 * into the `toolbox` cell — so these tables were built by looking at the processed cells,
 * not by trusting the labels.
 *
 * Where a neighbouring cell holds an equivalent subject, its id is kept as an alternate so
 * a sheet that renames cells degrades to the next sprite instead of a placeholder.
 * `Art.imageFrom` takes the first id the manifest resolves and uses the caller's
 * procedural texture when none does, so a slot with no approved art still plays.
 */

/** The pickup kinds the level generators place. */
export type PickupKind = 'oil' | 'smoke' | 'armour' | 'shield' | 'nitro';

/**
 * Pickup kind → candidate frame ids, most specific first.
 *
 * art-09 attempt 1, checked cell by cell (cells 7–11 are shifted from their labels):
 *   0 black oil slick · 1 canister venting smoke · 6 case with an emblem ·
 *   7 teal fuel canister · 8 grey hard case
 */
export const PICKUP_ART: Record<PickupKind, readonly string[]> = {
  // Cell 0 — the only black slick patch on the sheet.
  oil: ['weapons-pickups/oil-slick'],
  // Cell 1 — a canister venting white smoke.
  smoke: ['weapons-pickups/smoke-canister'],
  // Cell 8 — a grey hard case. The label on this cell says "nitro canister".
  armour: ['weapons-pickups/nitro-canister'],
  // Cell 6 — a case carrying a glowing emblem; label and content agree here.
  shield: ['weapons-pickups/shield-cell'],
  // Cell 7 — a teal jerry can. The label on this cell says "armour plate".
  nitro: ['weapons-pickups/armour-plate'],
};

/** The single-frame effects the scene draws from the art-10 and art-25 sheets. */
export type EffectKind =
  | 'explosion'
  | 'muzzle'
  | 'smoke'
  | 'oil'
  | 'dust'
  | 'splash'
  | 'fire'
  | 'sparks'
  | 'debris'
  | 'shockwave'
  | 'arc';

/**
 * Effect → candidate frame ids, most specific first.
 *
 * art-10 attempt 1 is shifted from its labels from row 2 onward, checked cell by cell on
 * the shipped PNG: cells 4–7 are four smoke clouds, cell 8 is the tyre with skid streaks,
 * cell 9 is the water splash, cell 10 is the orange rubble pile, cell 11 is a dark blob (its
 * label says `dust cloud`, which is why the landing dust moved to the art-25 clouds below),
 * cell 12 is a spark-trailed projectile, cell 13 is a real concentric shockwave ring and
 * cell 14 is the black oil splat. The sheet has no dedicated muzzle flash, so the bright
 * radial burst in cell 0 carries the muzzle bloom.
 *
 * art-25 attempt 7 supplies the four explosion packages: cells 4–6 are the small, medium
 * and large smoke clouds, cell 7 is the sheet's only explosion, cells 8 and 9 are flung
 * chunks and the rock cluster, and cell 15 is a spark burst with rays.
 */
export const EFFECT_ART: Record<EffectKind, readonly string[]> = {
  // art-10 cells 2, 1 and 0 — large, medium and small bursts.
  explosion: ['fx/explosion-large', 'fx/explosion-medium', 'fx/explosion-small'],
  // art-10 cell 0 — a radial burst reads as a muzzle bloom at 20 px.
  muzzle: ['fx/explosion-small'],
  // art-10 cells 4 and 5 — the two plain smoke clouds; art-25 cell 6 is the biggest cloud.
  smoke: ['fx/smoke-puff', 'fx/thick-smoke', 'fx-expanded/smoke-puff'],
  // art-10 cell 14 — the black splat.
  oil: ['fx/oil-splatter'],
  // art-25 cells 4 and 6 — grey puffs. art-10's `fx/dust-cloud` is not a cloud at all.
  dust: ['fx-expanded/explosion-medium', 'fx-expanded/smoke-puff', 'fx/smoke-puff'],
  // art-25 cells 14 and 13 — the sheet's large and medium water splashes. art-10's
  // `fx/water-splash` is cell 10, which inspection shows is the orange rubble pile (that
  // sheet's splash is cell 9), so every water effect asks for the art-25 frames instead.
  splash: ['fx-expanded/water-splash-large', 'fx-expanded/water-splash-small'],
  // art-10 cell 3 — the teardrop flame, with the medium burst behind it.
  fire: ['fx/fireball', 'fx/explosion-medium'],
  // art-25 cell 15 — the spark burst, then art-10's small radial burst.
  sparks: ['fx-expanded/sparks-burst', 'fx/explosion-small'],
  // art-25 cells 9 and 8 — the rock cluster, then the scattered chunks.
  debris: ['fx-expanded/debris-burst', 'fx-expanded/smoke-ring'],
  // art-10 cell 13 — the concentric ring, then art-25's ring of chunks and white arc.
  shockwave: ['fx/shockwave-ring', 'fx-expanded/debris-chunk', 'fx-expanded/shockwave-ring'],
  // art-10 cell 12 — the spark-trailed arc; art-25 cell 15 is the fallback burst.
  arc: ['fx/electric-arc', 'fx-expanded/sparks-burst'],
};

/** The effects the special weapons draw from `art-25-fx-expanded`. */
export type WeaponEffectKind = 'blast' | 'shockwave' | 'debris' | 'smoke' | 'splash' | 'sparks';

/**
 * Weapon effect → candidate frame ids, most specific first.
 *
 * art-25 attempt 7 is shifted from its labels across the whole sheet, so every entry below
 * was matched on `pipeline/work/art-25-fx-expanded/attempt-7/cell-N.png`, not on the cell
 * name. Row-major from cell 4 (cells 0–3 carry baked-in captions and are declared dropped in
 * `pipeline/registry/slots.ts`, so those frames never reach the atlas):
 *   4 a small smoke puff (labelled `explosion medium`) · 5 a larger cloud (labelled
 *   `explosion large`) · 6 the largest cloud (labelled `smoke puff`) · 7 the sheet's only
 *   explosion (labelled `smoke cloud`) · 8 scattered chunks (labelled `smoke ring`) ·
 *   9 a rock cluster (labelled `debris burst`) · 10 a dark ring (labelled `debris chunk`) ·
 *   11 a white arc (labelled `shockwave ring`) · 12 a small splash (labelled
 *   `shockwave arc`) · 13 and 14 larger splashes · 15 a spark burst.
 */
export const WEAPON_EFFECT_ART: Record<WeaponEffectKind, readonly string[]> = {
  // Cell 7 — the rocket's detonation.
  blast: ['fx-expanded/smoke-cloud'],
  // Cells 10 and 11 — a whole ring, then the single arc.
  shockwave: ['fx-expanded/debris-chunk', 'fx-expanded/shockwave-ring'],
  // Cells 8 and 9 — flung chunks, then the rock cluster.
  debris: ['fx-expanded/smoke-ring', 'fx-expanded/debris-burst'],
  // Cells 6 and 4 — the two largest clouds.
  smoke: ['fx-expanded/smoke-puff', 'fx-expanded/explosion-medium'],
  // Cells 14, 13 and 12 — large, medium and small.
  splash: [
    'fx-expanded/water-splash-large',
    'fx-expanded/water-splash-small',
    'fx-expanded/shockwave-arc',
  ],
  // Cell 15.
  sparks: ['fx-expanded/sparks-burst'],
};

/**
 * The wake a hull leaves while it is moving on water.
 *
 * art-25 cells 12–14 hold the sheet's three splashes (documented under
 * `WEAPON_EFFECT_ART.splash`), so the wake is the small one with the large one behind it.
 * No extra image is needed.
 */
export const SURFACE_WAKE_ART: readonly string[] = [
  'fx-expanded/water-splash-small',
  'fx-expanded/water-splash-large',
];

/**
 * The bank band drawn at a land/water transition.
 *
 * art-15 cells 7 and 4 are the sheet's gravel shore and sand bank — full-bleed ground
 * textures, so a short band of either reads as the shore rather than as water. The art-18
 * `asphalt-to-water` cell is rejected in `TRANSITION_TILE_ART`: it carries a painted car,
 * so it cannot be repeated.
 */
export const SHORE_BANK_ART: readonly string[] = [
  'tiles-water/gravel-shore',
  'tiles-water/sand-bank',
];

/**
 * The boundary marker drawn on the bank band.
 *
 * The one clean cell on art-18 is `chevron-shoulder` (cell 5); the same cell already carries
 * the canyon's hazard shoulder. Repeating a row of its chevrons across the aperture marks a
 * shoreline that is about to change material.
 */
export const SHORE_STRIPE_ART: readonly string[] = ['tiles-transition/chevron-shoulder'];

/**
 * The flame stream, in flicker order, drawn from art-10.
 *
 * art-25's three flame-stream cells carry the cell captions baked into the artwork, so the
 * order falls back to art-10 for the flame: cell 3 is a literal flame (`fx/fireball`) and
 * the two bursts behind it are what the stream flickers between. All three frames already
 * ship, so the fallback costs no extra image.
 */
export const FLAME_STREAM_ART: readonly (readonly string[])[] = [
  ['fx/fireball'],
  ['fx/explosion-medium'],
  ['fx/explosion-small'],
];

/**
 * The rocket's frame in flight.
 *
 * art-10 cell 12 is labelled `electric arc` but draws a small projectile with a spark
 * trail — the only missile-shaped cell in either sheet, and it is already shipped.
 */
export const ROCKET_ART: readonly string[] = ['fx/electric-arc'];

/** The HUD icons `art-19-ui-icons` supplies. */
export type HudIconKind =
  | 'gun'
  | 'oil'
  | 'smoke'
  | 'rocket'
  | 'flame'
  | 'armour'
  | 'shield'
  | 'warning'
  | 'reticle'
  | 'arrow-left'
  | 'boat';

/**
 * HUD icon → candidate frame ids, most specific first.
 *
 * art-19 attempt 3 (4 × 4 at 16 px) was matched cell by cell on
 * `pipeline/work/art-19-ui-icons/attempt-3/cell-N.png`; it drifts from its declared labels
 * from cell 6 onward. Row-major the sheet draws:
 *   0 machine gun · 1 black oil slick · 2 grey smoke puff · 3 rocket · 4 flame · 5 grey
 *   armour plate · 6 teal shield (label `life`) · 7 a second flame (label `shield`) ·
 *   8 a green canister captioned `NITRO` (label `nitro`) · 9 a speedometer dial captioned
 *   `km/h` (label `speed`) · 10 an orange warning triangle (label `boss`) · 11 a skull dial
 *   captioned `BOSS` (label `warning`) · 12 a left arrow (label `reticle`) · 13 a reticle
 *   (label `arrow left`) · 14 a second reticle (label `arrow right`) · 15 a small boat.
 *
 * Cells 8, 9 and 11 bake lettering into the icon, so nothing wires them, and cells 7 and 14
 * are duplicates. That leaves the HUD with no clean cell for the life pip, the nitro
 * canister, the speedometer, the boss emblem or a right arrow — those keep the primitives
 * `HudScene` draws. The warning triangle is clean: its `!` is the standard pictogram rather
 * than a caption, and it lives in the cell the registry labels `boss`.
 */
export const HUD_ICON_ART: Readonly<Record<HudIconKind, readonly string[]>> = {
  // Cell 0.
  gun: ['ui-icons/gun'],
  // Cell 1.
  oil: ['ui-icons/oil'],
  // Cell 2.
  smoke: ['ui-icons/smoke'],
  // Cell 3.
  rocket: ['ui-icons/rocket'],
  // Cell 4.
  flame: ['ui-icons/flame'],
  // Cell 5.
  armour: ['ui-icons/armour'],
  // Cell 6 — a shield. The label on this cell says "life".
  shield: ['ui-icons/life'],
  // Cell 10 — a warning triangle. The label on this cell says "boss".
  warning: ['ui-icons/boss'],
  // Cells 13 and 14 — the same reticle twice. The label on cell 13 says "arrow left".
  reticle: ['ui-icons/arrow-left', 'ui-icons/arrow-right'],
  // Cell 12 — a left arrow. The label on this cell says "reticle".
  'arrow-left': ['ui-icons/reticle'],
  // Cell 15.
  boat: ['ui-icons/boat'],
};

/** The chrome components `art-20-ui-chrome` supplies. */
export type UiChromeKind =
  | 'panel-corner'
  | 'panel-edge-h'
  | 'panel-edge-v'
  | 'panel-fill'
  | 'meter-frame'
  | 'meter-fill'
  | 'boss-bar-fill'
  | 'divider'
  | 'banner'
  | 'progress-cap'
  | 'corner-bracket';

/**
 * UI chrome → candidate frame ids, most specific first.
 *
 * art-20 attempt 3 (4 × 4 at 64 px) was matched cell by cell on
 * `pipeline/work/art-20-ui-chrome/attempt-3/cell-N.png`. Row-major the sheet draws:
 *   0 riveted L corner · 1 horizontal strip with an inset red bar · 2 vertical strip with
 *   an inset red bar · 3 plain riveted plate · 4 lined plate · 5 a gauge with tiny lettering
 *   (label `meter fill`) · 6 green/black two-tone bar (label `boss bar frame`) · 7 red/black
 *   two-tone bar · 8 `PAUSE FRAME` · 9 `SECTOR CARD` · 10 `TITLE` · 11 `GAME PR CARD` ·
 *   12 a flat orange plate (label `divider`) · 13 an orange ribbon (label `banner`) ·
 *   14 a segmented bar with a green cap (label `progress cap`) · 15 a corner bracket.
 *
 * Cells 8–11 are the four card plates with their names baked in, so the pause, sector, title
 * and game-over cards keep their primitive plates. Cell 5 is a gauge rather than a bar, so
 * the sheet has no clean boss bar frame and the boss bar keeps its primitive one. Cell 12
 * is a solid orange block — the sheet drew no divider rule at all — so `divider` has no
 * frame and every scene keeps the rule it draws.
 *
 * `panel-edge-h`, `panel-edge-v`, `meter-frame`, `meter-fill`, `boss-bar-fill` and
 * `progress-cap` are mapped but no scene draws them today: every one is a 64 px component
 * and the only surfaces they would dress are the HUD's 6 px speed and boss bars, which
 * would need fractional scaling.
 */
export const UI_CHROME_ART: Readonly<Record<UiChromeKind, readonly string[]>> = {
  // Cell 0.
  'panel-corner': ['ui-chrome/panel-corner'],
  // Cell 1.
  'panel-edge-h': ['ui-chrome/panel-edge-h'],
  // Cell 2.
  'panel-edge-v': ['ui-chrome/panel-edge-v'],
  // Cell 3.
  'panel-fill': ['ui-chrome/panel-fill'],
  // Cell 4.
  'meter-frame': ['ui-chrome/meter-frame'],
  // Cell 6 — the green/black bar. The label on this cell says "boss bar frame".
  'meter-fill': ['ui-chrome/boss-bar-frame'],
  // Cell 7.
  'boss-bar-fill': ['ui-chrome/boss-bar-fill'],
  // Cell 12 is a flat orange plate, not a rule — there is no divider cell to wire.
  divider: [],
  // Cell 13.
  banner: ['ui-chrome/banner'],
  // Cell 14.
  'progress-cap': ['ui-chrome/progress-cap'],
  // Cell 15.
  'corner-bracket': ['ui-chrome/corner-bracket'],
};

/**
 * Chrome roles deliberately left on the primitive.
 *
 * Empty today: a role is either backed by a clean cell above or listed here, and never
 * both. It exists so a test can tell "not drawn yet, on purpose" apart from "somebody
 * forgot a role".
 */
export const UI_CHROME_PLACEHOLDER: readonly UiChromeKind[] = ['divider'];


/** The civilian vehicles `art-08-civilians` supplies, one per content row. */
export type CivilianArtKind =
  | 'sedan'
  | 'wagon'
  | 'hatchback'
  | 'coupe'
  | 'taxi'
  | 'pickup-truck'
  | 'van'
  | 'box-truck'
  | 'small-lorry'
  | 'city-bus'
  | 'limousine'
  | 'skiff'
  | 'barge'
  | 'boat';

/**
 * Civilian art → candidate frame ids, most specific first.
 *
 * art-08 attempt 2 replaces the six-cell attempt-1 sheet with a full 4 × 4, but the model
 * drew the fourteen vehicles in a different order than the registry declared them. Every
 * entry below was matched on `pipeline/work/art-08-civilians/attempt-2/cell-N.png` and
 * names the cell by the label it carries, which is why several ids read as the neighbouring
 * subject. Row-major the sheet draws:
 *   0 dark sedan · 1 white estate wagon (front doors open) · 2 dark hatchback (front doors
 *   open) · 3 red coupe · 4 yellow taxi · 5 teal pickup · 6 a second taxi (label `van`) ·
 *   7 a third taxi (label `box truck`) · 8 olive lorry · 9 white box truck (label
 *   `city bus`) · 10 white city bus (label `limousine`) · 11 grey van (label `skiff`) ·
 *   12 grey limousine (label `barge`) · 13 skiff (label `boat`) · 14 river barge (the slot
 *   left it unlabelled) · 15 pleasure boat (also unlabelled).
 *
 * Cells 6 and 7 are duplicate taxis nobody asked for, so nothing claims `civilians/van` or
 * `civilians/box-truck` — the van is really in cell 11 and the box truck in cell 9. Cells 1
 * and 2 carry open door flaps that reach past the body and cells 13–15 carry painted water;
 * the current soft art bible accepts both, and `pipeline/registry/slots.ts` records it.
 */
export const CIVILIAN_ART: Readonly<Record<CivilianArtKind, readonly string[]>> = {
  // Cell 0.
  sedan: ['civilians/sedan'],
  // Cell 1.
  wagon: ['civilians/wagon'],
  // Cell 2.
  hatchback: ['civilians/hatchback'],
  // Cell 3.
  coupe: ['civilians/coupe'],
  // Cell 4.
  taxi: ['civilians/taxi'],
  // Cell 5.
  'pickup-truck': ['civilians/pickup-truck'],
  // Cell 11 — a grey delivery van. The label on this cell says "skiff".
  van: ['civilians/skiff'],
  // Cell 9 — a white box truck. The label on this cell says "city bus".
  'box-truck': ['civilians/city-bus'],
  // Cell 8.
  'small-lorry': ['civilians/small-lorry'],
  // Cell 10 — a white city bus. The label on this cell says "limousine".
  'city-bus': ['civilians/limousine'],
  // Cell 12 — a grey limousine. The label on this cell says "barge".
  limousine: ['civilians/barge'],
  // Cell 13 — a skiff with painted water. The label on this cell says "boat".
  skiff: ['civilians/boat'],
  // Cell 14 — the river barge, in one of the two cells the slot left unlabelled.
  barge: ['civilians/cell-14'],
  // Cell 15 — the pleasure boat, in the other unlabelled cell.
  boat: ['civilians/cell-15'],
};

/** The prop ids the level `propPool` rows place. */
export type PropKind =
  | 'cone'
  | 'barrier'
  | 'tyre-stack'
  | 'sign'
  | 'boulder'
  | 'rock-pile'
  | 'cactus'
  | 'dry-bush'
  | 'crater'
  | 'buoy'
  | 'reed-bed'
  | 'pier'
  | 'roadblock'
  | 'dumpster'
  | 'manhole'
  | 'pillar'
  | 'rubble'
  | 'hazard-stripe';

/**
 * Prop id → candidate frame ids, most specific first.
 *
 * Both prop sheets are shifted from their labels, so every entry below was matched by
 * looking at `pipeline/work/<slot>/attempt-1/cell-N.png`, not by trusting the cell name.
 *
 * art-11 attempt 1 (4×4, labels in row-major order) draws:
 *   0 cone · 1 jersey barrier · 2 tyre stack · 3 warning sign · 4 dumpster ·
 *   5 manhole cover · 6 hazard stripe board · 7 dumpster (repeat) · 8 sawhorse-style
 *   barricade · 9 sandbag wall · 10 chain fence · 11 reflector post · 12 pallet stack ·
 *   13 road patch · 14 pallet stack (repeat) · 15 pothole
 * so `roadblock` lives in cell 8 (labelled `spike strip`), `dumpster` in cell 4 (labelled
 * `roadblock`), `manhole` in cell 5 (labelled `dumpster`) and `hazard-stripe` in cell 6
 * (labelled `manhole`).
 *
 * art-12 attempt 1 draws:
 *   0 boulder · 1 rock pile · 2 dry bush · 3 cactus · 4 crater · 5 crater (repeat) ·
 *   6 palm tree · 7 reed bed · 8 plank stack · 9 concrete pillar · 10 wooden pier deck ·
 *   11 buoy · 12 oil pump · 13 pipeline segment · 14 water tower · 15 wrecked car
 * so `reed-bed` lives in cell 7 (labelled `buoy`), `buoy` in cell 11 (labelled
 * `rubble pile`), `pillar` in cell 9 (labelled `wooden pier`) and `pier` in cell 10
 * (labelled `concrete pillar`).
 *
 * `rubble` shares the grey angular rock pile in art-12 cell 1: a tunnel-floor pile of
 * broken concrete and a canyon rock pile are the same sprite at 32 px. Two ids pointing at
 * one cell is deliberate — the sheet has no separate rubble cell and a second copy of the
 * same drawing would only cost a cell.
 */
export const PROP_ART: Record<PropKind, readonly string[]> = {
  // art-11 cell 0.
  cone: ['props-a/traffic-cone'],
  // art-11 cell 1.
  barrier: ['props-a/jersey-barrier'],
  // art-11 cell 2.
  'tyre-stack': ['props-a/tyre-stack'],
  // art-11 cell 3.
  sign: ['props-a/warning-sign'],
  // art-12 cell 0.
  boulder: ['props-b/boulder'],
  // art-12 cell 1 — also carries `rubble`.
  'rock-pile': ['props-b/rock-pile'],
  // art-12 cell 3.
  cactus: ['props-b/cactus'],
  // art-12 cell 2.
  'dry-bush': ['props-b/dry-bush'],
  // art-12 cell 4 — cell 5 is a second crater if this one is ever dropped.
  crater: ['props-b/crater'],
  // art-12 cell 11. The label on this cell says "rubble pile".
  buoy: ['props-b/rubble-pile'],
  // art-12 cell 7. The label on this cell says "buoy".
  'reed-bed': ['props-b/buoy'],
  // art-12 cell 10. The label on this cell says "concrete pillar".
  pier: ['props-b/concrete-pillar'],
  // art-11 cell 8. The label on this cell says "spike strip".
  roadblock: ['props-a/spike-strip'],
  // art-11 cell 4. The label on this cell says "roadblock".
  dumpster: ['props-a/roadblock'],
  // art-11 cell 5. The label on this cell says "dumpster".
  manhole: ['props-a/dumpster'],
  // art-12 cell 9. The label on this cell says "wooden pier".
  pillar: ['props-b/wooden-pier'],
  // art-12 cell 1 — shared with `rock-pile`; see the note above.
  rubble: ['props-b/rock-pile'],
  // art-11 cell 6. The label on this cell says "manhole".
  'hazard-stripe': ['props-a/manhole'],
};

/**
 * Prop ids deliberately left on the procedural cone because no cell holds them.
 *
 * Empty today: every id the generators place has a cell in one of the two prop sheets.
 * It exists so the sheet/generator test can tell "not drawn yet, on purpose" apart from
 * "somebody added a pool id and forgot the art".
 */
export const PROP_PLACEHOLDER: readonly PropKind[] = [];

/**
 * Candidate frames for a ramp.
 *
 * art-09 attempt 1 draws a vehicle ramp in the `weapons-van-ramp` cell (labelled by the
 * generator as a van carrying a ramp, but the ramp itself fills the cell), and it is the
 * only ramp-shaped frame in the shipped atlas. Reusing it costs no new image.
 */
export const RAMP_ART: readonly string[] = ['weapons-pickups/weapons-van-ramp'];

/**
 * The scenery surface a decor prop is drawn from.
 *
 * One surface per sheet: `art-22` for open road and desert, `art-23` for the delta and
 * `art-24` for the city block. A level profile names its surface and the generator only
 * ever places props from that surface's pool.
 */
export type ScenerySurface = 'roadside' | 'water' | 'urban';

/**
 * Scenery prop id → candidate frame ids, most specific first.
 *
 * Every entry was matched on the processed cells in `pipeline/work/<slot>/attempt-1/`, not
 * on the declared cell labels, because the scenery sheets drifted from theirs.
 *
 * art-22 attempt 1 (4 × 4, row-major) draws:
 *   0 tree with a baked sign · 1 dead tree · 2 bush cluster · 3 dry grass tuft ·
 *   4 rock plus the top half of a fence · 5 bush plus fence · 6 rock plus a chain-link
 *   panel · 7 rock pile plus fence · 8 warning sign · 9 chain-link fence panel ·
 *   10 blank billboard · 11 a whole van · 12 a burnt wreck · 13 a wreck with debris ·
 *   14 pylon with power lines and fire · 15 pylon on a concrete base.
 * Cells 4–7 are deliberately **not** referenced: each carries a second, half-drawn object
 * below its own subject, so slicing them ships a fence fragment. The real fence on the
 * sheet is cell 9, whose label says `direction sign blank`; the whole van in cell 11 is
 * labelled `wrecked sedan` and is skipped for the same reason — it is not a wreck.
 *
 * art-23 attempt 1 drifts one cell from its labels from cell 8 onward. A frame id is derived
 * from its label, so each entry below names the cell by its label and the comment says what
 * is actually drawn there. Row-major the sheet draws:
 *   0 reed bank · 1 reed clump · 2 plank dock cross · 3 moored hull (labelled `dock
 *   ladder`) · 4 channel buoy · 5 marker buoy · 6 moored dinghy · 7 moored skiff ·
 *   8 rock in water (labelled `moored barge`) · 9 brick jetty corner (labelled `water
 *   rock`) · 10 truss bridge pier (labelled `stone jetty`) · 11 dock ladder (labelled
 *   `bridge pier`) · 12 post in a tyre (labelled `tall bridge pier`) · 13 truss pier
 *   (labelled `tire fender`) · 14 a second post in a tyre (labelled `mooring post`) ·
 *   15 floating pontoon, the one cell whose label matches.
 * Cells 11 and 13 are deliberately **not** referenced: cell 11 is a dock ladder and no
 * scenery id wants one (the `dock` prop is the plank cross in cell 2), and cell 13 is a
 * second truss pier that adds no variety over the cleaner one in cell 10. Cell 3 is a
 * moored hull rather than the ladder its label promises, so it is spent as the third
 * `boat` variant instead of being wasted.
 *
 * art-24 attempt 1 matches its labels throughout: roofs (0–3), blank signs (4–5), AC units
 * (6–7), a dumpster and a skip (8–9), lamp heads (10–11), planters (12–13), a water tank
 * (14) and a satellite dish (15).
 *
 * Several ids list more than one candidate, so the scene can vary a stretch of road without
 * a second sheet: `pickSceneryVariant()` chooses between them from the prop's own world
 * position.
 */
export const SCENERY_ART: Readonly<
  Record<ScenerySurface, Readonly<Record<string, readonly string[]>>>
> = {
  roadside: {
    tree: ['scenery-roadside/tree-roadside'],
    'dead-tree': ['scenery-roadside/tree-blown'],
    bush: ['scenery-roadside/bush-cluster'],
    'dry-hedge': ['scenery-roadside/dry-hedge'],
    // Cell 9 — the chain-link panel, labelled `direction sign blank`.
    fence: ['scenery-roadside/direction-sign-blank'],
    // Cell 8.
    'warning-sign': ['scenery-roadside/warning-sign-blank'],
    // Cell 10.
    billboard: ['scenery-roadside/billboard-blank'],
    // Cell 12 — a burnt wreck, labelled `wrecked van`.
    'wrecked-car': ['scenery-roadside/wrecked-van'],
    // Cell 13 — a wreck with debris, labelled `burnt car`.
    'burnt-car': ['scenery-roadside/burnt-car'],
    // Cell 15 first: a pylon standing on its own base reads better than the wired one.
    pylon: ['scenery-roadside/pylon-concrete', 'scenery-roadside/pylon-lattice'],
  },
  water: {
    // Cells 0 and 1 — two reed banks.
    reeds: ['scenery-water/reed-bank', 'scenery-water/reed-clump'],
    // Cell 2 — the plank dock cross.
    dock: ['scenery-water/wooden-dock'],
    // Cells 4 and 5 — a channel buoy and a marker buoy.
    buoy: ['scenery-water/channel-buoy', 'scenery-water/marker-buoy'],
    // Cells 6, 7 and 3 — two moored boats, then the moored hull drawn in the cell the
    // label calls `dock ladder`.
    boat: [
      'scenery-water/moored-dinghy',
      'scenery-water/moored-skiff',
      'scenery-water/dock-ladder',
    ],
    // Cell 8 — a rock in water. The label on this cell says "moored barge".
    'water-rock': ['scenery-water/moored-barge'],
    // Cell 9 — a brick jetty corner. The label on this cell says "water rock".
    jetty: ['scenery-water/water-rock'],
    // Cell 10 — a truss bridge pier. The label on this cell says "stone jetty".
    'bridge-pier': ['scenery-water/stone-jetty'],
    // Cell 12 — a post set in a tyre. The label on this cell says "tall bridge pier".
    'tire-fender': ['scenery-water/tall-bridge-pier'],
    // Cell 14 — a second post in a tyre; the label matches closely enough to keep it.
    'mooring-post': ['scenery-water/mooring-post'],
    // Cell 15 — the floating pontoon.
    pontoon: ['scenery-water/floating-pontoon'],
  },
  urban: {
    'apartment-roof': ['scenery-urban/apartment-roof'],
    'house-roof': ['scenery-urban/house-roof'],
    skylight: ['scenery-urban/roof-skylight'],
    hatch: ['scenery-urban/roof-stair-hatch'],
    'neon-sign': ['scenery-urban/neon-sign-blank'],
    billboard: ['scenery-urban/billboard-blank'],
    'ac-unit': ['scenery-urban/ac-unit', 'scenery-urban/ac-unit-bank'],
    dumpster: ['scenery-urban/dumpster', 'scenery-urban/skip-container'],
    streetlight: ['scenery-urban/streetlight-head', 'scenery-urban/streetlight-twin'],
    planter: ['scenery-urban/planter-box', 'scenery-urban/planter-tree'],
    'water-tank': ['scenery-urban/roof-water-tank'],
    'satellite-dish': ['scenery-urban/satellite-dish'],
  },
};

/** Frame ids for a scenery prop, or none when the id is unknown and the fallback wins. */
export function sceneryArtIds(surface: ScenerySurface, prop: string): readonly string[] {
  const table = SCENERY_ART[surface];
  return Object.prototype.hasOwnProperty.call(table, prop) ? (table[prop] ?? []) : [];
}

/**
 * Put the candidate a prop at `at` should wear first, keeping the rest as fallbacks.
 *
 * Deterministic by construction: the choice is a pure function of the prop's own world
 * position and its candidate count, so the same prop always wears the same frame while it
 * scrolls — no runtime randomness enters a seeded run, and a sprite cannot flicker between
 * two cells as it moves.
 */
export function pickSceneryVariant(ids: readonly string[], at: number): readonly string[] {
  if (ids.length <= 1) return ids;
  const index = Math.abs(Math.round(at)) % ids.length;
  const chosen = ids[index];
  if (!chosen) return ids;
  return [chosen, ...ids];
}

/** The tile roles the road tile layer can draw from a tile sheet. */
export type TileKind = 'surface' | 'dash' | 'shoulder' | 'terrain';

/** Tile role → candidate frame ids, most specific first. */
export type TileArtByKind = Readonly<Record<TileKind, readonly string[]>>;

/** The transition and overlay roles `art-18-tiles-transition` was asked to draw. */
export type TransitionKind =
  | 'asphalt-sand'
  | 'asphalt-water'
  | 'asphalt-concrete'
  | 'shoulder-grass'
  | 'grass-rock'
  | 'chevron'
  | 'faded-paint'
  | 'rain'
  | 'snow'
  | 'fog'
  | 'scanline'
  | 'vignette'
  | 'dirt'
  | 'crack'
  | 'blend-mask';

/**
 * Highway tile role → candidate frame ids, most specific first.
 *
 * art-13 attempt 1 is shifted from its labels, so every entry was matched by looking at
 * `pipeline/work/art-13-tiles-highway/attempt-1/cell-N.png`, not by trusting the cell
 * name. Row-major the sheet draws:
 *   0 plain asphalt patch · 1 road strip with a dash and an overhead rail ·
 *   2 road strip with two solid lines · 3 road strip with two thin solid lines ·
 *   4 asphalt with a rust shoulder · 5 road strip with gravel shoulders and a dash ·
 *   6 guardrail · 7 grass verge · 8 steel bridge plate · 9 tunnel mouth (cracked) ·
 *   10 tunnel mouth with oil stains · 11 clean vertical lane strip: dashed centre line
 *   and solid edge lines · 12 road strip with amber edge lines · 13 cats eye on cracked
 *   asphalt · 14 chevron sign · 15 painted arrow.
 * so the lane dash lives in cell 11 (labelled `oil stain overlay`), the shoulder in cell 5
 * (labelled `shoulder gravel`) and the surface in cell 0 (labelled correctly). Cell 1 is
 * kept as the dash alternate even though its overhead rail breaks vertical repetition:
 * a renamed sheet should still draw a road, not a placeholder.
 */
export const HIGHWAY_TILE_ART: TileArtByKind = {
  // Cell 0 — plain asphalt, no markings.
  surface: ['tiles-highway/asphalt-plain'],
  // Cell 11 — the only clean vertical dash strip on the sheet.
  dash: ['tiles-highway/oil-stain-overlay', 'tiles-highway/asphalt-lane-dash'],
  // Cell 5 — gravel on both sides of a road strip.
  shoulder: ['tiles-highway/shoulder-gravel', 'tiles-highway/shoulder-asphalt'],
  // Cell 7 — grass verge.
  terrain: ['tiles-highway/grass-verge'],
};

/**
 * Canyon tile role → candidate frame ids, most specific first.
 *
 * art-14 attempt 1 is shifted too, so this was matched on the processed cells:
 *   0 road strip: cracked asphalt, solid edge line at column 2, painted white dash at
 *   column 16 · 1 sand plain · 2 sand/dirt/red-rock transition · 3 cliff rock ·
 *   4 cliff edge · 5 loose gravel · 6 cracked stone · 7 red rock · 8 dry scrub ·
 *   9 road strip with sand shoulders · 10 rock scree · 11 a 13 × 25 painted-line overlay ·
 *   12 rock wall with road and a yellow dash · 13 metal grate · 14 dust spray ·
 *   15 road between rock walls with a yellow dash.
 * The road surface is cell 0; its painted dash is sampled as the lane band rather than
 * as part of the surface (see `CANYON_TILE_WINDOWS`), which is why the same cell appears
 * in two roles. Cell 6 is the only uniform stone texture, so it carries the shoulders.
 */
export const CANYON_TILE_ART: TileArtByKind = {
  // Cell 0 — cracked asphalt.
  surface: ['tiles-canyon/cracked-asphalt'],
  // Cell 0 again — the painted dash at column 16, windowed for the lane band.
  dash: ['tiles-canyon/cracked-asphalt'],
  // Cell 6 — cracked stone, uniform edge to edge.
  shoulder: ['tiles-canyon/cracked-stone'],
  // Cell 1 — open sand.
  terrain: ['tiles-canyon/sand-plain'],
};

/**
 * Water tile role → candidate frame ids, most specific first.
 *
 * art-15 attempt 1 is shifted from its labels as well:
 *   0 open water · 1 choppy water · 2 foam patch · 3 wake · 4 sand bank ·
 *   5 muddy bank · 6 reed bed · 7 gravel shore · 8 shallow water over sand ·
 *   9 deep water with a diagonal crest · 10 current streak · 11 pier structure ·
 *   12 wooden pier deck (labelled `stone bank edge`) · 13 stone bank with a water pool
 *   (labelled `pier plank`) · 14 plank stack · 15 mooring buoy.
 * The channel is water: the surface and the terrain outside it are both water cells, and
 * the shoulders are the pier deck, whose posts read as the channel edge. Nothing here is
 * asphalt — a city road painted on water would be the wrong material.
 *
 * The surface is the **current streak**, not `open water`: measured on the shipped PNG,
 * `open water` ramps from a mean row luma of 115 at its top to 66 at its bottom, so any
 * window tall enough to scroll steps ~50 luma at the wrap and paints a bright band every
 * tile. The current streak's rows are noise around one level, and its wrap is 4 luma.
 */
export const WATER_TILE_ART: TileArtByKind = {
  // Cell 10 — current streak: the full-bleed water cell with the flattest rows.
  surface: ['tiles-water/current-streak'],
  // Cell 2 — the foam patch, repeated as a dashed wake along each lane boundary. The
  // current streak (cell 10) is the alternate: a sheet without the foam then draws plain
  // water down the lane divider rather than nothing at all.
  dash: ['tiles-water/foam', 'tiles-water/current-streak'],
  // Cell 12 — plank deck, the sheet's `stone bank edge`.
  shoulder: ['tiles-water/stone-bank-edge'],
  // Cell 9 — deep water.
  terrain: ['tiles-water/deep-water'],
};

/**
 * City tile role → candidate frame ids, most specific first.
 *
 * art-16 attempt 1 is shifted from its labels, and most of its cells are compositions
 * rather than seams. Every entry was matched on `pipeline/work/art-16-tiles-city/
 * attempt-1/cell-N.png`. Row-major the sheet draws:
 *   0 a street strip: rust kerb edge at column 10, dashed centre line at column 18, kerb
 *   line at columns 26–28, and an L-shaped pavement corner in columns 1–8 ·
 *   1 a four-way intersection · 2 a crosswalk (four-way stripes) · 3 a building roof with
 *   a vent and a rust parapet (labelled `sidewalk slab`) · 4 the only plain slab
 *   (labelled `sidewalk corner`) · 5 a roof with a vent box · 6 a roof with a circular
 *   hatch (labelled `roof vent`) · 7 a roof with a railed ledge · 8 alley concrete ·
 *   9 an L of kerb around a manhole (label says `kerb edge`, and it is one — but it is a
 *   corner, not a strip) · 10 a manhole cover · 11 a teal storm-drain panel with painted
 *   lettering — opaque, wraps numerically, and must never be tiled · 12 a plaza tile ·
 *   13 a grass median · 14 a repeat of 13 · 15 a printed STOP sign.
 * The road surface is the street strip (0) windowed between its rust edge and its centre
 * dash; the same cell's dash column carries the lane band. Cell 12 is the only genuine
 * seamless surface on the sheet, so it is the pavement outside the road; cell 8 is a
 * fine-grained concrete strip and carries the kerb. Cell 4 is the alternate for both: it
 * is a plain slab, which degrades to a concrete road or kerb rather than a placeholder.
 */
export const CITY_TILE_ART: TileArtByKind = {
  // Cell 0 — asphalt between the kerb edge and the centre dash.
  surface: ['tiles-city/street-asphalt'],
  // Cell 0 again — the dashed centre line at column 18, windowed for the lane band.
  dash: ['tiles-city/street-asphalt'],
  // Cell 8 — alley concrete, fine-grained enough for an 8 px kerb strip.
  shoulder: ['tiles-city/alley-concrete', 'tiles-city/sidewalk-corner'],
  // Cell 12 — the plaza tile, the sheet's one seamless surface.
  terrain: ['tiles-city/plaza-tile', 'tiles-city/sidewalk-corner'],
};

/**
 * Tunnel tile role → candidate frame ids, most specific first.
 *
 * art-17 attempt 1 is close to its labels, and was matched on `pipeline/work/
 * art-17-tiles-tunnel/attempt-1/cell-N.png`:
 *   0 a full asphalt cell: a solid white edge line at columns 1–2, a dashed centre line
 *   at column 15, an amber hazard line at columns 26–27 and a bright edge at 30–31 ·
 *   1 a narrow asphalt strip carrying one solid line, with transparent margins (label
 *   `tunnel edge line`) · 2 concrete wall with a light fitting near the top ·
 *   3 concrete wall with cable runs · 4 ceiling panel · 5 a T-shaped pillar · 6 another
 *   pillar (label `support pillar`) · 7 a portal frame, hollow · 8 floor grate ·
 *   9 wet patch · 10 scorch mark · 11 emergency door with a painted arrow · 12 a boxed
 *   vent (label `lane arrow`) · 13 a pipe elbow (label `ventilation duct`) · 14 rubble ·
 *   15 a chevron board over a hazard stripe.
 * The road is the full asphalt cell (0): the surface is windowed between the white edge
 * line and the centre dash, the dash column becomes the lane band, and the outer eight
 * columns carry the painted edges. Outside the road is the wall — the concrete wall (2)
 * for the wide terrain bands, with the cabled wall (3) as the alternate. Cell 1 cannot be
 * a band on its own: 74 % of it is transparent, so a window either side of its line is
 * mostly hole. It is deliberately not listed.
 */
export const TUNNEL_TILE_ART: TileArtByKind = {
  // Cell 0 — asphalt between the white edge line and the centre dash.
  surface: ['tiles-tunnel/tunnel-asphalt'],
  // Cell 0 again — the dashed centre line at column 15.
  dash: ['tiles-tunnel/tunnel-asphalt'],
  // Cell 0's outer columns: white edge line on the left, amber hazard line on the right.
  shoulder: ['tiles-tunnel/tunnel-asphalt'],
  // Cell 2 — the concrete wall. Cell 3 is the same wall with cable runs.
  terrain: ['tiles-tunnel/concrete-wall', 'tiles-tunnel/wall-cable-run'],
};

/**
 * Transition role → candidate frame ids, matched on the processed cells.
 *
 * art-18 attempt 1 is heavily shifted from its labels and, unlike every previous tile
 * sheet, most of its cells carry a vehicle or an opaque scene. The table therefore names
 * only the cells that are clean, whole and on subject; every other role is `[]` and stays
 * on the drawn fallback. That is a decision, not a missing entry — see
 * `TRANSITION_PLACEHOLDER` below.
 *
 * Row-major the sheet draws:
 *   0 asphalt | sand with a car straddling the seam · 1 asphalt | water, red car ·
 *   2 asphalt | grass, car · 3 concrete paving, red car ·
 *   4 grass with a narrow worn road strip through it — clean, and the only blend cell ·
 *   5 amber chevrons on asphalt/concrete — clean, the only on-subject cell ·
 *   6 an opaque chevron/concrete scene with rain streaks ·
 *   7 grass | rock, but framed as a bordered object with a second strip below ·
 *   8 an asphalt | sand strip and a snow fragment in one cell ·
 *   9–10 more scene fragments with transparent gaps ·
 *   11 a crack network over a car · 12 a car on transparency ·
 *   13 a car in rust dirt · 14 a car under a crack network ·
 *   15 a bordered grey plate with no readable pattern.
 *
 * Cell 4 is labelled `grass to rock` and cell 5 `chevron shoulder`: cell 5 is the only cell
 * whose label matches its subject. A frame id names the cell by its *label*, so the clean
 * blend is `tiles-transition/grass-to-rock` and the chevron is
 * `tiles-transition/chevron-shoulder`.
 */
export const TRANSITION_TILE_ART: Readonly<Record<TransitionKind, readonly string[]>> = {
  // Cells 0–2 are asphalt/sand/water/concrete seams with a car on each.
  'asphalt-sand': [],
  'asphalt-water': [],
  'asphalt-concrete': [],
  // Cell 4 — grass → worn road → grass. Its two boundaries are the shoulder windows in
  // `HIGHWAY_EDGE_BLEND`.
  'shoulder-grass': ['tiles-transition/grass-to-rock'],
  // Cell 7 holds grass | rock, but it is object-framed with a black border and a detached
  // strip below, so it cannot be repeated as a band.
  'grass-rock': [],
  // Cell 5 — the only clean, on-subject transition cell on the sheet.
  chevron: ['tiles-transition/chevron-shoulder'],
  // Every overlay cell below was rejected: opaque scene, vehicle, or grey plate.
  'faded-paint': [],
  rain: [],
  snow: [],
  fog: [],
  scanline: [],
  vignette: [],
  dirt: [],
  crack: [],
  'blend-mask': [],
};

/**
 * Transition roles deliberately left on the drawn fallback.
 *
 * Empty today: a role is either backed by a clean cell above or listed here, and never
 * both. It exists so a test can tell "not drawn yet, on purpose" apart from "somebody
 * forgot a role".
 */
export const TRANSITION_PLACEHOLDER: readonly TransitionKind[] = [
  'asphalt-sand',
  'asphalt-water',
  'asphalt-concrete',
  'grass-rock',
  'faded-paint',
  'rain',
  'snow',
  'fog',
  'scanline',
  'vignette',
  'dirt',
  'crack',
  'blend-mask',
];

/** Frame ids for a pickup kind, or none when the kind is unknown and the fallback wins. */
export function pickupArtIds(kind: string): readonly string[] {
  return isPickupKind(kind) ? PICKUP_ART[kind] : [];
}

/** Frame ids for a prop id, or none when the id is unknown and the fallback wins. */
export function propArtIds(id: string): readonly string[] {
  return isPropKind(id) ? PROP_ART[id] : [];
}

/** Frame ids for a ramp, most specific first. */
export function rampArtIds(): readonly string[] {
  return RAMP_ART;
}

function isPickupKind(kind: string): kind is PickupKind {
  return Object.prototype.hasOwnProperty.call(PICKUP_ART, kind);
}

function isPropKind(id: string): id is PropKind {
  return Object.prototype.hasOwnProperty.call(PROP_ART, id);
}
