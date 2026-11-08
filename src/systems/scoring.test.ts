import { describe, expect, it } from 'vitest';
import { SCORE } from '@/config';
import { scoreDelta } from './scoring';

/**
 * The four ways score moves in a run, pinned to `config.ts`.
 *
 * The rules used to live inline in `GameScene`, where an armour hit silently cost score
 * and shooting a civilian did nothing at all. These tests make the intended table the
 * source of truth.
 */

describe('scoreDelta', () => {
  it('pays the configured reward for an enemy kill', () => {
    expect(scoreDelta('enemyDestroyed')).toBe(SCORE.enemyDestroyed);
    expect(scoreDelta('enemyDestroyed')).toBeGreaterThan(0);
  });

  it('charges the configured penalty for a civilian destroyed by the player', () => {
    expect(scoreDelta('civilianDestroyed')).toBe(SCORE.civilianDestroyed);
    expect(scoreDelta('civilianDestroyed')).toBeLessThan(0);
  });

  it('charges the configured penalty for clipping a civilian', () => {
    expect(scoreDelta('civilianContact')).toBe(SCORE.civilianHit);
    expect(scoreDelta('civilianContact')).toBeLessThan(0);
  });

  it('leaves score untouched when armour absorbs a hit', () => {
    expect(scoreDelta('armourHit')).toBe(0);
  });
});
