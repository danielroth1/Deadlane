import { describe, expect, it } from 'vitest';
import { MOTION } from '@/config';
import { easeTowards, speedRatio, stepSpeed } from './motion';

/** Run the controller for `seconds` in fixed `step` slices, like a fixed-rate update. */
function run(
  from: number,
  pedals: { throttle: boolean; brake: boolean },
  seconds: number,
  step = 1 / 60,
): number {
  let speed = from;
  for (let t = 0; t < seconds; t += step) speed = stepSpeed(speed, pedals, step);
  return speed;
}

const NEUTRAL = { throttle: false, brake: false };

describe('the speed controller', () => {
  it('accelerates at the configured rate instead of snapping to the ceiling', () => {
    const afterOneFrame = stepSpeed(MOTION.cruiseSpeed, { throttle: true, brake: false }, 0.1);
    expect(afterOneFrame).toBeCloseTo(MOTION.cruiseSpeed + MOTION.acceleration * 0.1, 6);
    expect(afterOneFrame).toBeLessThan(MOTION.maxSpeed);
  });

  it('never exceeds the ceiling however long the throttle is held', () => {
    expect(run(MOTION.cruiseSpeed, { throttle: true, brake: false }, 10)).toBe(MOTION.maxSpeed);
  });

  it('brakes all the way to a standstill and clamps there', () => {
    const stopped = run(MOTION.maxSpeed, { throttle: false, brake: true }, 2);
    expect(stopped).toBe(0);

    // One more frame at zero must not push the car backwards.
    expect(stepSpeed(0, { throttle: false, brake: true }, 1 / 60)).toBe(0);
  });

  it('lets the brake win over a throttle held at the same time', () => {
    const both = stepSpeed(MOTION.cruiseSpeed, { throttle: true, brake: true }, 0.1);
    expect(both).toBeLessThan(MOTION.cruiseSpeed);
  });

  it('eases back to cruise speed when nothing is held', () => {
    expect(run(MOTION.maxSpeed, NEUTRAL, 5)).toBe(MOTION.cruiseSpeed);
    // A car that braked to a halt creeps back up to cruise rather than stalling the road.
    expect(run(0, NEUTRAL, 5)).toBe(MOTION.cruiseSpeed);
  });

  it('returns to cruise by at most one drag step, never overshooting', () => {
    const justUnder = MOTION.cruiseSpeed - MOTION.coastDrag / 120;
    expect(stepSpeed(justUnder, NEUTRAL, 1 / 60)).toBe(MOTION.cruiseSpeed);
  });

  it('is deterministic for the same state, pedals and dt', () => {
    const pedals = { throttle: true, brake: false };
    expect(stepSpeed(231.7, pedals, 0.016)).toBe(stepSpeed(231.7, pedals, 0.016));
  });

  it('ignores a non-positive dt rather than dividing by it', () => {
    expect(stepSpeed(300, { throttle: true, brake: false }, 0)).toBe(300);
  });

  it('reports the car speed as a 0–1 ratio for the HUD', () => {
    expect(speedRatio(0)).toBe(0);
    expect(speedRatio(MOTION.maxSpeed)).toBe(1);
    expect(speedRatio(MOTION.maxSpeed * 2)).toBe(1);
    expect(speedRatio(MOTION.maxSpeed / 2)).toBeCloseTo(0.5, 6);
  });

  it('eases towards a target without passing it', () => {
    expect(easeTowards(0, 10, 3)).toBe(3);
    expect(easeTowards(9, 10, 3)).toBe(10);
    expect(easeTowards(10, 0, 3)).toBe(7);
    expect(easeTowards(1, 0, 3)).toBe(0);
  });
});
