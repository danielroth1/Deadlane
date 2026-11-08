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
  SCENERY_ART,
  TRANSITION_PLACEHOLDER,
  TRANSITION_TILE_ART,
  TUNNEL_TILE_ART,
  WATER_TILE_ART,
  pickSceneryVariant,
  propArtIds,
  sceneryArtIds,
  type EffectKind,
  type PickupKind,
  type PropKind,
  type ScenerySurface,
  type TileArtByKind,
  type TileKind,
  type TransitionKind,
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

describe('transition tile art ids', () => {
  it('resolves every id it names in the shipped manifest', () => {
    for (const [kind, ids] of Object.entries(TRANSITION_TILE_ART)) {
      for (const id of ids) {
        expect(
          sprites.has(id),
          `transition:${kind} → ${id} is not a key of .sprites in public/assets/assets.json`,
        ).toBe(true);
      }
    }
  });

  it('uses only the two cells that are clean, whole and on subject', () => {
    const used = Object.entries(TRANSITION_TILE_ART).flatMap(([kind, ids]) =>
      ids.map((id) => ({ kind, id })),
    );

    expect(used).toEqual([
      // Cell 4 — the only clean blend. Labelled `grass to rock`; it actually holds the
      // grass/road/grass strip whose two edges the highway shoulder draws.
      { kind: 'shoulder-grass', id: 'tiles-transition/grass-to-rock' },
      // Cell 5 — the chevron shoulder, the one cell whose label matches its subject.
      { kind: 'chevron', id: 'tiles-transition/chevron-shoulder' },
    ]);
  });

  it('points each used role at its row-major cell on the art-18 sheet', () => {
    const cellOf = (id: string): { readonly col: number; readonly row: number } => {
      const rect = manifest.sprites[id];
      expect(rect, `${id} is missing from the manifest`).toBeDefined();
      expect(rect?.sheet, `${id} is not on the art-18 sheet`).toBe(
        'art-18-tiles-transition',
      );
      return { col: (rect?.x ?? 0) / 32, row: (rect?.y ?? 0) / 32 };
    };

    const blend = TRANSITION_TILE_ART['shoulder-grass'][0];
    const chevron = TRANSITION_TILE_ART.chevron[0];
    expect(cellOf(blend ?? '')).toEqual({ col: 0, row: 1 });
    expect(cellOf(chevron ?? '')).toEqual({ col: 1, row: 1 });
  });

  it('leaves every vehicle-bearing, scene-only and fragment cell on the fallback', () => {
    const rejected: readonly TransitionKind[] = [
      'asphalt-sand',
      'asphalt-water',
      'asphalt-concrete',
      'grass-rock',
      'faded-paint',
      'rain',
      'snow',
      'fog',
      'scanline',
      'vignette',
      'dirt',
      'crack',
      'blend-mask',
    ];

    for (const kind of rejected) {
      expect(TRANSITION_TILE_ART[kind], `${kind} must stay on the drawn fallback`).toEqual(
        [],
      );
      expect(
        TRANSITION_PLACEHOLDER,
        `${kind} is drawn by fallback but not declared as a placeholder`,
      ).toContain(kind);
    }

    // The complement: every non-placeholder role actually has art, so the two lists can
    // never both claim a role or both ignore it.
    const backed = (Object.keys(TRANSITION_TILE_ART) as TransitionKind[]).filter(
      (kind) => !TRANSITION_PLACEHOLDER.includes(kind),
    );
    expect(backed.sort()).toEqual(['chevron', 'shoulder-grass']);
  });

  it('never references a rejected frame id anywhere', () => {
    // Cells 0–3 and 11–14 carry vehicles; 6–10 and 15 are scenes or fragments. Their ids
    // are still in the atlas, but nothing may ask the game to draw them.
    const rejectedIds = [
      'tiles-transition/asphalt-to-sand',
      'tiles-transition/asphalt-to-water',
      'tiles-transition/asphalt-to-concrete',
      'tiles-transition/shoulder-to-grass',
      'tiles-transition/rain-overlay',
      'tiles-transition/faded-paint-overlay',
      'tiles-transition/snow-overlay',
      'tiles-transition/fog-overlay',
      'tiles-transition/scanline-overlay',
      'tiles-transition/vignette-corner',
      'tiles-transition/dirt-overlay',
      'tiles-transition/crack-overlay',
      'tiles-transition/blend-mask-a',
      'tiles-transition/blend-mask-b',
    ];
    const referenced = Object.values(TRANSITION_TILE_ART).flat();

    for (const id of rejectedIds) {
      expect(referenced, `${id} must never be referenced by the game`).not.toContain(id);
      expect(sprites.has(id), `${id} should still exist as an unreferenced atlas frame`).toBe(
        true,
      );
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
      ...Object.values(SCENERY_ART).flatMap((table) => Object.values(table).flat()),
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

describe('scenery art ids', () => {
  const surfaces = Object.keys(SCENERY_ART) as ScenerySurface[];

  it('resolves every scenery id a level profile can place', () => {
    for (const profile of Object.values(LEVEL_PROFILES)) {
      for (const id of profile.sceneryPool) {
        const ids = sceneryArtIds(profile.scenerySurface, id);

        expect(ids.length, `${profile.type}: ${id} has no art ids`).toBeGreaterThan(0);
        for (const frame of ids) {
          expect(
            sprites.has(frame),
            `${profile.type}: ${id} → ${frame} is not a key of .sprites in public/assets/assets.json`,
          ).toBe(true);
        }
      }
    }
  });

  it('declares no scenery id that no level profile places', () => {
    const placed = new Set(
      Object.values(LEVEL_PROFILES).flatMap((profile) =>
        profile.sceneryPool.map((id) => `${profile.scenerySurface}:${id}`),
      ),
    );

    for (const surface of surfaces) {
      for (const id of Object.keys(SCENERY_ART[surface])) {
        expect(placed.has(`${surface}:${id}`), `${surface}:${id} is never placed`).toBe(true);
      }
    }
  });

  it('picks the same variant for the same prop position', () => {
    const ids = SCENERY_ART.water.reeds ?? [];
    expect(ids.length).toBeGreaterThan(1);

    // Deterministic by position: no runtime RNG, and a prop cannot flicker while it scrolls.
    expect(pickSceneryVariant(ids, 1234)).toEqual(pickSceneryVariant(ids, 1234));
    expect(pickSceneryVariant(ids, 0)[0]).toBe(ids[0]);
    expect(pickSceneryVariant(ids, 1)[0]).toBe(ids[1]);
    // Every candidate survives as a fallback, so a missing cell still draws something.
    expect(new Set(pickSceneryVariant(ids, 7))).toEqual(new Set(ids));
  });

  it('answers an unknown prop with no ids, so the placeholder wins', () => {
    expect(sceneryArtIds('roadside', 'not-a-prop')).toEqual([]);
  });
});
