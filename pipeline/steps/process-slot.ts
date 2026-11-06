import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO_ROOT } from '../lib/ledger.js';
import type { SlotSpec } from '../registry/slots.js';
import {
  alphaBounds,
  chromaKey,
  crop,
  decode,
  encode,
  fitCentered,
  loadPalette,
  mirrorSymmetry,
  outline,
  quantize,
  seamError,
  type Raster,
} from '../lib/image.js';

/**
 * Slice → key → fit → quantise → outline → measure.
 *
 * This is where a generated image actually becomes game art. The model only provides
 * composition; scale, palette, outline and framing are decided here so that 20 sheets look
 * like one coherent game.
 */

export interface CellMetrics {
  readonly index: number;
  readonly name: string | null;
  readonly empty: boolean;
  /** Fraction of the cell's canvas the sprite covers, 0–1. */
  readonly fill: number;
  readonly meanPaletteDistance: number;
  readonly distinctColors: number;
  readonly symmetry: number;
}

export interface SlotMetrics {
  readonly slotId: string;
  readonly attempt: number;
  readonly sourcePath: string;
  readonly processedAt: string;
  readonly grid: { cols: number; rows: number };
  readonly finalSize: number;
  readonly cells: CellMetrics[];
  readonly summary: {
    readonly totalCells: number;
    readonly usableCells: number;
    readonly meanPaletteDistance: number;
    readonly sizeVariance: number;
    readonly meanSymmetry: number;
    readonly meanSeamError: number;
    readonly meanDistinctColors: number;
    /** 0–100. Higher is better. */
    readonly score: number;
  };
}

export interface ProcessResult {
  readonly metrics: SlotMetrics;
  readonly workDir: string;
  readonly frames: Map<number, string>;
}

export const WORK_ROOT = resolve(REPO_ROOT, 'pipeline', 'work');

