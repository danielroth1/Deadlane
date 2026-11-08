import { describe, expect, it } from 'vitest';
import {
  dominantComponent,
  fillCanvas,
  hexToRgb,
  seamError,
  shrinkToSolidEdges,
  surfaceTileBounds,
  type Raster,
} from './image';

/**
 * Tile-specific image rules.
 *
 * These live in their own file because they are all about one defect: art-13 attempt 1 was
 * framed like a sprite, so every 32 px cell carried a transparent margin and a 1 px outline
 * ring. Tiled, that painted a lattice over the road — and `seamError` reported 0 because the
 * outermost rows of every cell were empty on every side.
 */

const PLATE = '#1a1c2c';
const GRASS = '#4e7a3f';
const MARKING = '#c8d2dc';

function makeEmpty(width: number, height: number): Raster {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

function fillRect(
  raster: Raster,
  left: number,
  top: number,
  right: number,
  bottom: number,
  hex: string,
): void {
  const [r, g, b] = hexToRgb(hex);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const i = (y * raster.width + x) * 4;
      raster.data[i] = r;
      raster.data[i + 1] = g;
      raster.data[i + 2] = b;
      raster.data[i + 3] = 255;
    }
  }
}

function alphaAt(raster: Raster, x: number, y: number): number {
  return raster.data.readUInt8((y * raster.width + x) * 4 + 3);
}

function opaqueShare(values: readonly number[]): number {
  return values.filter((a) => a > 0).length / values.length;
}

describe('dominantComponent', () => {
  it('reports the largest component and its share of the cell', () => {
    const cell = makeEmpty(40, 40);
    fillRect(cell, 4, 4, 35, 35, PLATE);
    fillRect(cell, 0, 0, 3, 3, PLATE);

    const dominant = dominantComponent(cell);

    expect(dominant?.box).toEqual({ left: 4, top: 4, width: 32, height: 32 });
    expect(dominant?.coverage).toBeCloseTo((32 * 32) / (40 * 40), 10);
  });

  it('is null for an empty cell', () => {
    expect(dominantComponent(makeEmpty(16, 16))).toBeNull();
  });
});

describe('surfaceTileBounds', () => {
  it('returns the tile rectangle, ignoring a detached speck the union box would keep', () => {
    const cell = makeEmpty(64, 64);
    fillRect(cell, 8, 8, 55, 55, PLATE);
    // A legal-size speck (>= 16 px) twelve columns to the left of the tile.
    fillRect(cell, 0, 20, 1, 28, PLATE);

    expect(surfaceTileBounds(cell)).toEqual({ left: 8, top: 8, width: 48, height: 48 });
  });

  it('shrinks an edge that is only a one-pixel lint', () => {
    const cell = makeEmpty(40, 40);
    fillRect(cell, 4, 4, 35, 35, PLATE);
    // Four single pixels poking out of the tile's left side. They are connected, so the
    // bounding box starts at x = 3, but three quarters of that column is empty.
    for (const y of [4, 12, 20, 28]) fillRect(cell, 3, y, 3, y, PLATE);

    expect(dominantComponent(cell)?.box.left).toBe(3);
    expect(surfaceTileBounds(cell)?.left).toBe(4);
  });

  it('rejects a small object drawn in the middle of the cell', () => {
    const cell = makeEmpty(64, 64);
    fillRect(cell, 24, 24, 39, 39, PLATE);

    expect(surfaceTileBounds(cell)).toBeNull();
  });

  it('rejects a large but ragged patch', () => {
    const cell = makeEmpty(64, 64);
    // A 60 x 60 frame with a 24 x 24 hole: most of the cell is art, but the component
    // fills only 84 % of its own bounding box, so it is not a rectangular tile.
    fillRect(cell, 2, 2, 61, 61, PLATE);
    for (let y = 20; y <= 43; y += 1) {
      for (let x = 20; x <= 43; x += 1) {
        cell.data.writeUInt8(0, (y * cell.width + x) * 4 + 3);
      }
    }

    expect(surfaceTileBounds(cell)).toBeNull();
  });
});

