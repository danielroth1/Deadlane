import { describe, expect, it } from 'vitest';
import { BOSS } from '@/config';
import { BOSSES, BOSS_ATTACK_PATTERN_IDS, ENEMIES, getBoss } from '@/content';
import { LEVEL_TYPES } from '@/levels/types';
import {
  BOSS_ATTACKS,
  bossAction,
  bossForLevel,
  bossHealthRatio,
  bossVolley,
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

/**
 * The pattern table itself.
 *
 * Every id the content table can name has to be implemented here, every telegraph has to
 * clear the fairness floor, and a volley has to land inside the road it was aimed at.
 */
describe('boss attack patterns', () => {
  const origin = { bossX: 320, roadLeft: 176, roadWidth: 384, playerX: 240 };

  it('implements every attack pattern id the content table declares', () => {
    for (const id of BOSS_ATTACK_PATTERN_IDS) {
      const pattern = BOSS_ATTACKS[id];
      expect(pattern, `${id} is not implemented`).toBeDefined();
      expect(pattern.shots).toBeGreaterThan(0);
      expect(pattern.recoverMs).toBeGreaterThan(0);
      expect(pattern.projectileSpeed).toBeGreaterThan(0);
      expect(pattern.cue.length).toBeGreaterThan(0);
    }
  });

  it('fields every declared pattern on at least one boss', () => {
    const bossUsed = new Set(BOSSES.flatMap((boss) => boss.attacks));
    for (const id of BOSS_ATTACK_PATTERN_IDS) {
      expect(bossUsed.has(id), `${id} is implemented but no boss fields it`).toBe(true);
    }
  });

  it('gives every attack a telegraph no shorter than the fairness floor', () => {
    for (const id of BOSS_ATTACK_PATTERN_IDS) {
      expect(
        BOSS_ATTACKS[id].telegraphMs,
        `${id} telegraphs faster than ${BOSS.minTelegraphMs} ms`,
      ).toBeGreaterThanOrEqual(BOSS.minTelegraphMs);
    }
  });

  it('lays every shell inside the drivable surface', () => {
    for (const id of BOSS_ATTACK_PATTERN_IDS) {
      const shots = bossVolley(BOSS_ATTACKS[id], origin);
      expect(shots).toHaveLength(BOSS_ATTACKS[id].shots);
      for (const shot of shots) {
        expect(shot.x, `${id} fires off the road`).toBeGreaterThanOrEqual(origin.roadLeft);
        expect(shot.x, `${id} fires off the road`).toBeLessThanOrEqual(
          origin.roadLeft + origin.roadWidth,
        );
        expect(shot.speedScale).toBeGreaterThan(0);
      }
    }
  });

  it('makes a sweep arrive in sequence and a wall travel straight down', () => {
    const sweep = bossVolley(BOSS_ATTACKS['laser-sweep'], origin);
    expect(new Set(sweep.map((shot) => shot.speedScale)).size).toBe(sweep.length);
    expect(sweep.every((shot) => !shot.aimAtPlayer)).toBe(true);

    for (const id of ['flame-wall', 'minefield', 'sonic-pulse'] as const) {
      const shots = bossVolley(BOSS_ATTACKS[id], origin);
      expect(shots.every((shot) => !shot.aimAtPlayer), `${id} should not lead the car`).toBe(true);
    }
  });

  it('leads the car with an aimed volley', () => {
    for (const id of ['turret-burst', 'rocket-fan', 'ram-charge', 'missile-barrage'] as const) {
      const shots = bossVolley(BOSS_ATTACKS[id], origin);
      expect(shots.every((shot) => shot.aimAtPlayer), `${id} should lead the car`).toBe(true);
      // Only the charge is fired faster than the row's base speed.
      const charged = shots.some((shot) => shot.speedScale !== 1);
      expect(charged, `${id} speed scale`).toBe(id === 'ram-charge');
    }
  });

  it('is pure and deterministic', () => {
    const a = bossVolley(BOSS_ATTACKS['sonic-pulse'], origin);
    const b = bossVolley(BOSS_ATTACKS['sonic-pulse'], origin);
    expect(a).toEqual(b);
  });
});
