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

/** Frame ids for a pickup kind, or none when the kind is unknown and the fallback wins. */
export function pickupArtIds(kind: string): readonly string[] {
  return isPickupKind(kind) ? PICKUP_ART[kind] : [];
}

function isPickupKind(kind: string): kind is PickupKind {
  return Object.prototype.hasOwnProperty.call(PICKUP_ART, kind);
}
