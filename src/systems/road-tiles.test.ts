import { describe, expect, it } from 'vitest';
import { GAME, ROAD } from '@/config';
import { CANYON_TILE_ART, HIGHWAY_TILE_ART, WATER_TILE_ART, type TileKind } from '@/art/ids';
import { LEVEL_PROFILES, type RoadProfile } from '@/levels/types';
import {
  CANYON_TILE_WINDOWS,
  DASH_SAMPLE_X,
  DASH_WIDTH,
  HIGHWAY_TILE_WINDOWS,
  ROAD_TILE_SPECS,
  SHOULDER_WIDTH,
  TILE_SIZE,
  WATER_TILE_WINDOWS,
  planRoadTiles,
  tileOffset,
  type RoadTileTheme,
} from './road-tiles';

/** The shipped highway profile, with the one field `ROAD` does not carry. */
const HIGHWAY: RoadProfile = { ...ROAD, obstructableLanes: [1, 2, 3, 4] };

/** Canyon and river both use five 76 px lanes; borrow one for the narrower tests. */
const CANYON: RoadProfile = { ...ROAD, lanes: 5, laneWidth: 76, obstructableLanes: [1, 2, 3] };

const DISTANCES = [0, 0.25, 1, 3.5, 7, 15.75, 31, 31.5, 31.999, 32, 64, 123.456, 999.5];

/** Every window a theme can draw, in a fixed order. */
function windowsOf(
  theme: RoadTileTheme,
): readonly (readonly [string, number, number, number, number])[] {
  const row = (name: string, window: RoadTileTheme['surface']) =>
    [name, window.sourceX, window.sourceWidth, window.sourceY, window.sourceHeight] as const;
  return [
    row('terrain', theme.terrain),
    row('shoulderLeft', theme.shoulderLeft),
    row('shoulderRight', theme.shoulderRight),
    row('surface', theme.surface),
    row('dash', theme.dash),
  ];
}

describe('tileOffset', () => {
  it('wraps any distance into one 32 px tile', () => {
    for (const distance of [-64, -TILE_SIZE, -0.5, 0, 0.5, TILE_SIZE, 1_000_000]) {
      const offset = tileOffset(distance);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThan(TILE_SIZE);
    }
  });

  it('is periodic with one tile', () => {
    for (const distance of DISTANCES) {
      expect(tileOffset(distance + TILE_SIZE)).toBeCloseTo(tileOffset(distance), 10);
    }
  });

  it('advances by exactly the distance delta, without snapping to tile edges', () => {
    for (const distance of [0, 3.5, 15.75, 31.5, 100.125]) {
      const delta = 0.25;
      const before = tileOffset(distance);
      const after = tileOffset(distance + delta);
      const expected = before + delta >= TILE_SIZE ? before + delta - TILE_SIZE : before + delta;
      expect(after).toBeCloseTo(expected, 10);
    }
  });

  it('crosses the tile seam without a jump', () => {
    // Just before the wrap the offset is a fraction below 32; the next step lands on the
    // same point one tile earlier, so the sampled pattern is continuous.
    const justBefore = tileOffset(TILE_SIZE - 0.5);
    expect(justBefore).toBeCloseTo(TILE_SIZE - 0.5, 10);
    expect(tileOffset(justBefore + 0.5)).toBeCloseTo(0, 10);
  });

  it('wraps a trimmed window at its own height', () => {
    // A band that drops the top border row repeats every 30 px. Wrapping it at 32 would
    // jump the pattern by 2 px once per tile, which is a visible hitch in the scroll.
    expect(tileOffset(30, 30)).toBeCloseTo(0, 10);
    expect(tileOffset(31, 30)).toBeCloseTo(1, 10);
    expect(tileOffset(29.5, 30)).toBeCloseTo(29.5, 10);
    expect(tileOffset(-1, 30)).toBeCloseTo(29, 10);
  });
});