describe('shrinkToSolidEdges', () => {
  it('leaves an already solid box untouched', () => {
    const cell = makeEmpty(32, 32);
    fillRect(cell, 4, 4, 27, 27, PLATE);

    expect(shrinkToSolidEdges(cell, { left: 4, top: 4, width: 24, height: 24 })).toEqual({
      left: 4,
      top: 4,
      width: 24,
      height: 24,
    });
  });
});

describe('fillCanvas', () => {
  it('scales the trim box to the whole canvas, edge to edge', () => {
    const source = makeEmpty(2, 2);
    fillRect(source, 0, 0, 0, 0, PLATE);
    fillRect(source, 1, 0, 1, 0, GRASS);
    fillRect(source, 0, 1, 0, 1, MARKING);
    fillRect(source, 1, 1, 1, 1, PLATE);

    const cell = fillCanvas(source, 4);

    expect(cell.width).toBe(4);
    expect(cell.height).toBe(4);
    expect(alphaAt(cell, 0, 0)).toBe(255);
    expect(alphaAt(cell, 3, 3)).toBe(255);
    // Nearest neighbour, not blended: each source pixel becomes a 2 × 2 block.
    expect([...cell.data.subarray(0, 4)]).toEqual([0x1a, 0x1c, 0x2c, 255]);
    expect([...cell.data.subarray(12, 16)]).toEqual([0x4e, 0x7a, 0x3f, 255]);
  });

  it('leaves no transparent margin when the source is opaque', () => {
    const cell = fillCanvas(makeRaster(7, 5, PLATE), 32);
    const left = Array.from({ length: 32 }, (_, y) => alphaAt(cell, 0, y));
    const top = Array.from({ length: 32 }, (_, x) => alphaAt(cell, x, 0));

    expect(opaqueShare(left)).toBe(1);
    expect(opaqueShare(top)).toBe(1);
  });
});

function makeRaster(width: number, height: number, hex: string): Raster {
  const raster = makeEmpty(width, height);
  fillRect(raster, 0, 0, width - 1, height - 1, hex);
  return raster;
}

describe('seamError', () => {
  it('is zero for a tile whose opposing edges match', () => {
    expect(seamError(makeRaster(8, 8, PLATE))).toBe(0);
  });

  it('is large for a tile that has a transparent margin', () => {
    // The regression: a 1 px transparent ring used to score 0 because RGB 0 on both edges
    // looked identical. It is the shape that painted a lattice over the road.
    const tile = makeEmpty(8, 8);
    fillRect(tile, 1, 1, 6, 6, PLATE);

    expect(seamError(tile)).toBe(255);
  });

  it('measures the mismatch between opaque opposing edges', () => {
    const tile = makeRaster(8, 8, PLATE);
    fillRect(tile, 7, 0, 7, 7, MARKING);

    const error = seamError(tile);
    expect(error).toBeGreaterThan(10);
    expect(error).toBeLessThan(255);
  });

  it('ignores rows where one side is transparent but still judges the rest', () => {
    const tile = makeRaster(8, 8, PLATE);
    // The two topmost rows do not reach either vertical edge; six still do.
    for (const [x, y] of [
      [0, 0],
      [0, 1],
      [7, 0],
      [7, 1],
    ] as const) {
      tile.data.writeUInt8(0, (y * 8 + x) * 4 + 3);
    }

    expect(seamError(tile)).toBe(0);
  });

  it('reports a total failure when too little of an edge is opaque to judge', () => {
    const tile = makeRaster(8, 8, PLATE);
    // Only two of eight rows still reach the left and right edges.
    for (let y = 0; y < 6; y += 1) {
      for (const x of [0, 7]) tile.data.writeUInt8(0, (y * 8 + x) * 4 + 3);
    }

    expect(seamError(tile)).toBe(255);
  });
});
