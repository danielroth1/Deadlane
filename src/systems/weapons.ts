import { PLAYER } from '@/config';

/**
 * Weapon geometry.
 *
 * The world is one number: `at`. The player sits at the run's `distance`, and a point with
 * world position `at` is drawn at `PLAYER.y + distance - at`, so anything ahead of the car
 * has a larger `at` and a smaller screen `y`. Every shell and every dropped hazard goes
 * through this projection; keeping it in one place is what makes the aiming maths testable
 * without Phaser.
 */

/** Anything with a screen position. A Phaser sprite satisfies this structurally. */
export interface Body {
  readonly x: number;
  readonly y: number;
}

export interface Shot {
  /** World position the projectile starts at. */
  readonly at: number;
  /** Change in `at` per second. Negative travels toward the player. */
  readonly speed: number;
  /** Screen-space horizontal drift, px/s, used to lead the player's lane. */
  readonly driftX: number;
}

/** Screen Y of a point at world distance `at`. */
export function screenYFromWorldAt(at: number, distance: number, playerY = PLAYER.y): number {
  return playerY + distance - at;
}

/** World distance of a point drawn at screen Y. Inverse of `screenYFromWorldAt`. */
export function worldAtFromScreenY(screenY: number, distance: number, playerY = PLAYER.y): number {
  return playerY + distance - screenY;
}

/** A player shell leaves the muzzle and keeps travelling away from the car. */
export function forwardShot(
  muzzleY: number,
  distance: number,
  projectileSpeed: number,
  playerY = PLAYER.y,
): Shot {
  return { at: worldAtFromScreenY(muzzleY, distance, playerY), speed: projectileSpeed, driftX: 0 };
}

export interface ReturnShotInput {
  readonly enemyX: number;
  readonly enemyY: number;
  readonly playerX: number;
  readonly playerY: number;
  readonly distance: number;
  /** Current road scroll, px/s. The shell closes on the car with it, not against it. */
  readonly scroll: number;
  readonly projectileSpeed: number;
  /** Ceiling on the lateral lead, px/s. A point-blank shell must not snap sideways. */
  readonly maxDrift?: number;
}

/**
 * A hostile shell leaves the muzzle at the hostile's own world position — never at a point
 * reflected around the player — and drifts sideways so it arrives in the player's lane
 * rather than the lane it was fired from.
 *
 * The shell closes on the car at its own speed *plus* the road's scroll, so that combined
 * rate is what decides how much lateral lead it needs.
 */
export function returnShot(input: ReturnShotInput): Shot {
  const { enemyX, enemyY, playerX, playerY, distance, scroll, projectileSpeed } = input;
  const at = worldAtFromScreenY(enemyY, distance, playerY);
  const gap = playerY - enemyY;
  const closing = projectileSpeed + scroll;

  if (gap <= 0 || closing <= 0) return { at, speed: -projectileSpeed, driftX: 0 };

  const timeToImpact = gap / closing;
  const drift = (playerX - enemyX) / timeToImpact;
  const limit = input.maxDrift ?? Number.POSITIVE_INFINITY;

  return {
    at,
    speed: -projectileSpeed,
    driftX: Math.max(-limit, Math.min(limit, drift)),
  };
}

/** Does a vehicle at `other` sit inside the slick at `slick`? */
export function oilCatches(
  slick: Body,
  other: Body,
  halfWidth: number,
  halfHeight: number,
): boolean {
  return Math.abs(other.x - slick.x) < halfWidth && Math.abs(other.y - slick.y) < halfHeight;
}

/**
 * Does a smoke cloud at `cloudAt` hide the player from a hostile at `hostileAt`?
 *
 * Only a cloud ahead of the car can sit between the two, and only a hostile beyond the
 * cloud's near edge is blinded — a cloud already behind the car protects nobody. `cover`
 * is the cloud's half-length up the road.
 */
export function smokeBlocksFire(
  cloudAt: number,
  hostileAt: number,
  playerAt: number,
  cover: number,
): boolean {
  if (hostileAt <= playerAt) return false;
  return cloudAt > playerAt && hostileAt >= cloudAt - cover;
}
