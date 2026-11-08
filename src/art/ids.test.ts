import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  EFFECT_ART,
  PICKUP_ART,
  PROP_ART,
  PROP_PLACEHOLDER,
  propArtIds,
  type EffectKind,
  type PickupKind,
  type PropKind,
} from './ids';
import { PICKUP_POOL } from '@/levels/generators/shared';
import { LEVEL_PROFILES } from '@/levels/types';

/**
 * The seam between the game's sprite ids and the shipped atlas.
 *
 * `PICKUP_ART` and `EFFECT_ART` are only lookup keys into `public/assets/assets.json`.
 * Rename a sheet cell (or lose it to a `droppedCells` entry) without updating these tables
 * and the game silently draws its procedural stand-in with nothing failing. These tests
 * make the mapping part of `npm run test`.
 */

interface SpriteManifest {
  sprites: Record<string, { sheet: string; x: number; y: number; w: number; h: number }>;
}

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/assets/assets.json'), 'utf8'),
) as SpriteManifest;

const sprites = new Set(Object.keys(manifest.sprites));

/** Every prop id any level profile can place, deduplicated. */
const PROP_POOL: readonly string[] = [
  ...new Set(Object.values(LEVEL_PROFILES).flatMap((profile) => profile.propPool)),
].sort();

describe('pickup art ids', () => {
  it('covers exactly the kinds the generators place', () => {
    const mapped = Object.keys(PICKUP_ART).sort();
    expect(mapped).toEqual([...PICKUP_POOL].sort());
  });

  it('has a candidate for every generated pickup kind', () => {
    for (const kind of PICKUP_POOL) {
      expect(PICKUP_ART[kind as PickupKind], `${kind} has no art ids`).toBeDefined();
    }
  });
});

describe('effect art ids', () => {
  it('has a candidate for every effect the scene draws', () => {
    const kinds: EffectKind[] = ['explosion', 'muzzle', 'smoke', 'oil'];
    expect(Object.keys(EFFECT_ART).sort()).toEqual([...kinds].sort());
  });
});

describe('prop art ids', () => {
  it('covers exactly the ids the level prop pools place', () => {
    expect(Object.keys(PROP_ART).sort()).toEqual([...PROP_POOL]);
  });

  it('resolves every prop pool id in the shipped manifest', () => {
    const placeholder: readonly string[] = PROP_PLACEHOLDER;

    for (const id of PROP_POOL) {
      const ids: readonly string[] | undefined = PROP_ART[id as PropKind];

      if (placeholder.includes(id)) {
        expect(
          ids ?? [],
          `${id} is declared a placeholder, so it must not claim a sheet cell`,
        ).toEqual([]);
        continue;
      }

      expect(ids, `${id} has no entry in PROP_ART`).toBeDefined();
      expect(ids?.length ?? 0, `${id} has no candidate ids`).toBeGreaterThan(0);

      for (const frame of ids ?? []) {
        expect(
          sprites.has(frame),
          `prop:${id} → ${frame} is not a key of .sprites in public/assets/assets.json`,
        ).toBe(true);
      }
    }
  });

  it('keeps a declared placeholder on the procedural sprite', () => {
    for (const id of PROP_PLACEHOLDER) {
      expect(propArtIds(id), `${id} must resolve to the placeholder`).toEqual([]);
    }
  });
});

describe('art id manifest seam', () => {
  it('resolves every pickup and effect id in the shipped manifest', () => {
    const groups: [string, readonly string[]][] = [
      ...Object.entries(PICKUP_ART).map(
        ([kind, ids]): [string, readonly string[]] => [`pickup:${kind}`, ids],
      ),
      ...Object.entries(EFFECT_ART).map(
        ([kind, ids]): [string, readonly string[]] => [`effect:${kind}`, ids],
      ),
    ];

    for (const [label, ids] of groups) {
      expect(ids.length, `${label} has no candidate ids`).toBeGreaterThan(0);
      for (const id of ids) {
        expect(
          sprites.has(id),
          `${label} → ${id} is not a key of .sprites in public/assets/assets.json`,
        ).toBe(true);
      }
    }
  });

  it('names a generated frame, never a placeholder id', () => {
    const allIds = [
      ...Object.values(PICKUP_ART).flat(),
      ...Object.values(EFFECT_ART).flat(),
      ...Object.values(PROP_ART).flat(),
    ];
    for (const id of allIds) {
      expect(id.startsWith('placeholder/'), `${id} must be a manifest frame id`).toBe(false);
    }
  });
});