export async function processSlot(
  slot: SlotSpec,
  attempt: number,
  sourcePath: string,
): Promise<ProcessResult> {
  const palette = await loadPalette();
  const source = await decode(sourcePath);
  const keyed = chromaKey(source, palette.transparentKey);

  const { cols, rows } = slot.grid;
  const cellW = Math.floor(keyed.width / cols);
  const cellH = Math.floor(keyed.height / rows);

  if (cellW < 8 || cellH < 8) {
    throw new Error(
      `Generated image is ${keyed.width}x${keyed.height}, too small for a ${cols}x${rows} grid.`,
    );
  }

  const workDir = join(WORK_ROOT, slot.id, `attempt-${attempt}`);
  await mkdir(workDir, { recursive: true });

  const cells: CellMetrics[] = [];
  const frames = new Map<number, string>();
  const sizes: number[] = [];

  for (let index = 0; index < cols * rows; index += 1) {
    const col = index % cols;
    const row = Math.floor(index / cols);

    const region = crop(keyed, {
      left: col * cellW,
      top: row * cellH,
      width: cellW,
      height: cellH,
    });

    const bounds = alphaBounds(region);
    const name = slot.cells?.[index] ?? null;

    if (!bounds) {
      cells.push({
        index,
        name,
        empty: true,
        fill: 0,
        meanPaletteDistance: 0,
        distinctColors: 0,
        symmetry: 0,
      });
      continue;
    }

    const trimmed = crop(region, bounds);
    const canvas = fitCentered(trimmed, slot.finalSize);

    const quantised = quantize(canvas, palette);
    const outlined = outline(quantised.raster, palette);

    const framePath = join(workDir, `cell-${index}.png`);
    await encode(outlined, framePath);
    frames.set(index, framePath);

    const coverPixels = countOpaque(outlined);
    cells.push({
      index,
      name,
      empty: false,
      fill: coverPixels / (slot.finalSize * slot.finalSize),
      meanPaletteDistance: quantised.meanDistance,
      distinctColors: quantised.distinctColors,
      symmetry: slot.target === 'tile' ? 0 : mirrorSymmetry(outlined),
    });
    sizes.push(Math.max(bounds.width, bounds.height));
  }

  const usable = cells.filter((c) => !c.empty);
  const usableCells = usable.length;
  const meanPaletteDistance = average(usable.map((c) => c.meanPaletteDistance));
  const meanSymmetry = average(usable.map((c) => c.symmetry));
  const meanDistinctColors = average(usable.map((c) => c.distinctColors));
  const sizeVariance = coefficientOfVariation(sizes);
  const meanSeamError = await measureSeam(frames);

  const expected = cols * rows;
  const score = computeScore({
    usableRatio: expected === 0 ? 0 : usableCells / expected,
    meanPaletteDistance,
    sizeVariance,
    meanSymmetry: slot.target === 'vehicle' ? meanSymmetry : 1,
    meanDistinctColors,
    meanSeamError: slot.target === 'tile' ? meanSeamError : 0,
    isTile: slot.target === 'tile',
  });

  const metrics: SlotMetrics = {
    slotId: slot.id,
    attempt,
    sourcePath: sourcePath.replace(`${REPO_ROOT}/`, ''),
    processedAt: new Date().toISOString(),
    grid: { cols, rows },
    finalSize: slot.finalSize,
    cells,
    summary: {
      totalCells: expected,
      usableCells,
      meanPaletteDistance,
      sizeVariance,
      meanSymmetry,
      meanSeamError,
      meanDistinctColors,
      score,
    },
  };

  await writeFile(join(workDir, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');

  return { metrics, workDir, frames };
}

function countOpaque(raster: Raster): number {
  let n = 0;
  for (let i = 3; i < raster.data.length; i += 4) {
    if (raster.data[i]! > 0) n += 1;
  }
  return n;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function coefficientOfVariation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  if (mean === 0) return 1;
  const variance = average(values.map((v) => (v - mean) ** 2));
  return Math.sqrt(variance) / mean;
}

async function measureSeam(frames: Map<number, string>): Promise<number> {
  if (frames.size === 0) return 255;
  let sum = 0;
  let n = 0;
  for (const path of frames.values()) {
    sum += seamError(await decode(path));
    n += 1;
  }
  return n === 0 ? 255 : sum / n;
}

interface ScoreInput {
  usableRatio: number;
  meanPaletteDistance: number;
  sizeVariance: number;
  meanSymmetry: number;
  meanDistinctColors: number;
  meanSeamError: number;
  isTile: boolean;
}

/**
 * Weighted 0–100 score used to pick the best attempt automatically.
 *
 * The weights encode what actually ruins a sheet: missing cells first, then off-palette
 * colour, then inconsistent sprite scale. Aesthetics are the reviewer's job; this function
 * only measures things a script can be certain about.
 */
export function computeScore(input: ScoreInput): number {
  const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

  const usability = clamp01(input.usableRatio);
  const paletteFidelity = clamp01(1 - input.meanPaletteDistance / 120);
  const scaleConsistency = clamp01(1 - input.sizeVariance);
  const symmetry = clamp01(input.meanSymmetry);
  const detail = clamp01(input.meanDistinctColors / 12);

  if (input.isTile) {
    const seam = clamp01(1 - input.meanSeamError / 64);
    return round2(
      100 *
        (usability * 0.3 + paletteFidelity * 0.25 + seam * 0.25 + scaleConsistency * 0.1 + detail * 0.1),
    );
  }

  return round2(
    100 *
      (usability * 0.32 +
        paletteFidelity * 0.22 +
        scaleConsistency * 0.14 +
        symmetry * 0.16 +
        detail * 0.16),
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Where a processed attempt's metrics live. */
export function metricsPath(slotId: string, attempt: number): string {
  return join(WORK_ROOT, slotId, `attempt-${attempt}`, 'metrics.json');
}

export function attemptExists(slotId: string, attempt: number): boolean {
  return existsSync(metricsPath(slotId, attempt));
}
