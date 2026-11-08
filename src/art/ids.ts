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

/** The effects the scene draws from the art-10 sheet. */
export type EffectKind = 'explosion' | 'muzzle' | 'smoke' | 'oil';

/**
 * Effect → candidate frame ids, most specific first.
 *
 * art-10 attempt 1 is shifted from its labels from row 2 onward: cells 4–7 are four smoke
 * clouds, cell 8 is the tyre with skid streaks, cell 9 is the water splash, cell 10 is the
 * rubble pile and cells 11–12 are two electric arcs. The sheet has no dedicated muzzle
 * flash, so the bright radial burst in cell 0 carries the muzzle bloom.
 */
export const EFFECT_ART: Record<EffectKind, readonly string[]> = {
  // Cells 2, 1 and 0 — large, medium and small bursts.
  explosion: ['fx/explosion-large', 'fx/explosion-medium', 'fx/explosion-small'],
  // Cell 0 — a radial burst reads as a muzzle bloom at 20 px.
  muzzle: ['fx/explosion-small'],
  // Cells 4 and 5 — the two plain smoke clouds.
  smoke: ['fx/smoke-puff', 'fx/thick-smoke'],
  // Cell 14 — the black splat.
  oil: ['fx/oil-splatter'],
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

/** The tile roles the road tile layer can draw from a tile sheet. */
export type TileKind = 'surface' | 'dash' | 'shoulder' | 'terrain';

/** Tile role → candidate frame ids, most specific first. */
export type TileArtByKind = Readonly<Record<TileKind, readonly string[]>>;

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
 */
export const WATER_TILE_ART: TileArtByKind = {
  // Cell 0 — open water.
  surface: ['tiles-water/open-water'],
  // Cell 2 — the foam patch, repeated as a dashed wake along each lane boundary. The
  // current streak (cell 10) is the alternate: it is the cleaner water tile, but its
  // diagonal crest disappears against the surface at this size.
  dash: ['tiles-water/foam', 'tiles-water/current-streak'],
  // Cell 12 — plank deck, the sheet's `stone bank edge`.
  shoulder: ['tiles-water/stone-bank-edge'],
  // Cell 9 — deep water.
  terrain: ['tiles-water/deep-water'],
};

/** Frame ids for a pickup kind, or none when the kind is unknown and the fallback wins. */
export function pickupArtIds(kind: string): readonly string[] {
  return isPickupKind(kind) ? PICKUP_ART[kind] : [];
}

/** Frame ids for a prop id, or none when the id is unknown and the fallback wins. */
export function propArtIds(id: string): readonly string[] {
  return isPropKind(id) ? PROP_ART[id] : [];
}

function isPickupKind(kind: string): kind is PickupKind {
  return Object.prototype.hasOwnProperty.call(PICKUP_ART, kind);
}

function isPropKind(id: string): id is PropKind {
  return Object.prototype.hasOwnProperty.call(PROP_ART, id);
}
