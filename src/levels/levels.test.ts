import { describe, expect, it } from 'vitest';
import { CHALLENGE_TEMPLATES } from '@/content';
import { DECOR, JUMP, SPAWN, WORLD } from '@/config';
import { LEVEL_TYPES, generateLevel, levelForSeed } from './index';
import {
  LEVEL_PROFILES,
  decorX,
  roadAt,
  roadProfileFor,
  roadShapeFor,
  roadWidthAt,
  type LevelBlueprint,
  type LevelEvent,
  type RoadShape,
} from './types';
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
        if (event.kind === 'decor') continue;
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

/**
 * Ramps and solid obstacles.
 *
 * A ramp is only useful if the car can reach it and the jump corridor is clear, so these
 * tests pin both directions: every generated sector fields ramps that the validator accepts,
 * and a hand-built ramp in front of a wall is rejected with the code that names the fault.
 */
describe('ramps and solid obstacles', () => {
  /** A minimal valid blueprint with `events` replacing the generated stream. */
  function blueprintWith(events: LevelEvent[]): LevelBlueprint {
    return {
      seed: 1,
      type: 'highway',
      index: 1,
      length: 6000,
      road: roadShapeFor('highway'),
      events,
      challenges: [
        { id: 'c0', kind: 'reach', from: 0, to: 3000, target: 0, label: 'REACH', reward: 100 },
      ],
      scrollMultiplier: 1,
      visibility: 1,
    };
  }

  it('places ramps on every level type that has a ramp budget', () => {
    for (const type of LEVEL_TYPES) {
      if (LEVEL_PROFILES[type].rampDensity <= 0) continue;

      const ramps = generateLevel({ type, seed: 8080, index: 1 }).events.filter(
        (event) => event.kind === 'ramp',
      );
      expect(ramps.length, `${type} fields no ramp`).toBeGreaterThan(0);
    }
  });

  it('rejects a ramp with a solid obstacle standing on the approach', () => {
    const events: LevelEvent[] = [
      { kind: 'prop', at: 2000, lane: 0, prop: 'barrier' },
      { kind: 'ramp', at: 2060, lane: 0 },
    ];

    const codes = validateBlueprint(blueprintWith(events)).map((issue) => issue.code);
    expect(codes).toContain('ramp-crowded');
  });

  it('rejects a ramp that launches into a row blocking every lane', () => {
    const lanes = LEVEL_PROFILES.highway.lanes;
    const wall: LevelEvent[] = Array.from({ length: lanes }, (_, lane) => ({
      kind: 'prop' as const,
      at: 2200,
      lane,
      prop: 'barrier',
    }));
    const events: LevelEvent[] = [{ kind: 'ramp', at: 1900, lane: 0 }, ...wall];
    events.sort((a, b) => a.at - b.at);

    const codes = validateBlueprint(blueprintWith(events)).map((issue) => issue.code);
    expect(codes).toContain('ramp-wall');
  });

  it('accepts a ramp whose jump corridor holds only passable or partial rows', () => {
    const events: LevelEvent[] = [
      { kind: 'ramp', at: 1900, lane: 1 },
      { kind: 'prop', at: 1990, lane: 2, prop: 'cone' },
      { kind: 'prop', at: 2100, lane: 1, prop: 'barrier' },
      { kind: 'prop', at: 2100, lane: 2, prop: 'barrier' },
    ];
    events.sort((a, b) => a.at - b.at);

    expect(validateBlueprint(blueprintWith(events))).toEqual([]);
  });

  it('keeps the jump window wide enough for the configured clearance', () => {
    // The validator and the generator both trust this constant; the scene's jump test pins
    // that the arc actually covers it. Cross-check the two numbers here.
    expect(JUMP.clearancePixels).toBeGreaterThan(0);
    expect(JUMP.gapAhead).toBeLessThan(JUMP.clearancePixels);
  });
});

