import { describe, expect, it } from 'vitest';
import { CHALLENGE_TEMPLATES } from '@/content';
import { LEVEL_TYPES, generateLevel, levelForSeed } from './index';
import { validateBlueprint } from './validate';

/**
 * The generator's contract.
 *
 * 1,000 seeds per level type. If a single one produces an unplayable road, this fails —
 * which is the only practical way to trust a procedural generator.
 */

const SEEDS_PER_TYPE = 1000;

describe('level generation', () => {
  for (const type of LEVEL_TYPES) {
    it(`produces playable ${type} levels across ${SEEDS_PER_TYPE} seeds`, () => {
      const failures: { seed: number; issues: string[] }[] = [];

      for (let i = 0; i < SEEDS_PER_TYPE; i += 1) {
        const seed = (i * 7919 + 104729) >>> 0;
        const blueprint = generateLevel({ type, seed, index: 1 + (i % 5) });
        const issues = validateBlueprint(blueprint);

        if (issues.length > 0) {
          failures.push({ seed, issues: issues.map((issue) => `${issue.code}: ${issue.message}`) });
          if (failures.length >= 5) break;
        }
      }

      expect(failures).toEqual([]);
    });
  }

  it('is deterministic for a given seed', () => {
    const a = generateLevel({ type: 'highway', seed: 12345, index: 3 });
    const b = generateLevel({ type: 'highway', seed: 12345, index: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces different levels for different seeds', () => {
    const a = generateLevel({ type: 'highway', seed: 1, index: 1 });
    const b = generateLevel({ type: 'highway', seed: 2, index: 1 });
    expect(JSON.stringify(a.events)).not.toBe(JSON.stringify(b.events));
  });

  it('never places hostile content inside the safe start', () => {
    for (let i = 0; i < 200; i += 1) {
      const blueprint = generateLevel({ type: 'city', seed: i + 1, index: 2 });
      for (const event of blueprint.events) {
        if (event.kind === 'enemy' || event.kind === 'traffic') {
          expect(event.at).toBeGreaterThanOrEqual(890);
        }
      }
    }
  });

  it('keeps every event inside its road profile', () => {
    for (const type of LEVEL_TYPES) {
      const blueprint = generateLevel({ type, seed: 999, index: 1 });
      for (const event of blueprint.events) {
        expect(event.lane).toBeGreaterThanOrEqual(0);
        expect(event.lane).toBeLessThan(blueprint.road.lanes);
      }
    }
  });

  it('cycles level types so a run does not repeat the same road', () => {
    const types = [1, 2, 3, 4, 5, 6].map((index) => levelForSeed(42, index).type);
    expect(new Set(types.slice(0, 5)).size).toBe(5);
    expect(types[5]).toBe(types[0]);
  });

  it('scales challenge count with level structure', () => {
    const blueprint = levelForSeed(7, 1);
    expect(blueprint.challenges.length).toBe(3);
    expect(blueprint.challenges.every((c) => c.to > c.from)).toBe(true);
  });

  it('emits every template kind across a run of sectors', () => {
    const seen = new Set<string>();

    for (let index = 1; index <= LEVEL_TYPES.length; index += 1) {
      for (const challenge of levelForSeed(7, index).challenges) {
        seen.add(challenge.kind);
      }
    }

    for (const template of CHALLENGE_TEMPLATES) {
      expect(seen).toContain(template.kind);
    }
  });

  it('pays the reward its challenge template declares', () => {
    for (let index = 1; index <= LEVEL_TYPES.length; index += 1) {
      for (const challenge of levelForSeed(7, index).challenges) {
        const template = CHALLENGE_TEMPLATES.find((entry) => entry.kind === challenge.kind);
        expect(challenge.reward).toBe(template?.reward);
      }
    }
  });
});
