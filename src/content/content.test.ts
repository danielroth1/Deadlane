import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BEHAVIORS,
  BOSSES,
  BOSS_ATTACK_PATTERN_IDS,
  BOSS_KINDS,
  CHALLENGE_TEMPLATES,
  CIVILIANS,
  ENEMIES,
  getWeapon,
  WEAPONS,
} from './index';
import { PALETTE } from '@/palette';
import { LEVEL_TYPES } from '@/levels/types';

/**
 * Content schema.
 *
 * Hand-written rather than Ajv: shipping a validator into the browser bundle would cost
 * bytes to catch problems CI catches for free. These run at test time only.
 */

const PALETTE_KEYS = new Set(Object.keys(PALETTE));

interface SpriteManifest {
  sprites: Record<string, { sheet: string; x: number; y: number; w: number; h: number }>;
  sheets: Record<string, { frames: Record<string, { x: number; y: number; w: number; h: number }> }>;
}

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

/**
 * The seam between content data and the shipped atlas.
 *
 * `EnemyDef.art` is only a lookup key into `public/assets/assets.json` → `.sprites`. Rename
 * a sheet cell without updating the content table (or vice versa) and the enemy silently
 * falls back to its procedural placeholder with nothing failing. These tests make the
 * WO-28 invariant part of `npm run test`.
 */
