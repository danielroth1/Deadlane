import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PALETTE } from '@/palette';
import type { TileKind } from '@/art/ids';
import { LEVEL_PROFILES } from '@/levels/types';
import { decode, type Raster } from '../../pipeline/lib/image.js';
import {
  ROAD_TILE_SPECS,
  type RoadTileSpec,
  type RoadTileTheme,
  type TileWindow,
} from './road-tiles';

/**
 * The window rectangles, measured on the shipped sheets.
 *
 * `road-tiles.test.ts` checks the planner's arithmetic; it cannot see the art, so every
 * claim of the form "this window holds asphalt and no marking" or "this window is deck and
 * not water" used to be checked only against the comment above the window. That is exactly
 * how a bike-shed passes review and paints a lane marking every 13 px in the game.
 *
 * These tests decode the committed PNGs — the same files the browser loads — and measure
 * the windows the planner actually draws: whether they are opaque, whether they wrap as
 * smoothly as they vary internally, and what colour they are made of. A window that moves
 * by a pixel, or a sheet that is re-exported with different content, fails here instead of
 * in a screenshot nobody looked at.
 */

interface ManifestFrame {
  readonly sheet: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface Manifest {
  readonly sprites: Record<string, ManifestFrame>;
}

const manifest = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/assets/assets.json'), 'utf8'),
) as Manifest;

/** Band role → the tile role in the art table that supplies its frame. */
const ROLE_KIND: Readonly<Record<keyof RoadTileTheme, TileKind>> = {
  terrain: 'terrain',
  shoulderLeft: 'shoulder',
  shoulderRight: 'shoulder',
  surface: 'surface',
  dash: 'dash',
};

const sheets = new Map<string, Promise<Raster>>();

function sheetRaster(sheet: string): Promise<Raster> {
  const cached = sheets.get(sheet);
  if (cached) return cached;
  const loaded = decode(resolve(process.cwd(), 'public/assets/sheets', `${sheet}.png`));
  sheets.set(sheet, loaded);
  return loaded;
}

function specFor(type: 'canyon' | 'river' | 'city' | 'tunnel'): RoadTileSpec {
  const spec = ROAD_TILE_SPECS[type];
  if (!spec) throw new Error(`${type} has no tile spec`);
  return spec;
}

function artFrame(spec: RoadTileSpec, role: keyof RoadTileTheme): ManifestFrame {
  const id = spec.art[ROLE_KIND[role]][0];
  if (!id) throw new Error(`${ROLE_KIND[role]} has no frame id`);
  const frame = manifest.sprites[id];
  if (!frame) throw new Error(`${id} is not a frame in public/assets/assets.json`);
  return frame;
}

function crop(source: Raster, left: number, top: number, width: number, height: number): Raster {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const from = ((top + y) * source.width + left) * 4;
    source.data.copy(data, y * width * 4, from, from + width * 4);
  }
  return { width, height, data };
}

/** The pixels of one band, exactly as the tile layer repeats them. */
async function bandPixels(spec: RoadTileSpec, role: keyof RoadTileTheme): Promise<Raster> {
  const window: TileWindow = spec.windows[role];
  const frame = artFrame(spec, role);
  const sheet = await sheetRaster(frame.sheet);
  return crop(
    sheet,
    frame.x + window.sourceX,
    frame.y + window.sourceY,
    window.sourceWidth,
    window.sourceHeight,
  );
}

/** The whole 32 × 32 cell a role's frame is cut from, for measuring what is *outside* a window. */
async function cellPixels(spec: RoadTileSpec, role: keyof RoadTileTheme): Promise<Raster> {
  const frame = artFrame(spec, role);
  const sheet = await sheetRaster(frame.sheet);
  return crop(sheet, frame.x, frame.y, frame.w, frame.h);
}

type Rgb = readonly [number, number, number];

function rgbAt(raster: Raster, x: number, y: number): Rgb {
  const i = (y * raster.width + x) * 4;
  return [
    raster.data.readUInt8(i),
    raster.data.readUInt8(i + 1),
    raster.data.readUInt8(i + 2),
  ];
}

function alphaAt(raster: Raster, x: number, y: number): number {
  return raster.data.readUInt8((y * raster.width + x) * 4 + 3);
}

