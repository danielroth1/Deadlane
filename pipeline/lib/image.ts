import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REPO_ROOT } from './ledger.js';

/**
 * Raster helpers used by the asset pipeline.
 *
 * Everything here is deliberately deterministic: no smoothing, no resampling filters, no
 * interpolation. A sprite must be byte-identical when the same source is processed twice,
 * because `art:validate` and visual review both depend on reproducibility.
 */

export interface Raster {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  readonly data: Buffer;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PaletteEntry {
  readonly index: number;
  readonly hex: string;
  readonly name: string;
  readonly rgb: readonly [number, number, number];
}

export interface Palette {
  readonly colors: readonly PaletteEntry[];
  readonly transparentKey: string;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export async function loadPalette(): Promise<Palette> {
  const path = resolve(REPO_ROOT, 'pipeline', 'registry', 'palette.json');
  const raw = JSON.parse(await readFile(path, 'utf8')) as {
    colors: { index: number; hex: string; name: string }[];
    reserved: { transparentKey: string };
  };
  return {
    colors: raw.colors.map((c) => ({
      index: c.index,
      hex: c.hex.toLowerCase(),
      name: c.name,
      rgb: hexToRgb(c.hex),
    })),
    transparentKey: raw.reserved.transparentKey,
  };
}

/* --------------------------------- decoding -------------------------------- */

export async function decode(path: string): Promise<Raster> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    // ensureAlpha guarantees 4 channels, but be defensive about interleaving surprises.
    data,
  };
}

export async function encode(raster: Raster, path: string): Promise<void> {
  await sharp(raster.data, {
    raw: { width: raster.width, height: raster.height, channels: 4 },
  })
    .png({ compressionLevel: 9, palette: false })
    .toFile(path);
}

/* ------------------------------- manipulation ------------------------------ */

export function crop(raster: Raster, box: Box): Raster {
  const out = Buffer.alloc(box.width * box.height * 4);
  for (let y = 0; y < box.height; y += 1) {
    const srcStart = ((box.top + y) * raster.width + box.left) * 4;
    raster.data.copy(out, y * box.width * 4, srcStart, srcStart + box.width * 4);
  }
  return { width: box.width, height: box.height, data: out };
}

/**
 * Turn the flat generation background into transparency.
 *
 * Magenta is used because it is provably absent from the locked palette, so a chroma key
 * can never eat a legitimate sprite pixel. Pure white is accepted as a fallback for models
 * that ignore the background instruction, but it is a review failure if it happens often.
 */
export function chromaKey(raster: Raster, keyHex: string, tolerance = 90): Raster {
  const key = hexToRgb(keyHex);
  const out = Buffer.from(raster.data);

  for (let i = 0; i < out.length; i += 4) {
    const r = out[i]!;
    const g = out[i + 1]!;
    const b = out[i + 2]!;
    const dKey = Math.abs(r - key[0]) + Math.abs(g - key[1]) + Math.abs(b - key[2]);
    const dWhite = Math.abs(r - 255) + Math.abs(g - 255) + Math.abs(b - 255);

    if (dKey < tolerance || dWhite < 24) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    }
  }
  return { width: raster.width, height: raster.height, data: out };
}

/** Tight box around pixels above an alpha threshold, or null when the cell is empty. */
export function alphaBounds(raster: Raster, threshold = 8): Box | null {
  let minX = raster.width;
  let minY = raster.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (raster.data[(y * raster.width + x) * 4 + 3]! > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Nearest-neighbour scale-to-fit inside a square canvas, centred.
 *
 * Aspect ratio is preserved so a long car does not become a fat car. Sampling is
 * point-sampled from the centre of each destination pixel, which keeps hard edges hard.
 */
export function fitCentered(source: Raster, canvasSize: number, maxFill = 0.94): Raster {
  const limit = Math.floor(canvasSize * maxFill);
  const scale = Math.min(limit / source.width, limit / source.height);
  const targetW = Math.max(1, Math.round(source.width * scale));
  const targetH = Math.max(1, Math.round(source.height * scale));

  const out = Buffer.alloc(canvasSize * canvasSize * 4);
  const offX = Math.floor((canvasSize - targetW) / 2);
  const offY = Math.floor((canvasSize - targetH) / 2);

  for (let y = 0; y < targetH; y += 1) {
    const sy = Math.min(source.height - 1, Math.floor((y * source.height) / targetH));
    for (let x = 0; x < targetW; x += 1) {
      const sx = Math.min(source.width - 1, Math.floor((x * source.width) / targetW));
      const si = (sy * source.width + sx) * 4;
      const di = ((offY + y) * canvasSize + offX + x) * 4;
      out[di] = source.data[si]!;
      out[di + 1] = source.data[si + 1]!;
      out[di + 2] = source.data[si + 2]!;
      out[di + 3] = source.data[si + 3]!;
    }
  }

  return { width: canvasSize, height: canvasSize, data: out };
}

/* -------------------------------- quantising ------------------------------- */

function nearestPaletteIndex(
  r: number,
  g: number,
  b: number,
  colors: readonly PaletteEntry[],
): { index: number; distance: number } {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const c of colors) {
    // Weighted Euclidean distance approximates perceived difference better than plain RGB.
    const dr = r - c.rgb[0];
    const dg = g - c.rgb[1];
    const db = b - c.rgb[2];
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = c.index;
    }
  }
  return { index: bestIndex, distance: Math.sqrt(bestDistance) };
}

