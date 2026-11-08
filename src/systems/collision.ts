import { COLLISION } from '@/config';

/**
 * Vehicle-versus-vehicle contact.
 *
 * The road model gives every vehicle one world number, `at`, and derives screen y from it,
 * so a contact has to work on two axes that mean different things: `x` is the lane axis, and
 * `y` is the road ahead of or behind the car. This module does all of that maths on plain
 * numbers and none of it touches Phaser. The scene reads the result and moves the sprites;
 * an entity turns a push along `y` back into a change of `at`, which keeps the projection the
 * single source of screen position.
 *
 * Everything here is closed-form — same boxes, same velocities, same answer — with no clock,
 * no randomness and no state, which is what keeps a seeded run reproducible frame for frame.
 */

/**
 * An axis-aligned box in world pixels.
 *
 * Vehicles are boxes, not circles: a car is twice as long as it is wide, and a lane-sized
 * silhouette is what the player reads off the screen.
 */
export interface CollisionBox {
  /** Centre x, world px. */
  readonly x: number;
  /** Centre y, world px, in the road projection (`PLAYER.y + distance - at`). */
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/** A box that can be pushed: what it is doing now, and whether it may move down-screen. */
export interface ContactBody extends CollisionBox {
  /** Lateral velocity, world px/s. Positive is right. */
  readonly vx: number;
  /** Velocity down-screen, world px/s. Positive is away from the road ahead. */
  readonly vy: number;
  /**
   * True when the body holds its `y` station.
   *
   * The player car is pinned to the road projection, so it absorbs a push laterally and
   * nothing else: on a vertical contact the other body takes the whole displacement and the
   * whole impulse. Enemies and traffic move along `at`, so both of their shares are theirs.
   */
  readonly pinnedY: boolean;
}

/** How two boxes are touching. */
export interface Contact {
  /** Penetration along the normal, px. Strictly positive. */
  readonly depth: number;
  /** Unit normal, pointing from the first box toward the second. */
  readonly nx: number;
  readonly ny: number;
  /** The axis the contact was resolved on: the lane axis or the road axis. */
  readonly axis: 'x' | 'y';
}

/** What one contact does to the two bodies. All values are world px or world px/s. */
export interface ContactResolution {
  readonly contact: Contact;
  /** Closing speed along the normal, px/s. Never negative. */
  readonly approach: number;
  /** True when `approach` reaches `COLLISION.hardImpactSpeed`. */
  readonly hard: boolean;
  /** Positional correction each body takes, along the normal. */
  readonly shiftAX: number;
  readonly shiftAY: number;
  readonly shiftBX: number;
  readonly shiftBY: number;
  /** Velocity each body gains, along the normal. Always opposite in sign. */
  readonly deltaAX: number;
  readonly deltaAY: number;
  readonly deltaBX: number;
  readonly deltaBY: number;
}

/** Velocity anything with a screen position is moving at. */
export interface Velocity {
  readonly vx: number;
  readonly vy: number;
}

/**
 * The contact between two boxes, or null when they are apart.
 *
 * Resolved on the axis of least penetration: the direction that parts the boxes with the
 * smallest move, which is also the one that reads correctly — a car scraping past another
 * is pushed sideways, and one that runs into the back of another is pushed along the road.
 * A tie goes to `x`, the lane axis, so the result never depends on the order the axes happen
 * to be compared in.
 */
export function contactBetween(a: CollisionBox, b: CollisionBox): Contact | null {
  const gapX = a.halfWidth + b.halfWidth - Math.abs(b.x - a.x);
  if (!(gapX > 0)) return null;

  const gapY = a.halfHeight + b.halfHeight - Math.abs(b.y - a.y);
  if (!(gapY > 0)) return null;

  if (gapX <= gapY) {
    return { depth: gapX, nx: b.x < a.x ? -1 : 1, ny: 0, axis: 'x' };
  }
  return { depth: gapY, nx: 0, ny: b.y < a.y ? -1 : 1, axis: 'y' };
}

/**
 * How fast the two bodies are closing along the contact normal, px/s.
 *
 * Zero for a contact that is already separating: a car sliding out of a touch is never hit
 * by it, however the boxes happen to overlap.
 */
export function closingSpeed(contact: Contact, a: Velocity, b: Velocity): number {
  const relativeX = b.vx - a.vx;
  const relativeY = b.vy - a.vy;
  return Math.max(0, -(relativeX * contact.nx + relativeY * contact.ny));
}

/**
 * Resolve one contact between two bodies.
 *
 * Two things happen, in this order, and they are deliberately separate:
 *
 * 1. **Separation.** The overlap is split between the bodies on the axis it was measured on,
 *    plus `COLLISION.slop`, so the two boxes are guaranteed not to touch again next frame.
 *    This runs for every contact — a car may never be left inside another one.
 * 2. **Impulse.** Each body gains a velocity along the normal, in opposite directions. The
 *    kick is `minPush` plus a share of the closing speed, so a scrape still parts the cars
 *    and a fast hit throws them.
 *
 * Whether the contact is *hard* is reported, not acted on: damage is a consequence of a hit,
 * and the scene decides what a hard one costs. Returns null when the boxes do not touch.
 */
export function resolveContact(
  a: ContactBody,
  b: ContactBody,
  hardImpactSpeed: number = COLLISION.hardImpactSpeed,
): ContactResolution | null {
  const contact = contactBetween(a, b);
  if (!contact) return null;

  const approach = closingSpeed(contact, a, b);
  const vertical = contact.axis === 'y';

  // The share of the contact each body takes. A body that holds its road station cannot
  // move down-screen, so the other one takes the whole of a vertical contact.
  const shareA = vertical && a.pinnedY ? 0 : vertical && b.pinnedY ? 1 : 0.5;

  const depth = contact.depth + COLLISION.slop;
  const shiftA = depth * shareA;
  const shiftB = depth - shiftA;

  const push = Math.min(
    COLLISION.maxPush,
    COLLISION.minPush + approach * COLLISION.restitution,
  );
  // `a` is pushed away from `b`, so its share runs against the normal; `b`'s runs along it.
  const deltaA = -push * shareA;
  const deltaB = push * (1 - shareA);

  return {
    contact,
    approach,
    hard: approach >= hardImpactSpeed,
    shiftAX: -contact.nx * shiftA,
    shiftAY: -contact.ny * shiftA,
    shiftBX: contact.nx * shiftB,
    shiftBY: contact.ny * shiftB,
    deltaAX: contact.nx * deltaA,
    deltaAY: contact.ny * deltaA,
    deltaBX: contact.nx * deltaB,
    deltaBY: contact.ny * deltaB,
  };
}