/** `0xRRGGBB` → the triple to compare against, so palette constants read as themselves. */
function paletteRgb(hex: number): Rgb {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function matches(pixel: Rgb, hex: number): boolean {
  const [r, g, b] = paletteRgb(hex);
  return pixel[0] === r && pixel[1] === g && pixel[2] === b;
}

function luma(pixel: Rgb): number {
  return 0.2126 * pixel[0] + 0.7152 * pixel[1] + 0.0722 * pixel[2];
}

/** Mean luma of every pixel in a raster. */
function meanLuma(raster: Raster): number {
  let sum = 0;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) sum += luma(rgbAt(raster, x, y));
  }
  return sum / (raster.width * raster.height);
}

/** Share of a raster's pixels painted in one palette colour. */
function colourShare(raster: Raster, hex: number): number {
  let hits = 0;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (matches(rgbAt(raster, x, y), hex)) hits += 1;
    }
  }
  return hits / (raster.width * raster.height);
}

/** Share of a raster's pixels painted any of these palette colours. */
function familyShare(raster: Raster, hexes: readonly number[]): number {
  let hits = 0;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const pixel = rgbAt(raster, x, y);
      if (hexes.some((hex) => matches(pixel, hex))) hits += 1;
    }
  }
  return hits / (raster.width * raster.height);
}

function distinctColours(raster: Raster): number {
  const seen = new Set<string>();
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) seen.add(rgbAt(raster, x, y).join(','));
  }
  return seen.size;
}

function columnProfile(raster: Raster): number[] {
  return Array.from({ length: raster.width }, (_, x) => {
    let sum = 0;
    let count = 0;
    for (let y = 0; y < raster.height; y += 1) {
      if (alphaAt(raster, x, y) === 0) continue;
      sum += luma(rgbAt(raster, x, y));
      count += 1;
    }
    return count === 0 ? 0 : sum / count;
  });
}

function rowProfile(raster: Raster): number[] {
  return Array.from({ length: raster.height }, (_, y) => {
    let sum = 0;
    let count = 0;
    for (let x = 0; x < raster.width; x += 1) {
      if (alphaAt(raster, x, y) === 0) continue;
      sum += luma(rgbAt(raster, x, y));
      count += 1;
    }
    return count === 0 ? 0 : sum / count;
  });
}

/**
 * How hard a window's own repeat joins, against how hard its interior varies.
 *
 * The window is drawn beside a copy of itself, so the last column of one copy abuts the
 * first column of the next (and the same vertically, on every scroll wrap). If that step is
 * bigger than any step inside the window, the join is the single sharpest edge in the band
 * and the eye reads it as a line every window. If it is not, the repeat is indistinguishable
 * from the texture.
 */
function wrapReport(profile: readonly number[]): {
  readonly seam: number;
  readonly internalMax: number;
} {
  let internalMax = 0;
  for (let i = 0; i < profile.length - 1; i += 1) {
    internalMax = Math.max(internalMax, Math.abs((profile[i + 1] ?? 0) - (profile[i] ?? 0)));
  }
  const first = profile[0] ?? 0;
  const last = profile[profile.length - 1] ?? 0;
  return { seam: Math.abs(last - first), internalMax };
}

/** Brightness centroid of the columns that pass `test`, in window-local pixels. */
function brightCentroid(raster: Raster, test: (pixel: Rgb) => boolean): number {
  let weighted = 0;
  let total = 0;
  for (let x = 0; x < raster.width; x += 1) {
    for (let y = 0; y < raster.height; y += 1) {
      const pixel = rgbAt(raster, x, y);
      if (alphaAt(raster, x, y) === 0 || !test(pixel)) continue;
      weighted += x;
      total += 1;
    }
  }
  return total === 0 ? Number.NaN : weighted / total;
}

const THEMES = [
  ['canyon', specFor('canyon')],
  ['river', specFor('river')],
  ['city', specFor('city')],
  ['tunnel', specFor('tunnel')],
] as const;