describe('planRoadTiles', () => {
  it('leaves the road geometry authoritative', () => {
    const right = HIGHWAY.left + HIGHWAY.width;

    for (const distance of DISTANCES) {
      const bands = planRoadTiles(HIGHWAY, distance);
      const surface = bands.filter((band) => band.kind === 'surface');
      const shoulder = bands.filter((band) => band.kind === 'shoulder');
      const terrain = bands.filter((band) => band.kind === 'terrain');

      expect(surface).toHaveLength(1);
      expect(surface[0]?.x).toBe(HIGHWAY.left);
      expect(surface[0]?.width).toBe(HIGHWAY.width);

      expect(shoulder).toHaveLength(2);
      expect(shoulder[0]?.x).toBe(HIGHWAY.left - SHOULDER_WIDTH);
      expect(shoulder[0]?.width).toBe(SHOULDER_WIDTH);
      expect(shoulder[1]?.x).toBe(right);
      expect(shoulder[1]?.width).toBe(SHOULDER_WIDTH);

      expect(terrain).toHaveLength(2);
      expect(terrain[0]?.x).toBe(0);
      expect(terrain[0]?.width).toBe(HIGHWAY.left);
      expect(terrain[1]?.x).toBe(right);
      expect(terrain[1]?.width).toBe(GAME.width - right);
    }
  });

  it('puts one dash band on every interior lane boundary', () => {
    const bands = planRoadTiles(HIGHWAY, 12);
    const dashes = bands.filter((band) => band.kind === 'dash');

    expect(dashes).toHaveLength(HIGHWAY.lanes - 1);
    dashes.forEach((dash, index) => {
      const lane = index + 1;
      expect(dash.x).toBe(HIGHWAY.left + lane * HIGHWAY.laneWidth - DASH_WIDTH / 2);
      expect(dash.width).toBe(DASH_WIDTH);
      expect(dash.sourceX).toBe(DASH_SAMPLE_X);
      // 1:1, not stretched: the dash column keeps its own pixel size (ART_BIBLE §2).
      expect(dash.sourceWidth).toBe(DASH_WIDTH);
    });
  });

  it('samples every band 1:1 inside its own frame', () => {
    for (const band of planRoadTiles(HIGHWAY, 0)) {
      expect(band.sourceX).toBeGreaterThanOrEqual(0);
      expect(band.sourceWidth).toBeGreaterThan(0);
      expect(band.sourceX + band.sourceWidth).toBeLessThanOrEqual(TILE_SIZE);
      expect(band.sourceY).toBeGreaterThanOrEqual(0);
      expect(band.sourceHeight).toBeGreaterThan(0);
      expect(band.sourceY + band.sourceHeight).toBeLessThanOrEqual(TILE_SIZE);
    }
  });

  it('scrolls the tile pattern down the screen as distance grows', () => {
    // Sign pin: Phaser feeds `tilePositionY` into the quad's top v-coordinate, so a
    // positive value samples further down the texture and moves the pattern up. The world
    // scrolls down (world y = player.y + distance - at), so the offset must be negative.
    // Before this test the planner returned the positive wrap, the tile layer scrolled
    // against the traffic, and no test could see it.
    const at0 = planRoadTiles(HIGHWAY, 0)[0]!.offset;
    const at4 = planRoadTiles(HIGHWAY, 4)[0]!.offset;

    expect(at0).toBeCloseTo(0, 10);
    expect(at4).toBeLessThan(at0);
    expect(at4).toBeCloseTo(-4, 10);
    expect(planRoadTiles(HIGHWAY, TILE_SIZE + 1)[0]!.offset).toBeCloseTo(-1, 10);

    for (const band of planRoadTiles(HIGHWAY, 17.5)) {
      expect(band.offset).toBeLessThanOrEqual(0);
      expect(band.offset).toBeGreaterThan(-TILE_SIZE);
    }
  });

  it('scrolls every band continuously with distance', () => {
    for (const distance of DISTANCES) {
      const before = planRoadTiles(HIGHWAY, distance);
      const after = planRoadTiles(HIGHWAY, distance + 0.5);

      expect(after).toHaveLength(before.length);
      before.forEach((band, index) => {
        const next = after[index];
        expect(next).toBeDefined();
        expect(next?.kind).toBe(band.kind);
        expect(next?.offset).toBeCloseTo(-tileOffset(distance + 0.5), 10);
      });
    }
  });

  it('never lets band edges drift with distance', () => {
    const reference = planRoadTiles(HIGHWAY, 0).map(
      ({ kind, x, width, sourceX, sourceWidth }) => ({ kind, x, width, sourceX, sourceWidth }),
    );

    for (const distance of DISTANCES) {
      const bands = planRoadTiles(HIGHWAY, distance).map(
        ({ kind, x, width, sourceX, sourceWidth }) => ({
          kind,
          x,
          width,
          sourceX,
          sourceWidth,
        }),
      );
      expect(bands).toEqual(reference);
    }
  });

  it('repeats the whole plan once per tile', () => {
    for (const distance of DISTANCES) {
      const before = planRoadTiles(HIGHWAY, distance);
      const after = planRoadTiles(HIGHWAY, distance + TILE_SIZE);

      // Geometry is identical; offsets match to float precision. `% TILE_SIZE` on a
      // fractional distance is not bit-exact, but the pattern is the same tile.
      expect(after).toHaveLength(before.length);
      before.forEach((band, index) => {
        const next = after[index];
        expect(next).toBeDefined();
        expect(next?.kind).toBe(band.kind);
        expect(next?.x).toBe(band.x);
        expect(next?.width).toBe(band.width);
        expect(next?.sourceX).toBe(band.sourceX);
        expect(next?.sourceWidth).toBe(band.sourceWidth);
        expect(next?.offset).toBeCloseTo(band.offset, 9);
      });
    }
  });

  it('keeps every band inside the screen', () => {
    for (const distance of DISTANCES) {
      for (const band of planRoadTiles(HIGHWAY, distance)) {
        expect(band.x).toBeGreaterThanOrEqual(0);
        expect(band.x + band.width).toBeLessThanOrEqual(GAME.width);
      }
    }
  });

  it('follows a narrower road profile without assuming the shipped numbers', () => {
    const narrow: RoadProfile = {
      left: 200,
      width: 192,
      lanes: 3,
      laneWidth: 64,
      obstructableLanes: [1],
    };
    const bands = planRoadTiles(narrow, 5);

    expect(bands.filter((band) => band.kind === 'dash')).toHaveLength(2);
    expect(bands.find((band) => band.kind === 'surface')).toMatchObject({
      x: 200,
      width: 192,
    });
    expect(bands.find((band) => band.kind === 'terrain')).toMatchObject({ x: 0, width: 200 });
  });
});

