import { describe, expect, it } from 'vitest';
import { PROP_IMPACT } from '@/config';
import { isAirborne } from './jump';
import { blocksLane, propContactOutcome } from './props';

/**
 * Prop solidity.
 *
 * The content table decides a prop's class; these tests pin what each class costs, because
 * a solid obstacle that spends nothing (or a cone that spends armour) is the bug the order
 * exists to prevent.
 */
describe('prop contacts', () => {
  it('spends armour on a solid obstacle and slows the car', () => {
    const outcome = propContactOutcome('solid', false);

    expect(outcome.contact).toBe(true);
    expect(outcome.damage).toBe(true);
    expect(outcome.speedFactor).toBe(PROP_IMPACT.solidSpeedFactor);
    expect(outcome.shove).toBe(true);
  });

  it('knocks a soft prop aside without spending armour or speed', () => {
    const outcome = propContactOutcome('soft', false);

    expect(outcome.contact).toBe(true);
    expect(outcome.damage).toBe(false);
    expect(outcome.speedFactor).toBe(1);
    expect(outcome.shove).toBe(true);
  });

  it('slows the car in a hazard without spending armour', () => {
    const outcome = propContactOutcome('hazard', false);

    expect(outcome.contact).toBe(true);
    expect(outcome.damage).toBe(false);
    expect(outcome.speedFactor).toBe(PROP_IMPACT.hazardSpeedFactor);
    expect(outcome.shove).toBe(false);
  });

  it('ignores every class while airborne', () => {
    for (const collision of ['solid', 'soft', 'hazard'] as const) {
      const outcome = propContactOutcome(collision, true);
      expect(outcome.contact, `${collision} still touched an airborne car`).toBe(false);
      expect(outcome.damage).toBe(false);
      expect(outcome.shove).toBe(false);
    }
  });

  it('treats only solid props as a blocked lane', () => {
    expect(blocksLane('solid')).toBe(true);
    expect(blocksLane('soft')).toBe(false);
    expect(blocksLane('hazard')).toBe(false);
  });

  it('uses the same airborne rule the jump module reports', () => {
    const jumpAirborne = isAirborne({ elapsedMs: 100, durationMs: 400 });
    expect(propContactOutcome('solid', jumpAirborne).contact).toBe(false);
  });
});
