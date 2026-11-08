import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EFFECT_ART, PICKUP_ART, type EffectKind, type PickupKind } from './ids';
import { PICKUP_POOL } from '@/levels/generators/shared';

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
    const allIds = [...Object.values(PICKUP_ART).flat(), ...Object.values(EFFECT_ART).flat()];
    for (const id of allIds) {
      expect(id.startsWith('placeholder/'), `${id} must be a manifest frame id`).toBe(false);
    }
  });
});
