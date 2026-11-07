import { describe, expect, it } from 'vitest';
import {
  MIN_ENCLOSED_RESIDUE_AREA,
  MIN_PLUME_AREA,
  MIN_PLUME_CORE_PIXELS,
  alphaBounds,
  chromaKey,
  dropExhaustPlume,
  hexToRgb,
  keyEnclosedMagenta,
  paletteWithout,
  quantize,
  rotate180,
  subjectBounds,
  type Palette,
  type Raster,
} from './image';

/**
 * The chroma key is the one step that decides whether a generated sheet becomes transparent
 * sprites or a pink rectangle. Attempt 5 of the style anchor rendered its backdrop as
 * `#ee0466`, 174 away from the `#ff00ff` key, and the old colour-only match keyed nothing.
 *
 * These tests pin the replacement rule: the backdrop is the magenta-family region that
 * touches the image border, where "magenta-family" means a bright, saturated hue in the
 * 295–350° band — not proximity to one hex. Connectivity decides which pixels are subject.
 */

const KEY = '#ff00ff';
const BACKDROP = '#ee0466';
const HOT_PINK = '#ff2e63';
const VIOLET = '#6a4fa3';
const GREY_PINK = '#8a7a80';
const WHITE = '#ffffff';
const PLATE = '#1a1c2c';
const GREEN = '#00ff00';

