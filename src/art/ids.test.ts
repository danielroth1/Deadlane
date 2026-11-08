import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CANYON_TILE_ART,
  CITY_TILE_ART,
  EFFECT_ART,
  HIGHWAY_TILE_ART,
  PICKUP_ART,
  PROP_ART,
  PROP_PLACEHOLDER,
  TUNNEL_TILE_ART,
  WATER_TILE_ART,
  propArtIds,
  type EffectKind,
  type PickupKind,
  type PropKind,
  type TileArtByKind,
  type TileKind,
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

describe('highway tile art ids', () => {
  it('resolves every role in the shipped manifest', () => {
    for (const [kind, ids] of Object.entries(HIGHWAY_TILE_ART)) {
      expect(ids.length, `${kind} has no candidate ids`).toBeGreaterThan(0);
      for (const id of ids) {
        expect(
          sprites.has(id),
          `tile:${kind} → ${id} is not a key of .sprites in public/assets/assets.json`,
        ).toBe(true);
      }
    }
  });

  it('points each role at the cell that actually holds its surface', () => {
    // Row-major cell index on art-13's 4 × 4 / 32 px sheet. The labels drifted:
    // `oil-stain-overlay` is the clean lane strip (11), not an oil stain.
    const cellIndex: Record<TileKind, number> = {
      surface: 0,
      shoulder: 5,
      terrain: 7,
      dash: 11,
    };

    for (const [kind, index] of Object.entries(cellIndex) as [TileKind, number][]) {
      const id = HIGHWAY_TILE_ART[kind][0];
      expect(id, `${kind} has no primary frame`).toBeDefined();
      const rect = manifest.sprites[id ?? ''];
      expect(rect, `${kind} → ${id} is missing from the manifest`).toBeDefined();
      expect({ x: rect?.x, y: rect?.y }).toEqual({
        x: (index % 4) * 32,
        y: Math.floor(index / 4) * 32,
      });
    }
  });
});

describe('canyon, water, city and tunnel tile art ids', () => {
  const sheets: readonly [string, TileArtByKind, Record<TileKind, number>][] = [
    [
      'art-14-tiles-canyon',
      CANYON_TILE_ART,
      { surface: 0, dash: 0, shoulder: 6, terrain: 1 },
    ],
    [
      'art-15-tiles-water',
      WATER_TILE_ART,
      // The surface is the current streak (10), not open water (0): see WATER_TILE_ART.
      { surface: 10, dash: 2, shoulder: 12, terrain: 9 },
    ],
    [
      'art-16-tiles-city',
      CITY_TILE_ART,
      // The street strip (0) carries both the surface and the lane dash; the kerb is the
      // alley concrete (8) and the only seamless surface is the plaza tile (12).
      { surface: 0, dash: 0, shoulder: 8, terrain: 12 },
    ],
    [
      'art-17-tiles-tunnel',
      TUNNEL_TILE_ART,
      // One asphalt cell (0) carries surface, dash and both painted edges; outside the
      // road is the concrete wall (2).
      { surface: 0, dash: 0, shoulder: 0, terrain: 2 },
    ],
  ];

  for (const [label, art, cellIndex] of sheets) {
    it(`resolves every ${label} role in the shipped manifest`, () => {
      for (const [kind, ids] of Object.entries(art)) {
        expect(ids.length, `${label}:${kind} has no candidate ids`).toBeGreaterThan(0);
        for (const id of ids) {
          expect(sprites.has(id), `${label}:${kind} → ${id} is not a manifest frame`).toBe(
            true,
          );
          expect(id.startsWith('placeholder/'), `${id} must be a manifest frame id`).toBe(false);
        }
      }
    });

    it(`points each ${label} role at the cell that holds it`, () => {
      for (const [kind, index] of Object.entries(cellIndex) as [TileKind, number][]) {
        const id = art[kind][0];
        expect(id, `${label}:${kind} has no primary frame`).toBeDefined();
        expect(manifest.sprites[id ?? '']?.sheet, `${kind} → ${id}`).toBe(label);
        const rect = manifest.sprites[id ?? ''];
        expect({ x: rect?.x, y: rect?.y }).toEqual({
          x: (index % 4) * 32,
          y: Math.floor(index / 4) * 32,
        });
      }
    });
  }

  it('never names an asphalt frame for the water channel', () => {
    for (const ids of Object.values(WATER_TILE_ART)) {
      for (const id of ids) {
        expect(id.startsWith('tiles-water/'), `${id} is not a water frame`).toBe(true);
      }
    }
  });
});

describe('art id manifest seam', () => {
  it('resolves every pickup, effect and tile id in the shipped manifest', () => {
    const groups: [string, readonly string[]][] = [
      ...Object.entries(PICKUP_ART).map(
        ([kind, ids]): [string, readonly string[]] => [`pickup:${kind}`, ids],
      ),
      ...Object.entries(EFFECT_ART).map(
        ([kind, ids]): [string, readonly string[]] => [`effect:${kind}`, ids],
      ),
      ...Object.entries(HIGHWAY_TILE_ART).map(
        ([kind, ids]): [string, readonly string[]] => [`tile:highway:${kind}`, ids],
      ),
      ...Object.entries(CANYON_TILE_ART).map(
        ([kind, ids]): [string, readonly string[]] => [`tile:canyon:${kind}`, ids],
      ),
      ...Object.entries(WATER_TILE_ART).map(
        ([kind, ids]): [string, readonly string[]] => [`tile:water:${kind}`, ids],
      ),
      ...Object.entries(CITY_TILE_ART).map(
        ([kind, ids]): [string, readonly string[]] => [`tile:city:${kind}`, ids],
      ),
      ...Object.entries(TUNNEL_TILE_ART).map(
        ([kind, ids]): [string, readonly string[]] => [`tile:tunnel:${kind}`, ids],
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
      ...Object.values(HIGHWAY_TILE_ART).flat(),
      ...Object.values(CANYON_TILE_ART).flat(),
      ...Object.values(WATER_TILE_ART).flat(),
      ...Object.values(CITY_TILE_ART).flat(),
      ...Object.values(TUNNEL_TILE_ART).flat(),
    ];
    for (const id of allIds) {
      expect(id.startsWith('placeholder/'), `${id} must be a manifest frame id`).toBe(false);
    }
  });
});