describe('road tile specs', () => {
  const themes: readonly [string, RoadTileTheme][] = [
    ['highway', HIGHWAY_TILE_WINDOWS],
    ['canyon', CANYON_TILE_WINDOWS],
    ['water', WATER_TILE_WINDOWS],
  ];

  it('wires exactly the level types that have a sheet', () => {
    expect(Object.keys(ROAD_TILE_SPECS).sort()).toEqual(['canyon', 'highway', 'river']);
    expect(ROAD_TILE_SPECS.highway?.art).toBe(HIGHWAY_TILE_ART);
    expect(ROAD_TILE_SPECS.canyon?.art).toBe(CANYON_TILE_ART);
    expect(ROAD_TILE_SPECS.river?.art).toBe(WATER_TILE_ART);
    // City and tunnel keep the drawn theme until their own sheets land.
    expect(ROAD_TILE_SPECS.city).toBeUndefined();
    expect(ROAD_TILE_SPECS.tunnel).toBeUndefined();
  });

  it('samples every theme 1:1 inside its own 32 px frame', () => {
    for (const [label, theme] of themes) {
      for (const [role, x, width, y, height] of windowsOf(theme)) {
        expect(x, `${label}.${role}.sourceX`).toBeGreaterThanOrEqual(0);
        expect(width, `${label}.${role}.sourceWidth`).toBeGreaterThan(0);
        expect(y, `${label}.${role}.sourceY`).toBeGreaterThanOrEqual(0);
        expect(height, `${label}.${role}.sourceHeight`).toBeGreaterThan(0);
        expect(x + width, `${label}.${role} must fit the frame`).toBeLessThanOrEqual(TILE_SIZE);
        expect(y + height, `${label}.${role} rows must fit the frame`).toBeLessThanOrEqual(
          TILE_SIZE,
        );
      }
    }
  });

  it('drops the model border row from the canyon and water surfaces', () => {
    // Both cells carry a dark 1 px border along their top edge; repeating it paints a line
    // across the road every tile, which reads as a grid rather than asphalt or water.
    for (const theme of [CANYON_TILE_WINDOWS, WATER_TILE_WINDOWS]) {
      expect(theme.surface.sourceY).toBeGreaterThan(0);
      expect(theme.surface.sourceY + theme.surface.sourceHeight).toBeLessThanOrEqual(TILE_SIZE);
    }
  });

  it('keeps the canyon surface off the painted dash column', () => {
    // art-14 cell 0 carries a white dash at column 16. Sampling it into the surface would
    // paint a lane marking every window width instead of one per lane boundary.
    const { sourceX, sourceWidth } = CANYON_TILE_WINDOWS.surface;
    expect(sourceX > 16 || sourceX + sourceWidth <= 16).toBe(true);
  });

  it('draws the water channel from water cells, never from asphalt', () => {
    for (const ids of Object.values(WATER_TILE_ART)) {
      for (const id of ids) {
        expect(id.startsWith('tiles-water/'), `${id} is not a water frame`).toBe(true);
      }
    }
    // The canyon theme, by contrast, borrows its asphalt cell for the dash as well.
    expect(CANYON_TILE_ART.surface[0]).toBe(CANYON_TILE_ART.dash[0]);
  });

  it('plans every theme on a real level road profile', () => {
    for (const type of ['canyon', 'river'] as const) {
      const spec = ROAD_TILE_SPECS[type];
      if (!spec) throw new Error(`${type} has no tile spec`);
      const profile = LEVEL_PROFILES[type];
      const narrow: RoadProfile = {
        left: 40,
        width: profile.lanes * 76,
        lanes: profile.lanes,
        laneWidth: 76,
        obstructableLanes: [1],
      };
      const right = narrow.left + narrow.width;

      for (const distance of DISTANCES) {
        const bands = planRoadTiles(narrow, distance, spec.windows);
        const byKind = (kind: TileKind) => bands.filter((band) => band.kind === kind);

        expect(byKind('surface')).toHaveLength(1);
        expect(byKind('surface')[0]).toMatchObject({
          x: narrow.left,
          width: narrow.width,
          sourceX: spec.windows.surface.sourceX,
          sourceWidth: spec.windows.surface.sourceWidth,
        });
        expect(byKind('dash')).toHaveLength(narrow.lanes - 1);
        // The dash band is exactly one window: repeating it more would replay the marking
        // inside its own band.
        for (const dash of byKind('dash')) {
          expect(dash.width).toBe(spec.windows.dash.sourceWidth);
          expect(dash.sourceWidth).toBe(spec.windows.dash.sourceWidth);
        }
        expect(byKind('shoulder').map((band) => band.x)).toEqual([
          narrow.left - SHOULDER_WIDTH,
          right,
        ]);
        for (const band of bands) {
          expect(band.x).toBeGreaterThanOrEqual(0);
          expect(band.x + band.width).toBeLessThanOrEqual(GAME.width);
          expect(band.sourceX + band.sourceWidth).toBeLessThanOrEqual(TILE_SIZE);
          expect(band.sourceY + band.sourceHeight).toBeLessThanOrEqual(TILE_SIZE);
          // Each band wraps at its own window height, so a trimmed surface still scrolls.
          expect(band.offset).toBeGreaterThan(-band.sourceHeight);
          expect(band.offset).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it('uses the theme windows, not the highway ones, for canyon and water', () => {
    const canyon = planRoadTiles(CANYON, 0, CANYON_TILE_WINDOWS);
    const water = planRoadTiles(CANYON, 0, WATER_TILE_WINDOWS);
    const surfaceOf = (bands: readonly { kind: TileKind; sourceWidth: number }[]) =>
      bands.find((band) => band.kind === 'surface')?.sourceWidth;

    expect(surfaceOf(canyon)).toBe(CANYON_TILE_WINDOWS.surface.sourceWidth);
    expect(surfaceOf(water)).toBe(WATER_TILE_WINDOWS.surface.sourceWidth);
    expect(surfaceOf(canyon)).not.toBe(HIGHWAY_TILE_WINDOWS.surface.sourceWidth);
  });
});
