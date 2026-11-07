import { describe, expect, it } from 'vitest';
import { chromaKey, hexToRgb, type Raster } from './image';

/**
 * The chroma key is the one step that decides whether a generated sheet becomes transparent
 * sprites or a pink rectangle. Attempt 5 of the style anchor rendered its backdrop as
 * `#ee0466`, 174 away from the `#ff00ff` key, and the old colour-only match keyed nothing.
 *
 * These tests pin the replacement rule: the backdrop is the magenta-family region that
 * touches the image border. Connectivity, not colour, decides.
 */

const KEY = '#ff00ff';
const BACKDROP = '#ee0466';
const HOT_PINK = '#ff2e63';
const PLATE = '#1a1c2c';
const GREEN = '#00ff00';

function makeRaster(width: number, height: number, hex: string): Raster {
  const [r, g, b] = hexToRgb(hex);
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
  return { width, height, data };
}

/** Fill an inclusive rectangle with a solid colour. */
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

interface Pixel {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

function pixelAt(raster: Raster, x: number, y: number): Pixel {
  const i = (y * raster.width + x) * 4;
  return {
    r: raster.data.readUInt8(i),
    g: raster.data.readUInt8(i + 1),
    b: raster.data.readUInt8(i + 2),
    a: raster.data.readUInt8(i + 3),
  };
}

function opaqueCount(raster: Raster): number {
  let count = 0;
  for (let i = 3; i < raster.data.length; i += 4) {
    if (raster.data.readUInt8(i) !== 0) count += 1;
  }
  return count;
}

describe('chromaKey', () => {
  it('keys an exact #ff00ff backdrop to transparent', () => {
    const keyed = chromaKey(makeRaster(16, 16, KEY), KEY);

    expect(opaqueCount(keyed)).toBe(0);
    expect(pixelAt(keyed, 0, 0)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(pixelAt(keyed, 15, 15)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('keys an #ee0466 backdrop, which is outside the key tolerance', () => {
    const source = makeRaster(16, 16, BACKDROP);
    const keyed = chromaKey(source, KEY);

    // Guards the premise: this backdrop is genuinely further from the key than `tolerance`.
    const [kr, kg, kb] = hexToRgb(KEY);
    const [br, bg, bb] = hexToRgb(BACKDROP);
    expect(Math.abs(br - kr) + Math.abs(bg - kg) + Math.abs(bb - kb)).toBeGreaterThan(90);

    expect(opaqueCount(keyed)).toBe(0);
    expect(pixelAt(keyed, 8, 8)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('preserves an enclosed #ff2e63 block pixel for pixel', () => {
    const source = makeRaster(16, 16, BACKDROP);
    fillRect(source, 3, 3, 12, 12, PLATE);
    fillRect(source, 6, 6, 9, 9, HOT_PINK);

    const keyed = chromaKey(source, KEY);

    for (let y = 6; y <= 9; y += 1) {
      for (let x = 6; x <= 9; x += 1) {
        expect(pixelAt(keyed, x, y)).toEqual(pixelAt(source, x, y));
      }
    }
    expect(pixelAt(keyed, 7, 7)).toEqual(pixelAt(source, 7, 7));
    expect(pixelAt(keyed, 7, 7).a).toBe(255);

    // The plate ring around the pink is enclosed too, and must survive.
    expect(pixelAt(keyed, 4, 4)).toEqual(pixelAt(source, 4, 4));

    // Every backdrop pixel outside the plate is border-connected and therefore keyed.
    expect(pixelAt(keyed, 0, 0).a).toBe(0);
    expect(pixelAt(keyed, 15, 15).a).toBe(0);
    expect(pixelAt(keyed, 2, 8).a).toBe(0);
  });

  it('leaves border pixels that are not magenta-family alone', () => {
    const source = makeRaster(8, 8, GREEN);
    const keyed = chromaKey(source, KEY);

    expect(opaqueCount(keyed)).toBe(64);
    expect(pixelAt(keyed, 0, 0)).toEqual({ r: 0, g: 255, b: 0, a: 255 });
    expect(pixelAt(keyed, 7, 0)).toEqual({ r: 0, g: 255, b: 0, a: 255 });
  });

  it('leaves an enclosed magenta-family region alone even inside the tolerance', () => {
    // Same colour as the backdrop, but fenced off by an opaque plate, so it is subject.
    const source = makeRaster(16, 16, BACKDROP);
    fillRect(source, 4, 4, 11, 11, PLATE);
    fillRect(source, 6, 6, 9, 9, BACKDROP);

    const keyed = chromaKey(source, KEY);

    expect(pixelAt(keyed, 7, 7)).toEqual({ r: 238, g: 4, b: 102, a: 255 });
    expect(pixelAt(keyed, 0, 0).a).toBe(0);
  });

  it('returns a new raster without mutating the source', () => {
    const source = makeRaster(8, 8, BACKDROP);
    const before = Buffer.from(source.data);

    const keyed = chromaKey(source, KEY);

    expect(keyed).not.toBe(source);
    expect(source.data.equals(before)).toBe(true);
    expect(keyed.data.equals(before)).toBe(false);
  });
});
