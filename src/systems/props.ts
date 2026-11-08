import { PROP_IMPACT } from '@/config';
import type { PropCollision } from '@/content';

/**
 * What a road prop costs on contact.
 *
 * Pure, so the three collision classes are testable without a scene, and so the scene has
 * no branch of its own that could disagree with the content table. "Solid" means the car
 * is stopped and spends armour; "soft" means nothing but the prop moves; "hazard" means a
 * speed penalty and nothing else.
 *
 * Airborne is the first question: a jump clears every ground prop, which is the whole
 * point of a ramp.
 */

/** What one prop contact does. */
export interface PropContactOutcome {
  /** False when the contact is ignored entirely — the car is airborne over it. */
  readonly contact: boolean;
  /** Spend one armour hit through the ordinary damage path. */
  readonly damage: boolean;
  /** Speed cap as a share of the current cruise. 1 means no slow. */
  readonly speedFactor: number;
  /** The prop leaves the road after the contact, rather than staying as scenery. */
  readonly shove: boolean;
}

const IGNORED: PropContactOutcome = {
  contact: false,
  damage: false,
  speedFactor: 1,
  shove: false,
};

export function propContactOutcome(
  collision: PropCollision,
  airborne: boolean,
): PropContactOutcome {
  if (airborne) return IGNORED;

  switch (collision) {
    case 'soft':
      return { contact: true, damage: false, speedFactor: 1, shove: true };
    case 'hazard':
      return {
        contact: true,
        damage: false,
        speedFactor: PROP_IMPACT.hazardSpeedFactor,
        shove: false,
      };
    case 'solid':
    default:
      return {
        contact: true,
        damage: true,
        speedFactor: PROP_IMPACT.solidSpeedFactor,
        shove: true,
      };
  }
}

/**
 * True when this class stops a car, which is what the level validator counts as a blocked
 * lane. Soft props and hazards are passable, so a row of cones is never an unavoidable wall.
 */
export function blocksLane(collision: PropCollision): boolean {
  return collision === 'solid';
}