describe('shipped tile windows', () => {
  for (const [label, spec] of THEMES) {
    describe(label, () => {
      it('is opaque, edge to edge, on every band that covers the screen', async () => {
        // A transparent column or row in a window becomes a strip of the drawn fill showing
        // between every tile — the art-13 lattice, one layer down. The failure mode needs a
        // *line*: a fully transparent column or row, or a cell that is mostly hole. A stray
        // corner pixel is not a lattice.
        for (const role of ['surface', 'terrain', 'shoulderLeft', 'shoulderRight'] as const) {
          const band = await bandPixels(spec, role);
          let opaquePixels = 0;

          for (let x = 0; x < band.width; x += 1) {
            const opaque = Array.from({ length: band.height }, (_, y) => alphaAt(band, x, y));
            const count = opaque.filter((a) => a > 0).length;
            opaquePixels += count;
            expect(count, `${label}.${role} column ${x} is transparent`).toBeGreaterThan(0);
          }

          for (let y = 0; y < band.height; y += 1) {
            const opaque = Array.from({ length: band.width }, (_, x) => alphaAt(band, x, y));
            expect(
              opaque.filter((a) => a > 0).length,
              `${label}.${role} row ${y} is transparent`,
            ).toBeGreaterThan(0);
          }

          expect(
            opaquePixels / (band.width * band.height),
            `${label}.${role} is mostly hole`,
          ).toBeGreaterThan(0.99);
        }
      });

      it('wraps no harder than it varies inside the window', async () => {
        // Every band wraps vertically at its own window height, because that is the scroll
        // period. The surface and terrain also repeat horizontally across the road, so both
        // axes are measured there. A shoulder band is exactly one window wide and a dash
        // band is exactly one window wide too, so neither repeats sideways; the dash is
        // skipped vertically as well, because its gaps are transparent rows by design.
        for (const role of ['surface', 'terrain', 'shoulderLeft', 'shoulderRight'] as const) {
          const band = await bandPixels(spec, role);
          const rows = wrapReport(rowProfile(band));
          expect(
            rows.seam,
            `${label}.${role} repeats down a ${rows.seam.toFixed(1)} luma step where its own rows never step more than ${rows.internalMax.toFixed(1)}`,
          ).toBeLessThanOrEqual(rows.internalMax);

          if (role === 'surface' || role === 'terrain') {
            const columns = wrapReport(columnProfile(band));
            expect(
              columns.seam,
              `${label}.${role} repeats across a ${columns.seam.toFixed(1)} luma step where its own columns never step more than ${columns.internalMax.toFixed(1)}`,
            ).toBeLessThanOrEqual(columns.internalMax);
          }
        }
      });
    });
  }
});

describe('canyon sheet cells', () => {
  const spec = specFor('canyon');

  it('measures the road strip it samples: an edge line and a dash, either side of the surface window', async () => {
    // The positive control for the two tests below. Cell 0 is a road strip, not a plain
    // asphalt patch: column 2 is the solid edge line and column 16 the painted dash. If
    // this ever stops being true, the surface window is sampling something else.
    const cell = await cellPixels(spec, 'surface');
    expect(cell.width).toBe(32);

    const edgeLine = Array.from({ length: 32 }, (_, y) => rgbAt(cell, 2, y));
    expect(
      edgeLine.filter((pixel) => matches(pixel, PALETTE.steelLight)).length,
      'column 2 is not the solid edge line',
    ).toBeGreaterThanOrEqual(16);

    const dash = Array.from({ length: 32 }, (_, y) => rgbAt(cell, 16, y));
    expect(
      dash.filter((pixel) => matches(pixel, PALETTE.bone) || matches(pixel, PALETTE.white))
        .length,
      'column 16 is not the painted dash',
    ).toBeGreaterThanOrEqual(16);
  });

  it('samples the surface from asphalt only, with no marking column inside it', async () => {
    const { sourceX, sourceWidth } = spec.windows.surface;
    const band = await bandPixels(spec, 'surface');

    for (let x = 0; x < band.width; x += 1) {
      for (let y = 0; y < band.height; y += 1) {
        const pixel = rgbAt(band, x, y);
        expect(
          matches(pixel, PALETTE.bone) || matches(pixel, PALETTE.white),
          `surface column ${sourceX + x} row ${y} is a painted marking`,
        ).toBe(false);
      }
    }

    // Not just "no bone": no column is even as light as the edge line next door (mean luma
    // 111), so nothing that reads as paint can leak in. The cracked asphalt's own columns
    // measure 56–68.
    for (const mean of columnProfile(band)) expect(mean).toBeLessThan(100);

    expect(sourceX).toBeGreaterThan(2);
    expect(sourceX + sourceWidth).toBeLessThanOrEqual(16);
  });

  it('puts the painted dash at the centre of the lane band', async () => {
    const band = await bandPixels(spec, 'dash');
    const marking = (pixel: Rgb): boolean =>
      matches(pixel, PALETTE.bone) || matches(pixel, PALETTE.white);

    const centroid = brightCentroid(band, marking);
    const centre = (band.width - 1) / 2;
    expect(
      Math.abs(centroid - centre),
      `dash centroid ${centroid.toFixed(2)} is not the centre ${centre} of a ${band.width} px band`,
    ).toBeLessThanOrEqual(1.5);

    // One column carries the paint: repeating the band must not replay the marking twice.
    const markingColumns = columnProfile(band).filter((_, x) => {
      const pixels = Array.from({ length: band.height }, (_, y) => rgbAt(band, x, y));
      return pixels.filter(marking).length / band.height > 0.4;
    });
    expect(markingColumns).toHaveLength(1);

    expect(colourShare(band, PALETTE.bone)).toBeGreaterThan(0.02);
  });

  it('fills the terrain with the sand plain, speckle included', async () => {
    const band = await bandPixels(spec, 'terrain');
    const sand = colourShare(band, PALETTE.sand);

    expect(sand, 'the terrain window is not the sand plain').toBeGreaterThan(0.9);
    // The plain is not a flat fill: the model sprinkled amber, bone and red grit over it.
    expect(distinctColours(band)).toBeGreaterThanOrEqual(3);
    expect(sand).toBeLessThan(1);
  });
});

