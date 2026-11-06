import { describe, expect, it } from 'vitest';
import { BEHAVIORS, CHALLENGE_TEMPLATES, CIVILIANS, ENEMIES, WEAPONS } from './index';
import { PALETTE } from '@/palette';

/**
 * Content schema.
 *
 * Hand-written rather than Ajv: shipping a validator into the browser bundle would cost
 * bytes to catch problems CI catches for free. These run at test time only.
 */

const PALETTE_KEYS = new Set(Object.keys(PALETTE));

describe('enemy content', () => {
  it('has unique ids', () => {
    const ids = ENEMIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('uses only registered behaviours', () => {
    for (const enemy of ENEMIES) {
      expect(BEHAVIORS).toContain(enemy.behavior);
    }
  });

  it('uses palette colours', () => {
    for (const enemy of ENEMIES) {
      expect(PALETTE_KEYS.has(enemy.color), `${enemy.id}.color=${enemy.color}`).toBe(true);
      expect(PALETTE_KEYS.has(enemy.accent), `${enemy.id}.accent=${enemy.accent}`).toBe(true);
    }
  });

  it('has sane numeric ranges', () => {
    for (const enemy of ENEMIES) {
      expect(enemy.hp).toBeGreaterThan(0);
      expect(enemy.speed).toBeGreaterThan(0);
      expect(enemy.score).toBeGreaterThan(0);
      expect(enemy.size).toBeGreaterThanOrEqual(32);
      expect(enemy.size).toBeLessThanOrEqual(128);
      expect(enemy.speed).toBeLessThan(2);
    }
  });

  it('gives every tiling behaviour its parameters', () => {
    for (const enemy of ENEMIES) {
      if (enemy.behavior === 'weave') {
        expect(enemy.weaveAmplitude, `${enemy.id} needs weaveAmplitude`).toBeDefined();
        expect(enemy.weavePeriod, `${enemy.id} needs weavePeriod`).toBeDefined();
      }
      if (enemy.behavior === 'turret') {
        expect(enemy.fireRate, `${enemy.id} needs fireRate`).toBeDefined();
      }
    }
  });
});

describe('civilian content', () => {
  it('has unique ids and positive weights', () => {
    const ids = CIVILIANS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const civilian of CIVILIANS) {
      expect(civilian.weight).toBeGreaterThan(0);
      expect(civilian.speed).toBeGreaterThan(0);
      expect(civilian.speed).toBeLessThan(0.6);
    }
  });
});

describe('weapon content', () => {
  it('covers the three player verbs', () => {
    expect(WEAPONS.map((w) => w.id).sort()).toEqual(['gun', 'oil', 'smoke']);
  });

  it('has positive cooldowns', () => {
    for (const weapon of WEAPONS) {
      expect(weapon.cooldown).toBeGreaterThan(0);
    }
  });
});

describe('challenge content', () => {
  it('has a template for every challenge kind the generator emits', () => {
    const kinds = CHALLENGE_TEMPLATES.map((c) => c.kind);
    for (const kind of ['reach', 'destroy', 'clean', 'collect', 'survive'] as const) {
      expect(kinds).toContain(kind);
    }
  });

  it('rewards completion', () => {
    for (const template of CHALLENGE_TEMPLATES) {
      expect(template.reward).toBeGreaterThan(0);
    }
  });
});