describe('enemy art ids', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/assets/assets.json'), 'utf8'),
  ) as SpriteManifest;

  const sprites = new Set(Object.keys(manifest.sprites));

  /** Enemies with a declared art id, narrowed to `{ id, art: string }` without assertions. */
  const declared = ENEMIES.flatMap((enemy) => {
    const art = enemy.art;
    return art === undefined ? [] : [{ id: enemy.id, art }];
  });

  it('resolves every declared art id in the shipped manifest', () => {
    expect(declared.length).toBeGreaterThan(0);
    for (const { id, art } of declared) {
      expect(
        sprites.has(art),
        `${id}.art=${art} is not a key of .sprites in public/assets/assets.json`,
      ).toBe(true);
    }
  });

  it('declares art for every enemy, and only shipped frames', () => {
    const ids = declared.map(({ id }) => id).sort();
    expect(ids).toHaveLength(ENEMIES.length);
    expect(ids).toEqual([
      'dredger',
      'drone',
      'enforcer',
      'gunboat',
      'hauler',
      'helicopter',
      'jetski',
      'roadlord',
      'speedboat',
      'switchblade',
      'turret',
    ]);
  });

  /**
   * `art-03` cell 0 (enforcer motorcycle, drawn nose-down) and `art-06` cell 1 (speedboat
   * hostile, drawn three-quarter) are declared `droppedCells` in `pipeline/registry/slots.ts`.
   * They are the only two frames whose absence from the manifest is intentional, so nothing
   * in the content table may resolve to them.
   */
  it('never ships the two cells the registry declares dropped', () => {
    expect(sprites.has('enemy-ground-a/enforcer-motorcycle')).toBe(false);
    expect(sprites.has('enemy-sea/speedboat-hostile')).toBe(false);

    // Both slots are 2x2 with one dropped cell, so three frames of four reach the atlas.
    expect(Object.keys(manifest.sheets['art-03-enemy-ground-a']?.frames ?? {})).toHaveLength(3);
    expect(Object.keys(manifest.sheets['art-06-enemy-sea']?.frames ?? {})).toHaveLength(3);
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

/**
 * The seam between civilian content data and the shipped atlas.
 *
 * Same invariant as `enemy art ids` above: `CivilianDef.art` is only a lookup key into
 * `public/assets/assets.json` → `.sprites`. A declared id that no longer resolves fails
 * here, and so does an undeclared one, because the placeholder set is pinned by id — a
 * civilian cannot quietly slide onto procedural art.
 */
describe('civilian art ids', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/assets/assets.json'), 'utf8'),
  ) as SpriteManifest;

  const sprites = new Set(Object.keys(manifest.sprites));

  /** Civilians with a declared art id, narrowed to `{ id, art: string }` without assertions. */
  const declared = CIVILIANS.flatMap((civilian) => {
    const art = civilian.art;
    return art === undefined ? [] : [{ id: civilian.id, art }];
  });

  it('resolves every declared art id in the shipped manifest', () => {
    expect(declared.length).toBeGreaterThan(0);
    for (const { id, art } of declared) {
      expect(
        sprites.has(art),
        `${id}.art=${art} is not a key of .sprites in public/assets/assets.json`,
      ).toBe(true);
    }
  });

  /**
   * Every civilian has to be placed deliberately: either against a frame that actually
   * ships, or against a placeholder that is listed here by id. Adding a civilian, or
   * letting one lose its `art` id by accident, fails this test instead of silently
   * degrading to procedural art.
   */
  const PLACEHOLDER_CIVILIANS = [
    'barge',
    'boat',
    'box-truck',
    'coupe',
    'hatchback',
    'skiff',
    'van',
    'wagon',
  ];

  it('draws the placeholder for exactly the civilians attempt 1 could not supply', () => {
    const placeholders = CIVILIANS.flatMap((civilian) =>
      civilian.art === undefined ? [civilian.id] : [],
    ).sort();

    expect(placeholders).toEqual(PLACEHOLDER_CIVILIANS);
  });

  /**
   * `pipeline/registry/slots.ts` records ten attempt-1 rejects for `art-08-civilians` as
   * `droppedCellsByAttempt`, not as permanent `droppedCells`: the attempt fused three
   * vehicles into a cross in cells 1, 2 and 5, drew cells 3 and 6 side-on, put a sedan in
   * the `skiff` cell, a motorboat in the sports-car cell, and ringed the three watercraft
   * cells with model-drawn water. Only six cells passed the gate, so only six frames may
   * reach the atlas. A retry draws a fresh 4 × 4 sheet and is judged on its own cells.
   */
  it('ships only the six cells that passed the art-08 gate', () => {
    const frames = Object.keys(manifest.sheets['art-08-civilians']?.frames ?? {}).sort();
    expect(frames).toEqual([
      'civilians/city-bus',
      'civilians/limousine',
      'civilians/pickup-truck',
      'civilians/sedan',
      'civilians/small-lorry',
      'civilians/taxi',
    ]);
  });

  it('claims every shipped cell and nothing else', () => {
    const frames = Object.keys(manifest.sheets['art-08-civilians']?.frames ?? {}).sort();
    const arts = declared.map(({ art }) => art).sort();

    expect(arts).toEqual(frames);
  });

  it('uses a distinct cell for every civilian', () => {
    const arts = declared.map(({ art }) => art);
    expect(new Set(arts).size).toBe(arts.length);
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

  it('gives the rear weapons a lifetime, because the scene reads it', () => {
    for (const weapon of WEAPONS) {
      if (weapon.slot !== 'rear') continue;
      expect(weapon.duration ?? 0, `${weapon.id} needs duration`).toBeGreaterThan(0);
    }
  });

  it('gives the gun a shell speed', () => {
    expect(getWeapon('gun').projectileSpeed ?? 0).toBeGreaterThan(0);
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

/**
 * The boss table is content like every other: one row per machine, and a new variant must
 * not need a class. These are the rules the encounter code may rely on.
 */
describe('boss content', () => {
  it('has unique ids and all four boss machines', () => {
    const ids = BOSSES.map((boss) => boss.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(BOSSES.map((boss) => boss.kind))).toEqual(new Set(BOSS_KINDS));
  });

  it('names real level types, or the wildcard', () => {
    for (const boss of BOSSES) {
      expect(boss.levelTypes.length, `${boss.id} names no level type`).toBeGreaterThan(0);
      for (const type of boss.levelTypes) {
        expect(type === 'any' || LEVEL_TYPES.includes(type), `${boss.id}.levelTypes`).toBe(true);
      }
    }
  });

  it('has a wildcard row, so a level type without its own machine still gets a boss', () => {
    expect(BOSSES.some((boss) => boss.levelTypes.includes('any'))).toBe(true);
  });

  it('is bigger and tougher than any chaff enemy', () => {
    const toughestHp = Math.max(...ENEMIES.map((enemy) => enemy.hp));
    const biggestSize = Math.max(...ENEMIES.map((enemy) => enemy.size));

    for (const boss of BOSSES) {
      expect(boss.hp, `${boss.id}.hp`).toBeGreaterThan(toughestHp);
      expect(boss.size, `${boss.id}.size`).toBeGreaterThan(biggestSize);
      expect(boss.speed).toBeGreaterThan(0);
      expect(boss.minAct).toBeGreaterThanOrEqual(1);
      expect(boss.reward).toBeGreaterThan(0);
      if (boss.variantEvery !== undefined) {
        expect(Number.isInteger(boss.variantEvery)).toBe(true);
        expect(boss.variantEvery).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('names implemented attack patterns, at least two distinct per boss', () => {
    for (const boss of BOSSES) {
      expect(boss.attacks.length, `${boss.id} needs two attacks`).toBeGreaterThanOrEqual(2);
      expect(new Set(boss.attacks).size, `${boss.id} repeats an attack`).toBe(boss.attacks.length);
      for (const attack of boss.attacks) {
        expect(BOSS_ATTACK_PATTERN_IDS, `${boss.id}.attacks`).toContain(attack);
      }
    }
  });

  it('uses palette colours', () => {
    for (const boss of BOSSES) {
      expect(PALETTE_KEYS.has(boss.color), `${boss.id}.color=${boss.color}`).toBe(true);
      expect(PALETTE_KEYS.has(boss.accent), `${boss.id}.accent=${boss.accent}`).toBe(true);
    }
  });

  /**
   * Same seam as the enemy and civilian art tests: a declared id must resolve in the
   * shipped manifest. Bosses declare none until art-07-boss (WO-49) lands, and the entity
   * falls back to `boss/<id>` plus the procedural placeholder until then.
   */
  it('resolves every declared boss art id in the shipped manifest', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(process.cwd(), 'public/assets/assets.json'), 'utf8'),
    ) as SpriteManifest;
    const sprites = new Set(Object.keys(manifest.sprites));

    for (const boss of BOSSES) {
      if (boss.art === undefined) continue;
      expect(
        sprites.has(boss.art),
        `${boss.id}.art=${boss.art} is not a key of .sprites in public/assets/assets.json`,
      ).toBe(true);
    }
  });
});
