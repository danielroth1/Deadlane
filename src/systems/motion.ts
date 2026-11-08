import { MOTION } from '@/config';

/**
 * The car's speed controller.
 *
 * Kept out of the scene and free of Phaser for the same reason the level generators are:
 * "what speed is the car doing after this frame" is the one number the whole run hangs off,
 * and it has to be testable without booting a scene. Speed is measured in world px/s.
 */

/** Which pedals the run has down this frame. */
export interface Pedals {
  readonly throttle: boolean;
  readonly brake: boolean;
}

/** A value held inside `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Move `value` toward `target` by at most `step`, without overshooting it. */
export function easeTowards(value: number, target: number, step: number): number {
  if (value < target) return Math.min(target, value + step);
  return Math.max(target, value - step);
}

/**
 * Advance the car's forward speed by one frame.
 *
 * Three rules, in priority order:
 *
 * 1. **Brake** decelerates at `brakeDeceleration` and stops at zero — the car can come to a
 *    complete halt in the middle of the road, which is what makes the brake a decision.
 * 2. **Throttle** accelerates at `acceleration` up to `maxSpeed`.
 * 3. **Neither** eases back to `cruise` at `coastDrag`. The target is cruise, not zero: the
 *    road is a living place that keeps moving when the player lets go, so a run never stalls
 *    because a key was released. `cruise` is a parameter because the sector's difficulty ramp
 *    raises it; it defaults to the base cruise speed.
 *
 * Pure. Same `speed`, same pedals, same `dt` gives the same result every time, which is what
 * keeps a seeded run reproducible frame for frame.
 */
export function stepSpeed(
  speed: number,
  pedals: Pedals,
  dt: number,
  cruise: number = MOTION.cruiseSpeed,
): number {
  if (!(dt > 0)) return clamp(speed, 0, MOTION.maxSpeed);

  if (pedals.brake) {
    return clamp(speed - MOTION.brakeDeceleration * dt, 0, MOTION.maxSpeed);
  }
  if (pedals.throttle) {
    return clamp(speed + MOTION.acceleration * dt, 0, MOTION.maxSpeed);
  }
  return easeTowards(speed, cruise, MOTION.coastDrag * dt);
}

/** 0–1 readout of the car's own speed, for the HUD bar and the engine note. */
export function speedRatio(speed: number): number {
  return clamp(speed / MOTION.maxSpeed, 0, 1);
}
