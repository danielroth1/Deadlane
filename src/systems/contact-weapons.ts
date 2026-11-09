import type { EnemyWeaponId } from '@/content';

/**
 * What each enemy's signature side weapon does to the car on contact.
 *
 * The weapon id is content (`enemies.json`); the feel of the hit is code, exactly the way a
 * `behavior` id is content and its steering is code. Two rules hold for every row:
 *
 *   - the contact is a **push**, never a deletion: the car is thrown sideways along the
 *     normal the resolver already found, and the enemy is left on the road to be shot;
 *   - the hit takes the wheel for a measured window (`lockMs`), so driving into a side
 *     weapon costs control before it costs armour.
 *
 * The record type is the exhaustiveness guard: a new `EnemyWeaponId` in `src/content`
 * fails to compile until it has effects here.
 */
export interface ContactWeaponSpec {
  /** Extra sideways kick away from the enemy, world px/s. */
  readonly pushPx: number;
  /** How long the impact holds the wheel, ms. */
  readonly lockMs: number;
}

export const CONTACT_WEAPONS: Readonly<Record<EnemyWeaponId, ContactWeaponSpec>> = {
  /** Motorcycle studs on a weaving pursuer: a sharp shove, a short loss of the wheel. */
  spikes: { pushPx: 260, lockMs: 320 },
  /** A charge interceptor's welded plate: heavy, quick to recover from. */
  'ram-plate': { pushPx: 300, lockMs: 280 },
  /** Road Lord's bull bar: the biggest kick on the ground. */
  'bull-bar': { pushPx: 340, lockMs: 380 },
  /** A hauler's mine rack: the crates shove, not the engine. */
  'mine-rack': { pushPx: 200, lockMs: 300 },
  /** A turret's autocannon barrel: a short, flat glance. */
  autocannon: { pushPx: 180, lockMs: 220 },
  /** Rotor wash: a sideways throw with a middling recovery. */
  'rotor-blades': { pushPx: 220, lockMs: 260 },
  /** The drone's EMP: little push, and the longest blackout in the table. */
  emp: { pushPx: 120, lockMs: 520 },
  /** A gunboat's broadside barrels: a wide shove. */
  broadside: { pushPx: 300, lockMs: 340 },
  /** Torpedo racks: the warheads are the shove. */
  'torpedo-rack': { pushPx: 280, lockMs: 300 },
  /** A harpoon line: pulls the wheel out of the player's hands. */
  harpoon: { pushPx: 240, lockMs: 360 },
  /** The dredger's drill: the heaviest and longest of the lot. */
  drill: { pushPx: 360, lockMs: 420 },
};

/** The effects of one weapon id. Total by construction; never throws. */
export function contactWeaponFor(id: EnemyWeaponId): ContactWeaponSpec {
  return CONTACT_WEAPONS[id];
}