describe('water sheet cells', () => {
  const spec = specFor('river');
  const WATER = [PALETTE.teal, PALETTE.deepBlue] as const;

  it('draws the channel from water, never from asphalt or the drawn fill', async () => {
    const surface = await bandPixels(spec, 'surface');
    const terrain = await bandPixels(spec, 'terrain');

    for (const [role, band] of [
      ['surface', surface],
      ['terrain', terrain],
    ] as const) {
      // Neither the road asphalt the drawn theme fills with, nor the deep blue it fills the
      // water channel with, appears in a water window: the channel is the sheet all the way
      // across, and a hole in it would show the drawn fill.
      expect(colourShare(band, PALETTE.asphalt), `${role} is drawn in road asphalt`).toBe(0);
      expect(colourShare(band, PALETTE.deepBlue), `${role} shows the drawn water fill`).toBe(
        0,
      );

      // What it *is* made of: the sheet's water, which is the teal hue with white crests.
      expect(colourShare(band, PALETTE.teal), `${role} has no water in it`).toBeGreaterThan(
        0.1,
      );
      expect(
        familyShare(band, [PALETTE.bone, PALETTE.white]),
        `${role} is a flat fill, not water with crests`,
      ).toBeGreaterThan(0.02);
    }
  });

  it('draws the shoulder as deck, not as water', async () => {
    const shoulder = await bandPixels(spec, 'shoulderLeft');
    const surface = await bandPixels(spec, 'surface');

    // Deck planks are warm: amber, rust and signal red. Measured on the shipped sheet the
    // shoulder window is 84 % warm and 1.6 % teal; the surface window it runs beside is 30 %
    // water. The comparison is the proof — the shoulder is not a second copy of the water.
    expect(
      familyShare(shoulder, [PALETTE.amber, PALETTE.rust, PALETTE.signalRed, PALETTE.sand]),
      'the shoulder window is not deck planking',
    ).toBeGreaterThan(0.8);

    const shoulderWater = familyShare(shoulder, WATER);
    expect(shoulderWater, 'the shoulder window is water, not deck').toBeLessThan(0.05);
    expect(shoulderWater).toBeLessThan(familyShare(surface, WATER) / 5);
  });

  it('puts the foam wake at the centre of the lane band', async () => {
    const band = await bandPixels(spec, 'dash');
    const foam = (pixel: Rgb): boolean =>
      matches(pixel, PALETTE.white) || matches(pixel, PALETTE.bone);

    const centroid = brightCentroid(band, foam);
    const centre = (band.width - 1) / 2;
    expect(
      Math.abs(centroid - centre),
      `foam centroid ${centroid.toFixed(2)} is not the centre ${centre} of a ${band.width} px band`,
    ).toBeLessThanOrEqual(1.5);

    expect(familyShare(band, [PALETTE.white, PALETTE.bone])).toBeGreaterThan(0.25);
  });
});