describe('road shape', () => {
  it('opens every sector on its level type nominal width', () => {
    for (const type of LEVEL_TYPES) {
      const blueprint = generateLevel({ type, seed: 7, index: 1 });
      expect(blueprint.road.keyframes[0]?.at).toBe(0);
      expect(blueprint.road.keyframes[0]?.width).toBe(roadProfileFor(type).width);
      expect(blueprint.road.lanes).toBe(roadProfileFor(type).lanes);
    }
  });

  it('tightens and opens again inside a sector', () => {
    const blueprint = levelForSeed(424242, 1);
    const widths = blueprint.road.keyframes.map((key) => key.width);

    expect(widths.length).toBeGreaterThan(2);
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths));
    expect(blueprint.road.maxWidth).toBe(Math.max(...widths));
    expect(blueprint.road.minWidth).toBe(Math.min(...widths));
  });

  it('keeps every sampled road inside the viewport, centred, with valid lanes', () => {
    for (const type of LEVEL_TYPES) {
      const blueprint = generateLevel({ type, seed: 31337, index: 3 });

      for (let at = 0; at <= blueprint.length; at += 500) {
        const profile = roadAt(blueprint.road, at);

        expect(profile.lanes).toBe(blueprint.road.lanes);
        expect(profile.left).toBeGreaterThanOrEqual(0);
        expect(profile.left + profile.width).toBeLessThanOrEqual(WORLD.width);
        // Centred on the aperture, so the car's start position is always the road's middle.
        expect(profile.left).toBeCloseTo((WORLD.width - profile.width) / 2);
        expect(profile.laneWidth).toBeCloseTo(profile.width / profile.lanes);
      }
    }
  });

  it('interpolates width between keyframes and holds it past the ends', () => {
    const shape: RoadShape = {
      lanes: 4,
      laneWidth: 64,
      obstructableLanes: [1, 2],
      keyframes: [
        { at: 0, width: 256 },
        { at: 1000, width: 320 },
        { at: 3000, width: 288 },
      ],
      minWidth: 256,
      maxWidth: 320,
    };

    expect(roadWidthAt(shape, 0)).toBe(256);
    expect(roadWidthAt(shape, 500)).toBe(288);
    expect(roadWidthAt(shape, 1000)).toBe(320);
    expect(roadWidthAt(shape, 2000)).toBe(304);
    expect(roadWidthAt(shape, 99_999)).toBe(288);
    // Lane index 3 is valid at every sample, which is the whole reason the count is fixed.
    expect(roadAt(shape, 2000).laneWidth).toBe(76);
  });

  it('stands its decor outside the surface, clear of the safe start', () => {
    for (const type of LEVEL_TYPES) {
      const blueprint = generateLevel({ type, seed: 2024, index: 2 });
      const decor = blueprint.events.filter((event) => event.kind === 'decor');

      if (LEVEL_PROFILES[type].sceneryPool.length === 0) {
        expect(decor, `${type} has nowhere to stand scenery`).toHaveLength(0);
        continue;
      }

      expect(decor.length, `${type} places no scenery`).toBeGreaterThan(0);

      for (const event of decor) {
        if (event.kind !== 'decor') continue;

        const profile = roadAt(blueprint.road, event.at);
        const x = decorX(blueprint.road, event.at, event.side, event.offset);
        const edge = event.side === 'left' ? profile.left : profile.left + profile.width;

        expect(event.at).toBeGreaterThanOrEqual(SPAWN.safeStartPixels - 1);
        expect(event.offset).toBeGreaterThanOrEqual(DECOR.minOffset);
        // Outside the shoulder, not merely outside the paint.
        expect(Math.abs(x - edge)).toBeGreaterThanOrEqual(DECOR.minOffset);
        expect(event.side === 'left' ? x < profile.left : x > profile.left + profile.width).toBe(
          true,
        );
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(WORLD.width);
      }
    }
  });
});
