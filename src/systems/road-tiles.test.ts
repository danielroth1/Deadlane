import { describe, expect, it } from 'vitest';
import { GAME, ROAD } from '@/config';
import type { RoadProfile } from '@/levels/types';
import {
  DASH_SAMPLE_X,
  DASH_WIDTH,
  SHOULDER_WIDTH,
  TILE_SIZE,
  planHighwayTiles,
  tileOffset,
} from './road-tiles';

/** The shipped highway profile, with the one field `ROAD` does not carry. */
const HIGHWAY: RoadProfile = { ...ROAD, obstructableLanes: [1, 2, 3, 4] };

const DISTANCES = [0, 0.25, 1, 3.5, 7, 15.75, 31, 31.5, 31.999, 32, 64, 123.456, 999.5];

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
});

describe('planHighwayTiles', () => {
  it('leaves the road geometry authoritative', () => {
    const right = HIGHWAY.left + HIGHWAY.width;

    for (const distance of DISTANCES) {
      const bands = planHighwayTiles(HIGHWAY, distance);
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
    const bands = planHighwayTiles(HIGHWAY, 12);
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
    for (const band of planHighwayTiles(HIGHWAY, 0)) {
      expect(band.sourceX).toBeGreaterThanOrEqual(0);
      expect(band.sourceWidth).toBeGreaterThan(0);
      expect(band.sourceX + band.sourceWidth).toBeLessThanOrEqual(TILE_SIZE);
    }
  });

  it('scrolls the tile pattern down the screen as distance grows', () => {
    // Sign pin: Phaser feeds `tilePositionY` into the quad's top v-coordinate, so a
    // positive value samples further down the texture and moves the pattern up. The world
    // scrolls down (world y = player.y + distance - at), so the offset must be negative.
    // Before this test the planner returned the positive wrap, the tile layer scrolled
    // against the traffic, and no test could see it.
    const at0 = planHighwayTiles(HIGHWAY, 0)[0]!.offset;
    const at4 = planHighwayTiles(HIGHWAY, 4)[0]!.offset;

    expect(at0).toBeCloseTo(0, 10);
    expect(at4).toBeLessThan(at0);
    expect(at4).toBeCloseTo(-4, 10);
    expect(planHighwayTiles(HIGHWAY, TILE_SIZE + 1)[0]!.offset).toBeCloseTo(-1, 10);

    for (const band of planHighwayTiles(HIGHWAY, 17.5)) {
      expect(band.offset).toBeLessThanOrEqual(0);
      expect(band.offset).toBeGreaterThan(-TILE_SIZE);
    }
  });

  it('scrolls every band continuously with distance', () => {
    for (const distance of DISTANCES) {
      const before = planHighwayTiles(HIGHWAY, distance);
      const after = planHighwayTiles(HIGHWAY, distance + 0.5);

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
    const reference = planHighwayTiles(HIGHWAY, 0).map(
      ({ kind, x, width, sourceX, sourceWidth }) => ({ kind, x, width, sourceX, sourceWidth }),
    );

    for (const distance of DISTANCES) {
      const bands = planHighwayTiles(HIGHWAY, distance).map(
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
      const before = planHighwayTiles(HIGHWAY, distance);
      const after = planHighwayTiles(HIGHWAY, distance + TILE_SIZE);

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
      for (const band of planHighwayTiles(HIGHWAY, distance)) {
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
    const bands = planHighwayTiles(narrow, 5);

    expect(bands.filter((band) => band.kind === 'dash')).toHaveLength(2);
    expect(bands.find((band) => band.kind === 'surface')).toMatchObject({
      x: 200,
      width: 192,
    });
    expect(bands.find((band) => band.kind === 'terrain')).toMatchObject({ x: 0, width: 200 });
  });
});