describe('city sheet cells', () => {
  const spec = specFor('city');

  it('measures the street strip it samples: a rust kerb edge and a centre dash outside the surface window', async () => {
    // The positive control. Cell 0 is a street cross-section, not a plain asphalt patch:
    // rust at column 10, the dashed centre line at column 18, the solid kerb line at
    // 26–28. If any of those moves, the surface window is sampling something else.
    const cell = await cellPixels(spec, 'surface');
    expect(cell.width).toBe(32);

    const column = (x: number): Raster => crop(cell, x, 0, 1, cell.height);
    expect(
      colourShare(column(10), PALETTE.rust),
      'column 10 is not the rust kerb edge',
    ).toBeGreaterThan(0.3);

    const dash = column(18);
    const dashPixels = Array.from({ length: dash.height }, (_, y) => rgbAt(dash, 0, y));
    expect(
      dashPixels.filter((pixel) => matches(pixel, PALETTE.steelLight)).length / dash.height,
      'column 18 is not the dashed centre line',
    ).toBeGreaterThan(0.3);

    expect(
      columnProfile(column(26))[0] ?? 0,
      'column 26 is not the kerb line',
    ).toBeGreaterThan(120);
  });

  it('samples the surface from asphalt only, between the kerb edge and the dash', async () => {
    const { sourceX, sourceWidth } = spec.windows.surface;
    const band = await bandPixels(spec, 'surface');

    for (let x = 0; x < band.width; x += 1) {
      for (let y = 0; y < band.height; y += 1) {
        const pixel = rgbAt(band, x, y);
        expect(
          matches(pixel, PALETTE.bone) || matches(pixel, PALETTE.white),
          `surface column ${sourceX + x} row ${y} is a painted marking`,
        ).toBe(false);
      }
    }

    // The paint next door is 90 luma (the dash) and 126+ (the kerb line); the window's own
    // columns measure 42–48, so nothing that reads as paint can leak in.
    for (const mean of columnProfile(band)) expect(mean).toBeLessThan(80);

    // The asphalt is the cell's `asphaltLight`, with the model's dark grain on top.
    expect(colourShare(band, PALETTE.asphaltLight)).toBeGreaterThan(0.7);
    expect(distinctColours(band)).toBeGreaterThanOrEqual(2);

    expect(sourceX).toBeGreaterThan(10);
    expect(sourceX + sourceWidth).toBeLessThanOrEqual(18);
  });

  it('puts the centre dash at the middle of the lane band', async () => {
    const band = await bandPixels(spec, 'dash');
    const marking = (pixel: Rgb): boolean => luma(pixel) > 110;

    const centroid = brightCentroid(band, marking);
    const centre = (band.width - 1) / 2;
    expect(
      Math.abs(centroid - centre),
      `dash centroid ${centroid.toFixed(2)} is not the centre ${centre} of a ${band.width} px band`,
    ).toBeLessThanOrEqual(1.5);

    // One column carries the paint, so repeating the band must not replay the line twice.
    const painted = Array.from({ length: band.width }, (_, x) =>
      Array.from({ length: band.height }, (_, y) => rgbAt(band, x, y)).filter(marking).length,
    ).filter((count) => count / band.height > 0.3);
    expect(painted).toHaveLength(1);

    expect(colourShare(band, PALETTE.steelLight)).toBeGreaterThan(0.03);
  });

  it('fills the terrain with plaza paving, not the drawn asphalt fill', async () => {
    const band = await bandPixels(spec, 'terrain');

    // The plaza tile is bone paving with steelLight grout; the drawn city theme fills the
    // terrain with `asphaltLight`, so either road colour appearing here is a fallback leak.
    expect(familyShare(band, [PALETTE.bone, PALETTE.steelLight])).toBeGreaterThan(0.95);
    expect(colourShare(band, PALETTE.bone)).toBeGreaterThan(0.5);
    expect(colourShare(band, PALETTE.asphalt)).toBe(0);
    expect(colourShare(band, PALETTE.asphaltLight)).toBe(0);
    expect(distinctColours(band)).toBeGreaterThanOrEqual(2);
  });
});