export interface QuantizeResult {
  readonly raster: Raster;
  /** Mean distance from the source colour to its palette slot, 0–441. Lower is better. */
  readonly meanDistance: number;
  /** Distinct palette indices actually used. A sprite using one colour is a failure. */
  readonly distinctColors: number;
}

/**
 * Force every pixel onto the locked palette.
 *
 * Order is important: quantise *after* downscaling so the palette is applied to final
 * pixels, and *without* dithering because dithering is what makes AI pixel art look noisy.
 */
export function quantize(source: Raster, palette: Palette, alphaThreshold = 90): QuantizeResult {
  const out = Buffer.alloc(source.width * source.height * 4);
  const used = new Set<number>();
  let distanceSum = 0;
  let counted = 0;

  for (let i = 0; i < source.data.length; i += 4) {
    const a = source.data[i + 3]!;
    if (a < alphaThreshold) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }

    const r = source.data[i]!;
    const g = source.data[i + 1]!;
    const b = source.data[i + 2]!;
    const { index, distance } = nearestPaletteIndex(r, g, b, palette.colors);
    const entry = palette.colors.find((c) => c.index === index)!;

    out[i] = entry.rgb[0];
    out[i + 1] = entry.rgb[1];
    out[i + 2] = entry.rgb[2];
    out[i + 3] = 255;

    used.add(index);
    distanceSum += distance;
    counted += 1;
  }

  return {
    raster: { width: source.width, height: source.height, data: out },
    meanDistance: counted === 0 ? 0 : distanceSum / counted,
    distinctColors: used.size,
  };
}

/**
 * Draw a 1px inner outline in the void colour.
 *
 * Inner rather than outer so the sprite keeps its cell footprint — an outer ring would
 * clip against neighbouring cells at atlas time and change the sprite's apparent size
 * between sheets.
 */
export function outline(raster: Raster, palette: Palette, hex = '#0b0d10'): Raster {
  const voidEntry = palette.colors.find((c) => c.hex === hex.toLowerCase());
  const rgb = voidEntry ? voidEntry.rgb : hexToRgb(hex);
  const out = Buffer.from(raster.data);
  const { width, height } = raster;

  const opaque = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return raster.data[(y * width + x) * 4 + 3]! > 0;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (!opaque(x, y)) continue;
      const edge = !opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1);
      if (edge) {
        out[i] = rgb[0];
        out[i + 1] = rgb[1];
        out[i + 2] = rgb[2];
        out[i + 3] = 255;
      }
    }
  }

  return { width, height, data: out };
}

/** Colour histogram in palette space, used by the scorer. */
export function paletteHistogram(raster: Raster, palette: Palette): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < raster.data.length; i += 4) {
    if (raster.data[i + 3]! < 8) continue;
    const hex = rgbToHex(raster.data[i]!, raster.data[i + 1]!, raster.data[i + 2]!).toLowerCase();
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return counts;
}

/**
 * Left/right mirror overlap, 0–1.
 *
 * Vehicles are near-symmetric from above, so this is a cheap, objective way to catch a
 * sheet where the model drew warped or half-missing cars.
 */
export function mirrorSymmetry(raster: Raster): number {
  const { width, height, data } = raster;
  let matching = 0;
  let opaque = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = data[(y * width + x) * 4 + 3]! > 8;
      const right = data[(y * width + (width - 1 - x)) * 4 + 3]! > 8;
      if (left || right) {
        opaque += 1;
        if (left === right) matching += 1;
      }
    }
  }

  return opaque === 0 ? 0 : matching / opaque;
}

/** Mean absolute difference between opposing edges, 0–255. Lower means more tileable. */
export function seamError(raster: Raster): number {
  const { width, height, data } = raster;
  let vertical = 0;
  let horizontal = 0;

  for (let y = 0; y < height; y += 1) {
    for (let c = 0; c < 3; c += 1) {
      const l = data[(y * width + 0) * 4 + c]!;
      const r = data[(y * width + width - 1) * 4 + c]!;
      vertical += Math.abs(l - r);
    }
  }

  for (let x = 0; x < width; x += 1) {
    for (let c = 0; c < 3; c += 1) {
      const t = data[(0 * width + x) * 4 + c]!;
      const b = data[((height - 1) * width + x) * 4 + c]!;
      horizontal += Math.abs(t - b);
    }
  }

  const samples = height * 3 + width * 3;
  return samples === 0 ? 0 : (vertical + horizontal) / samples;
}
