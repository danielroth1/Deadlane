import { describe, expect, it } from 'vitest';
import { JUMP, MOTION } from '@/config';
import {
  advanceJump,
  createJump,
  isAirborne,
  jumpHeight,
  resolvesGroundContact,
} from './jump';

/**
 * The jump arc and its clearance window.
 *
 * The order asks for "jump clearance" to be unit-tested: the two facts gameplay relies on
 * are that the car is airborne for exactly the configured duration and that the window is
 * long enough to carry it past a blocking row at top speed.
 */
describe('jump arc', () => {
  it('starts airborne, at height zero and takes off immediately', () => {
    const jump = createJump(JUMP.durationMs);

    expect(isAirborne(jump)).toBe(true);
    expect(jumpHeight(jump, JUMP.apexHeight)).toBe(0);
  });

  it('peaks at the apex halfway through', () => {
    const jump = advanceJump(createJump(JUMP.durationMs), JUMP.durationMs / 2).state;

    expect(jumpHeight(jump, JUMP.apexHeight)).toBeCloseTo(JUMP.apexHeight);
  });

  it('is back on the ground at the end, and reports the landing once', () => {
    const half = advanceJump(createJump(JUMP.durationMs), JUMP.durationMs / 2);
    const end = advanceJump(half.state, JUMP.durationMs / 2);

    expect(end.landed).toBe(true);
    expect(isAirborne(end.state)).toBe(false);
    expect(jumpHeight(end.state, JUMP.apexHeight)).toBe(0);
    // The frame after landing must not fire a second landing event.
    expect(advanceJump(end.state, 16).landed).toBe(false);
  });

  it('never reports a landing before the arc is over', () => {
    let state = createJump(JUMP.durationMs);
    for (let elapsed = 0; elapsed < JUMP.durationMs - 16; elapsed += 16) {
      const step = advanceJump(state, 16);
      expect(step.landed).toBe(false);
      state = step.state;
    }
    expect(isAirborne(state)).toBe(true);
  });

  it('never returns a negative height, whatever the step', () => {
    let state = createJump(JUMP.durationMs);
    for (let i = 0; i < 200; i += 1) {
      state = advanceJump(state, 7).state;
      expect(jumpHeight(state, JUMP.apexHeight)).toBeGreaterThanOrEqual(0);
    }
  });

  it('stays airborne long enough to cross JUMP.clearancePixels at top speed', () => {
    // Distance covered while off the ground, world px, at the fastest the car can drive.
    const airborneDistance = (JUMP.durationMs / 1000) * MOTION.maxSpeed;

    expect(airborneDistance).toBeGreaterThanOrEqual(JUMP.clearancePixels);
  });

  it('skips ground contact only while airborne', () => {
    expect(resolvesGroundContact(true)).toBe(false);
    expect(resolvesGroundContact(false)).toBe(true);
  });
});
