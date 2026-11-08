import { describe, expect, it } from 'vitest';
import { BOSS } from '@/config';
import { BOSSES, ENEMIES, getBoss } from '@/content';
import { LEVEL_TYPES } from '@/levels/types';
import {
  BOSS_ATTACKS,
  bossAction,
  bossForLevel,
  bossHealthRatio,
  createBossFight,
  damageBoss,
} from './boss';

/**
 * The two rules the boss encounter is built on, tested without a scene.
 *
 * Selection decides which machine appears; the state machine decides how long it lives and
 * when its volleys land. Both are models, so both are testable here — the e2e spec only has
 * to prove the scene wires them up.
 */

describe('boss selection', () => {
  it('gives every level type a boss in every act', () => {
    for (const type of LEVEL_TYPES) {
      for (let act = 1; act <= 8; act += 1) {
        expect(() => bossForLevel(type, act), `${type} act ${act}`).not.toThrow();
      }
    }
  });

  it('closes a type with its own machine in act 1', () => {
    expect(bossForLevel('highway', 1).id).toBe('command-carrier');
    expect(bossForLevel('city', 1).id).toBe('command-carrier');
    expect(bossForLevel('river', 1).id).toBe('river-dreadnought');
    expect(bossForLevel('tunnel', 1).id).toBe('boring-machine');
  });

  it('carries a type with no dedicated machine with the wildcard', () => {
    // Canyon has no boss of its own; the gunship is declared `any`.
    expect(bossForLevel('canyon', 1).id).toBe('gunship-boss');
  });

  it('fields the act-2 variant on every other act from act 2', () => {
    // `minAct: 2` and `variantEvery: 2` on the wildcard row: it fields in acts 2, 4, 6 and
    // the level type's own machine takes the acts between, so the theme survives contact
    // with the escalation.
    expect(bossForLevel('highway', 2).id).toBe('gunship-boss');
    expect(bossForLevel('highway', 3).id).toBe('command-carrier');
    expect(bossForLevel('highway', 4).id).toBe('gunship-boss');
    expect(bossForLevel('river', 2).id).toBe('gunship-boss');
    expect(bossForLevel('river', 3).id).toBe('river-dreadnought');
    expect(bossForLevel('canyon', 2).id).toBe('gunship-boss');
    // Canyon has no machine of its own, so the wildcard carries it on the acts the variant
    // does not field.
    expect(bossForLevel('canyon', 3).id).toBe('gunship-boss');
  });

  it('is pure: same inputs, same boss', () => {
    for (const type of LEVEL_TYPES) {
      expect(bossForLevel(type, 2).id).toBe(bossForLevel(type, 2).id);
    }
  });

  it('returns a row from the content table', () => {
    for (const type of LEVEL_TYPES) {
      const boss = bossForLevel(type, 1);
      expect(BOSSES).toContain(boss);
      expect(getBoss(boss.id)).toBe(boss);
    }
  });
});

describe('boss fight state machine', () => {
  const carrier = () => getBoss('command-carrier');

  /** The attack the carrier uses at `index`, asserted present so the test needs no `!`. */
  const attackAt = (index: number) => {
    const attack = carrier().attacks[index];
    if (!attack) throw new Error(`command-carrier has no attack at ${index}`);
    return attack;
  };

  it('starts at full health and alive', () => {
    const state = createBossFight(carrier(), 0);
    expect(state.hp).toBe(carrier().hp);
    expect(state.maxHp).toBe(carrier().hp);
    expect(state.defeated).toBe(false);
    expect(bossHealthRatio(state)).toBe(1);
  });

  it('drains health and reports a defeat at zero, never below', () => {
    const state = createBossFight(carrier(), 0);

    expect(damageBoss(state, 10)).toBe('damaged');
    expect(state.hp).toBe(carrier().hp - 10);
    expect(state.defeated).toBe(false);

    expect(damageBoss(state, state.hp + 50)).toBe('defeated');
    expect(state.hp).toBe(0);
    expect(state.defeated).toBe(true);
    expect(bossHealthRatio(state)).toBe(0);
  });

  it('treats defeat as terminal, so the reward cannot be paid twice', () => {
    const state = createBossFight(carrier(), 0);
    damageBoss(state, state.hp);

    expect(damageBoss(state, 10)).toBe('defeated');
    expect(state.hp).toBe(0);
  });

  it('has more hp than any chaff enemy', () => {
    const toughest = Math.max(...ENEMIES.map((enemy) => enemy.hp));
    for (const boss of BOSSES) {
      expect(boss.hp, `${boss.id} is not tougher than chaff`).toBeGreaterThan(toughest);
    }
  });

  it('cycles telegraph, fire and recovery, alternating its two attacks', () => {
    const state = createBossFight(carrier(), 0);
    const first = attackAt(0);
    const second = attackAt(1);

    // Nothing happens before the opening delay is up.
    expect(bossAction(state, 0)).toBeNull();
    expect(bossAction(state, BOSS.openingMs)).toEqual({
      kind: 'telegraph',
      attack: first,
      pattern: BOSS_ATTACKS[first],
    });

    const firstPattern = BOSS_ATTACKS[first];
    expect(bossAction(state, BOSS.openingMs + firstPattern.telegraphMs - 1)).toBeNull();
    expect(bossAction(state, BOSS.openingMs + firstPattern.telegraphMs)).toEqual({
      kind: 'fire',
      attack: first,
      pattern: firstPattern,
    });

    // Recovery, then the second attack is telegraphed in turn.
    const afterFirst = BOSS.openingMs + firstPattern.telegraphMs;
    expect(bossAction(state, afterFirst + firstPattern.recoverMs - 1)).toBeNull();
    expect(bossAction(state, afterFirst + firstPattern.recoverMs)).toBeNull();

    const secondPattern = BOSS_ATTACKS[second];
    expect(
      bossAction(state, afterFirst + firstPattern.recoverMs + secondPattern.telegraphMs),
    ).toEqual({ kind: 'telegraph', attack: second, pattern: secondPattern });
  });

  it('stops attacking once defeated', () => {
    const state = createBossFight(carrier(), 0);
    damageBoss(state, state.hp);

    expect(bossAction(state, BOSS.openingMs + 10_000)).toBeNull();
    expect(state.defeated).toBe(true);
  });

  it('gives every boss at least two distinct telegraphed attacks', () => {
    for (const boss of BOSSES) {
      expect(boss.attacks.length, `${boss.id} needs two attacks`).toBeGreaterThanOrEqual(2);
      expect(new Set(boss.attacks).size).toBe(boss.attacks.length);
      for (const attack of boss.attacks) {
        expect(BOSS_ATTACKS[attack].telegraphMs).toBeGreaterThan(0);
        expect(BOSS_ATTACKS[attack].shots).toBeGreaterThan(0);
      }
    }
  });
});