describe('tunnel sheet cells', () => {
  const spec = specFor('tunnel');

  it('measures the asphalt cell it samples: a white edge line, a centre dash and an amber hazard line', async () => {
    // The positive control. Cell 0 is a road cross-section: white edge at columns 1–2, the
    // dashed centre line at column 15, amber at 26–27. Everything the windows avoid.
    const cell = await cellPixels(spec, 'surface');
    expect(cell.width).toBe(32);

    const column = (x: number): Raster => crop(cell, x, 0, 1, cell.height);
    const white = Array.from({ length: 32 }, (_, y) => rgbAt(column(1), 0, y)).filter(
      (pixel) => matches(pixel, PALETTE.bone) || matches(pixel, PALETTE.white),
    );
    expect(white.length / 32, 'column 1 is not the white edge line').toBeGreaterThan(0.3);

    const dash = Array.from({ length: 32 }, (_, y) => rgbAt(column(15), 0, y)).filter(
      (pixel) => matches(pixel, PALETTE.bone) || matches(pixel, PALETTE.white),
    );
    expect(dash.length / 32, 'column 15 is not the dashed centre line').toBeGreaterThan(0.3);

    expect(colourShare(column(26), PALETTE.amber), 'column 26 is not the amber line').toBeGreaterThan(
      0.4,
    );
  });

  it('samples the surface from asphalt only, between the edge line and the dash', async () => {
    const { sourceX, sourceWidth } = spec.windows.surface;
    const band = await bandPixels(spec, 'surface');

    for (let x = 0; x < band.width; x += 1) {
      for (let y = 0; y < band.height; y += 1) {
        const pixel = rgbAt(band, x, y);
        expect(
          matches(pixel, PALETTE.bone) || matches(pixel, PALETTE.white),
          `surface column ${sourceX + x} row ${y} is a painted marking`,
        ).toBe(false);
      }
    }

    // The paint next door is 140–160 luma; the window's own columns measure 42–64.
    for (const mean of columnProfile(band)) expect(mean).toBeLessThan(80);

    expect(colourShare(band, PALETTE.asphaltLight)).toBeGreaterThan(0.6);
    expect(colourShare(band, PALETTE.steel)).toBeGreaterThan(0.2);

    expect(sourceX).toBeGreaterThan(2);
    expect(sourceX + sourceWidth).toBeLessThanOrEqual(15);
  });

  it('puts the centre dash at the middle of the lane band', async () => {
    const band = await bandPixels(spec, 'dash');
    const marking = (pixel: Rgb): boolean =>
      matches(pixel, PALETTE.bone) || matches(pixel, PALETTE.white);

    const centroid = brightCentroid(band, marking);
    const centre = (band.width - 1) / 2;
    expect(
      Math.abs(centroid - centre),
      `dash centroid ${centroid.toFixed(2)} is not the centre ${centre} of a ${band.width} px band`,
    ).toBeLessThanOrEqual(1.5);

    const painted = Array.from({ length: band.width }, (_, x) =>
      Array.from({ length: band.height }, (_, y) => rgbAt(band, x, y)).filter(marking).length,
    ).filter((count) => count / band.height > 0.4);
    expect(painted).toHaveLength(1);

    expect(familyShare(band, [PALETTE.bone, PALETTE.white])).toBeGreaterThan(0.02);
  });

  it('fills the terrain with the concrete wall, not the drawn void fill', async () => {
    const wall = await bandPixels(spec, 'terrain');
    const surface = await bandPixels(spec, 'surface');

    expect(familyShare(wall, [PALETTE.steelLight, PALETTE.steel])).toBeGreaterThan(0.8);
    expect(colourShare(wall, PALETTE.void), 'the tunnel wall is the drawn void fill').toBeLessThan(
      0.02,
    );
    // A wall face, not a floor: much brighter than the asphalt the lane carries.
    expect(meanLuma(wall)).toBeGreaterThan(90);
    expect(meanLuma(wall)).toBeGreaterThan(meanLuma(surface) * 1.8);
    expect(distinctColours(wall)).toBeGreaterThanOrEqual(5);
  });

  it('composes with the visibility overlay once, not twice', async () => {
    // WO-33 darkens the world with a single void rectangle at `1 - visibility`. The tunnel
    // sheet is sampled at its authored brightness and the tile layer is never tinted, so
    // that overlay is the only darkening. This pins the arithmetic: the road and the wall
    // survive one pass, and a second pass would sink both into the void fill.
    const visibility = LEVEL_PROFILES.tunnel.visibility;
    const alpha = 1 - visibility;
    const darkness = luma(paletteRgb(PALETTE.void));
    const once = (value: number): number => value * visibility + darkness * alpha;
    const twice = (value: number): number => once(value) * visibility + darkness * alpha;

    const road = meanLuma(await bandPixels(spec, 'surface'));
    const wall = meanLuma(await bandPixels(spec, 'terrain'));

    expect(
      once(road),
      'the sheet road is crushed by its own level darkness',
    ).toBeGreaterThan(26);
    expect(twice(road), 'a second darkening would erase the road').toBeLessThan(26);
    expect(once(wall), 'the sheet wall is not visible under the level darkness').toBeGreaterThan(
      45,
    );
    expect(twice(wall), 'a second darkening would erase the wall').toBeLessThan(45);
    expect(once(wall)).toBeGreaterThan(once(road) * 1.5);
  });
});