/** Every plate colour measured on the real sheet: same hue, different brightness. */
const BACKDROPS = ['#ff00ff', '#ee0466', '#df0b61', '#c60756'] as const;

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

  it.each(BACKDROPS)('keys a full frame of %s to 0 opaque pixels', (hex) => {
    const keyed = chromaKey(makeRaster(16, 16, hex), KEY);

    expect(opaqueCount(keyed)).toBe(0);
    expect(pixelAt(keyed, 0, 0)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(pixelAt(keyed, 8, 8)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(pixelAt(keyed, 15, 15)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('does not key a border-touching block of palette violet #6a4fa3', () => {
    // Hue ~259°, well outside the magenta band, so connectivity must not matter.
    const source = makeRaster(16, 16, BACKDROP);
    fillRect(source, 0, 4, 5, 11, VIOLET);

    const keyed = chromaKey(source, KEY);

    expect(pixelAt(keyed, 0, 4)).toEqual(pixelAt(source, 0, 4));
    expect(pixelAt(keyed, 5, 8)).toEqual(pixelAt(source, 5, 8));
    expect(pixelAt(keyed, 0, 4).a).toBe(255);

    // The backdrop around it is still keyed, so the fill reached the border freely.
    expect(pixelAt(keyed, 0, 0).a).toBe(0);
    expect(pixelAt(keyed, 15, 8).a).toBe(0);
  });

  it('does not key a border-touching desaturated grey-pink #8a7a80', () => {
    // Saturation ~0.12: the hue is magenta-ish but this is a grey, not a plate.
    const source = makeRaster(16, 16, BACKDROP);
    fillRect(source, 10, 0, 15, 7, GREY_PINK);

    const keyed = chromaKey(source, KEY);

    expect(pixelAt(keyed, 10, 0)).toEqual(pixelAt(source, 10, 0));
    expect(pixelAt(keyed, 15, 7)).toEqual(pixelAt(source, 15, 7));
    expect(pixelAt(keyed, 15, 7).a).toBe(255);

    expect(pixelAt(keyed, 15, 15).a).toBe(0);
    expect(pixelAt(keyed, 10, 8).a).toBe(0);
  });

  it('still keys a pure white frame through the fallback', () => {
    const keyed = chromaKey(makeRaster(8, 8, WHITE), KEY);

    expect(opaqueCount(keyed)).toBe(0);
    expect(pixelAt(keyed, 4, 4)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });
});

/**
 * The trim box is what sets a cell's scale and its centring, so a stray pixel on the cell
 * border costs a whole sprite: WO-24 shipped four sheets whose cell 2 was stretched to the
 * full quadrant by 1–3 px of plate residue at `x = 0`, `y = max`. These tests pin the rule
 * that fixes it — components below an area floor are not part of the subject — and, just as
 * importantly, that a subject which genuinely reaches the border is still trimmed to it.
 */
function makeEmpty(width: number, height: number): Raster {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

describe('subjectBounds', () => {
  it('ignores a 2 px speck on the left cell edge', () => {
    const cell = makeEmpty(32, 32);
    fillRect(cell, 10, 8, 21, 27, PLATE);
    fillRect(cell, 0, 5, 0, 6, PLATE);

    // The literal box still sees the speck, which is why this needs its own function.
    expect(alphaBounds(cell)).toEqual({ left: 0, top: 5, width: 22, height: 23 });
    expect(subjectBounds(cell)).toEqual({ left: 10, top: 8, width: 12, height: 20 });
  });

  it('ignores a 2 px speck on the bottom cell edge', () => {
    const cell = makeEmpty(32, 32);
    fillRect(cell, 9, 6, 20, 25, PLATE);
    fillRect(cell, 3, 31, 4, 31, PLATE);

    expect(alphaBounds(cell)).toEqual({ left: 3, top: 6, width: 18, height: 26 });
    expect(subjectBounds(cell)).toEqual({ left: 9, top: 6, width: 12, height: 20 });
  });

  it('ignores a speck enclosed in the empty background', () => {
    const cell = makeEmpty(32, 32);
    fillRect(cell, 4, 4, 15, 19, PLATE);
    // Not on an edge at all: position must not matter, only size.
    fillRect(cell, 26, 26, 27, 26, PLATE);

    expect(subjectBounds(cell)).toEqual({ left: 4, top: 4, width: 12, height: 16 });
  });

  it('keeps a subject that genuinely touches the cell edge', () => {
    const cell = makeEmpty(32, 32);
    fillRect(cell, 0, 11, 23, 30, PLATE);

    expect(subjectBounds(cell)).toEqual({ left: 0, top: 11, width: 24, height: 20 });
  });

  it('keeps a subject that fills the cell corner to corner', () => {
    const cell = makeEmpty(24, 24);
    fillRect(cell, 0, 0, 23, 23, PLATE);

    expect(subjectBounds(cell)).toEqual({ left: 0, top: 0, width: 24, height: 24 });
  });

  it('unions separate large components of one sprite', () => {
    const cell = makeEmpty(40, 40);
    fillRect(cell, 4, 4, 15, 15, PLATE);
    fillRect(cell, 24, 24, 35, 35, PLATE);

    expect(subjectBounds(cell)).toEqual({ left: 4, top: 4, width: 32, height: 32 });
  });

  it('falls back to the largest component when nothing clears the floor', () => {
    const cell = makeEmpty(32, 32);
    fillRect(cell, 2, 2, 3, 3, PLATE);
    fillRect(cell, 20, 20, 24, 21, PLATE);

    expect(subjectBounds(cell)).toEqual({ left: 20, top: 20, width: 5, height: 2 });
  });

  it('returns null for an empty cell', () => {
    expect(subjectBounds(makeEmpty(16, 16))).toBeNull();
  });
});

describe('rotate180', () => {
  it('maps every pixel to its opposite corner without resampling', () => {
    const cell = makeEmpty(4, 3);
    fillRect(cell, 0, 0, 0, 0, '#ff0000');
    fillRect(cell, 3, 2, 3, 2, GREEN);
    fillRect(cell, 1, 1, 2, 1, PLATE);

    const rotated = rotate180(cell);

    expect(rotated.width).toBe(4);
    expect(rotated.height).toBe(3);
    expect(pixelAt(rotated, 3, 2)).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(pixelAt(rotated, 0, 0)).toEqual({ r: 0, g: 255, b: 0, a: 255 });
    expect(pixelAt(rotated, 1, 1)).toEqual(pixelAt(cell, 2, 1));
    expect(pixelAt(rotated, 2, 1)).toEqual(pixelAt(cell, 1, 1));
  });

  it('is its own inverse and does not mutate the source', () => {
    const cell = makeRaster(6, 5, BACKDROP);
    fillRect(cell, 1, 1, 2, 3, PLATE);
    const before = Buffer.from(cell.data);

    const rotated = rotate180(rotate180(cell));

    expect(rotated.data.equals(before)).toBe(true);
    expect(cell.data.equals(before)).toBe(true);
  });

  it('moves an edge speck to the opposite edge without giving it weight', () => {
    const cell = makeEmpty(32, 32);
    fillRect(cell, 6, 6, 25, 25, PLATE);
    fillRect(cell, 0, 31, 0, 31, PLATE);

    const rotated = rotate180(cell);

    expect(pixelAt(rotated, 31, 0).a).toBe(255);
    expect(subjectBounds(rotated)).toEqual({ left: 6, top: 6, width: 20, height: 20 });
  });
});

/**
 * The border fill is only half of the key. art-05 cell 0 painted its rotor fan in the
 * backdrop colour and fenced it in with a 1 px highlight, so the fill could not reach 8,329
 * px of plate and `quantize` snapped all of it to hot-pink (WO-24 defect 2).
 *
 * These tests pin the enclosed pass *and* its narrowness: the band stops at 340°, hot-pink
 * measures 344.8°, so an enclosed `#ff2e63` accent is still subject however it is fenced in.
 */
describe('keyEnclosedMagenta', () => {
  /** Plate ring with a plate-coloured blob fenced inside it. */
  function makeEnclosedBlob(blobHex: string): Raster {
    const cell = makeRaster(24, 24, BACKDROP);
    fillRect(cell, 2, 2, 21, 21, PLATE);
    fillRect(cell, 8, 4, 15, 12, blobHex);
    return cell;
  }

  it('keys an enclosed plate-coloured fan the border fill cannot reach', () => {
    const source = makeEnclosedBlob(BACKDROP);
    const borderKeyed = chromaKey(source, KEY);

    // Guards the premise: the fill stops at the plate ring, which is the whole defect.
    expect(pixelAt(borderKeyed, 10, 8)).toEqual({ r: 238, g: 4, b: 102, a: 255 });

    const keyed = keyEnclosedMagenta(borderKeyed);

    expect(pixelAt(keyed, 10, 8)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(pixelAt(keyed, 8, 4).a).toBe(0);
    expect(pixelAt(keyed, 15, 12).a).toBe(0);

    // The plate ring around the fan is subject and must survive untouched.
    expect(pixelAt(keyed, 4, 4)).toEqual(pixelAt(source, 4, 4));
    expect(pixelAt(keyed, 4, 4).a).toBe(255);

    // And the border field is still keyed.
    expect(pixelAt(keyed, 0, 0).a).toBe(0);
  });

  it('keeps an enclosed hot-pink accent, because the band stops at 340°', () => {
    // The player car's accent, drawn inside the body exactly like the fan above.
    const source = makeEnclosedBlob(HOT_PINK);
    const keyed = keyEnclosedMagenta(chromaKey(source, KEY));

    expect(pixelAt(keyed, 10, 8)).toEqual({ r: 255, g: 46, b: 99, a: 255 });
    expect(pixelAt(keyed, 8, 4).a).toBe(255);

    // Guards the premise from the other side: this colour is outside the residue band.
    const [r, g, b] = hexToRgb(HOT_PINK);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    const hue = (60 * ((((g - b) / delta) % 6) + 6)) % 360;
    expect(hue).toBeGreaterThan(340);
  });

  it('leaves an enclosed region below the area floor alone', () => {
    const source = makeRaster(24, 24, BACKDROP);
    fillRect(source, 2, 2, 21, 21, PLATE);
    // 3 x 3 px: an anti-aliased fringe of a legitimate accent, not a painted region.
    fillRect(source, 10, 10, 12, 12, BACKDROP);
    expect(9).toBeLessThan(MIN_ENCLOSED_RESIDUE_AREA);

    const keyed = keyEnclosedMagenta(chromaKey(source, KEY));

    expect(pixelAt(keyed, 11, 11)).toEqual({ r: 238, g: 4, b: 102, a: 255 });
  });

  it('ignores a magenta field that touches the border, i.e. an unkeyed raster', () => {
    // Without the border fill there is no way to tell plate from residue, so the pass must
    // refuse to act rather than clear the whole sheet.
    const source = makeRaster(16, 16, BACKDROP);

    const keyed = keyEnclosedMagenta(source);

    expect(opaqueCount(keyed)).toBe(256);
    expect(pixelAt(keyed, 8, 8)).toEqual(pixelAt(source, 8, 8));
  });

  it('returns a new raster without mutating the source', () => {
    const source = makeEnclosedBlob(BACKDROP);
    const before = Buffer.from(source.data);

    const keyed = keyEnclosedMagenta(source);

    expect(keyed).not.toBe(source);
    expect(source.data.equals(before)).toBe(true);
  });
});

/**
 * `docs/ART_BIBLE.md` §8 forbids exhaust plumes and art-05 cell 3 shipped one anyway: a
 * white-hot jet flame hanging off the engine nozzle.
 *
 * Colour alone cannot identify it — the same sheets hold a bright yellow-green bulldozer
 * body and an orange drone canopy — so the rule is a warm component *with* a white-hot core.
 * These tests pin the removal and both false-positive guards.
 */
describe('dropExhaustPlume', () => {
  const HULL = '#1a1c2c';
  const FLAME_RIM = '#e0762a';
  const FLAME_CORE = '#f6ee5a';
  const WARM_BODY = '#e6b43c';

  it('keys an amber plume hanging off a hull', () => {
    const cell = makeEmpty(200, 200);
    fillRect(cell, 60, 40, 140, 150, HULL);
    fillRect(cell, 85, 150, 115, 185, FLAME_RIM);
    fillRect(cell, 92, 152, 108, 165, FLAME_CORE);

    const cleaned = dropExhaustPlume(cell);

    expect(pixelAt(cleaned, 100, 160)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(pixelAt(cleaned, 100, 180).a).toBe(0);
    expect(pixelAt(cleaned, 100, 100)).toEqual(pixelAt(cell, 100, 100));
    expect(pixelAt(cleaned, 100, 100).a).toBe(255);
  });

  it('removes the bright red rim together with the flame body', () => {
    const RED_RIM = '#f55552';
    const cell = makeEmpty(200, 200);
    fillRect(cell, 60, 40, 140, 150, HULL);
    fillRect(cell, 85, 150, 115, 175, FLAME_RIM);
    fillRect(cell, 92, 152, 108, 165, FLAME_CORE);
    // The outer rim reads as bright red just below 0°, not amber. Before the band wrapped,
    // this survived as a detached 244 px fragment on the real sheet.
    fillRect(cell, 85, 176, 115, 185, RED_RIM);

    const cleaned = dropExhaustPlume(cell);

    expect(pixelAt(cleaned, 100, 180).a).toBe(0);
    expect(pixelAt(cleaned, 100, 160).a).toBe(0);
    expect(pixelAt(cleaned, 100, 100).a).toBe(255);
  });

  it('leaves a warm vehicle body alone, however bright', () => {
    const cell = makeEmpty(200, 200);
    fillRect(cell, 40, 40, 160, 150, WARM_BODY);
    // A lamp cluster: bright, but nowhere near a flame's white-hot interior.
    fillRect(cell, 60, 60, 63, 63, FLAME_CORE);

    const cleaned = dropExhaustPlume(cell);

    expect(opaqueCount(cleaned)).toBe(opaqueCount(cell));
    expect(pixelAt(cleaned, 100, 100)).toEqual(pixelAt(cell, 100, 100));
    expect(pixelAt(cleaned, 61, 61)).toEqual(pixelAt(cell, 61, 61));
  });

  it('leaves a warm patch below the area floor alone', () => {
    const cell = makeEmpty(200, 200);
    fillRect(cell, 60, 40, 140, 150, HULL);
    // Small but genuinely white-hot.
    fillRect(cell, 90, 152, 109, 171, FLAME_RIM);
    fillRect(cell, 92, 154, 107, 169, FLAME_CORE);
    expect(20 * 20).toBeLessThan(MIN_PLUME_AREA);

    const cleaned = dropExhaustPlume(cell);

    expect(pixelAt(cleaned, 100, 160).a).toBe(255);
  });

  it('does not mutate the source', () => {
    const cell = makeEmpty(200, 200);
    fillRect(cell, 60, 40, 140, 150, HULL);
    fillRect(cell, 85, 150, 115, 185, FLAME_RIM);
    fillRect(cell, 92, 152, 108, 165, FLAME_CORE);
    const before = Buffer.from(cell.data);

    const cleaned = dropExhaustPlume(cell);

    expect(cell.data.equals(before)).toBe(true);
    expect(cleaned.data.equals(before)).toBe(false);
  });
});

/**
 * Palette colour 15 is reserved for the player, so hostile sheets quantise against a palette
 * that cannot produce it. Removing the entry (rather than remapping afterwards) is what makes
 * a hostile red land on signal-red instead of on whatever index 15 was reassigned to.
 */
describe('paletteWithout', () => {
  const palette: Palette = {
    colors: [
      { index: 8, hex: '#b8452f', name: 'signal-red', rgb: hexToRgb('#b8452f') },
      { index: 15, hex: HOT_PINK.toLowerCase(), name: 'hot-pink', rgb: hexToRgb(HOT_PINK) },
    ],
    transparentKey: KEY,
    playerAccentKey: HOT_PINK.toLowerCase(),
  };

  it('removes the reserved accent from the quantiser reach', () => {
    const source = makeRaster(4, 4, HOT_PINK);

    expect(quantize(source, palette).raster.data.readUInt8(0)).toBe(255);

    const hostile = paletteWithout(palette, [15]);
    const quantised = quantize(source, hostile);

    expect(quantised.raster.data.readUInt8(0)).toBe(184);
    expect(quantised.raster.data.readUInt8(1)).toBe(69);
    expect(quantised.raster.data.readUInt8(2)).toBe(47);
  });

  it('keeps the reserved keys on the reduced palette', () => {
    const hostile = paletteWithout(palette, [15]);

    expect(hostile.transparentKey).toBe(KEY);
    expect(hostile.playerAccentKey).toBe(HOT_PINK.toLowerCase());
    expect(hostile.colors.map((c) => c.index)).toEqual([8]);
  });
});
