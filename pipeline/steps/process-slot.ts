import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO_ROOT } from '../lib/ledger.js';
import type { SlotSpec } from '../registry/slots.js';
import {
  chromaKey,
  crop,
  decode,
  dropExhaustPlume,
  encode,
  fillCanvas,
  fitCentered,
  keyEnclosedMagenta,
  loadPalette,
  mirrorSymmetry,
  outline,
  paletteWithout,
  quantize,
  rotate180,
  seamError,
  subjectBounds,
  surfaceTileBounds,
  type Palette,
  type Raster,
} from '../lib/image.js';

/**
 * Cell orientation corrections, declared per slot and per cell.
 *
 * Some sheets come back with individual vehicles drawn nose-down. Which cells are wrong
 * is a property of the generated image, not something the pipeline can infer reliably —
 * auto-detecting "is this a front or a rear" is exactly the kind of heuristic that fails
 * on the one asset nobody looks at. So the fix is declared here as reviewable data, and
 * the default for every cell of every slot is 0°: no rotation unless someone wrote it
 * down.
 *
 * Values are row-major, matching `SlotSpec.cells`.
 */
const CELL_ROTATION_DEGREES: Readonly<Record<string, readonly (0 | 180)[]>> = {
  // WO-25: prow, lamps and blade sat at the bottom of every cell.
  'art-03-enemy-ground-a': [180, 180, 180, 180],
  // WO-25: cells 0 and 2 were nose-down; cells 1 and 3 already pointed up.
  'art-04-enemy-ground-b': [180, 0, 180, 0],
};

/** Declared rotation for one cell, defaulting to upright. */
export function cellRotationDegrees(slotId: string, index: number): 0 | 180 {
  return CELL_ROTATION_DEGREES[slotId]?.[index] ?? 0;
}

/**
 * Sheets whose art belongs to the hostile faction.
 *
 * Hostile sheets get three extra guards that the player sheet must not get, because the
 * player is allowed everything the enemy is not: the reserved hot-pink accent, and the
 * magenta glow it blooms into. Measured on the shipped sheets, the enclosed-residue band
 * holds 8,329 px of plate on art-05 and 1,187 px of legitimate tail-light bloom on the
 * player sheet, so the band means "residue" on a hostile and "the accent" on the player.
 */
const ENEMY_SLOT_IDS: ReadonlySet<string> = new Set([
  'art-03-enemy-ground-a',
  'art-04-enemy-ground-b',
  'art-05-enemy-air',
  'art-06-enemy-sea',
  'art-07-boss',
]);

export function isEnemySlot(slotId: string): boolean {
  return ENEMY_SLOT_IDS.has(slotId);
}

/**
 * The palette a cell is quantised against.
 *
 * Palette colour 15 (hot-pink) is reserved for the player, so it is removed from the
 * candidate set for hostile slots. Removing the entry rather than remapping after quantise
 * means a hostile red detail lands on the nearest *legal* colour instead of on a colour that
 * is reserved for the car.
 */
export function cellPalette(palette: Palette, slotId: string): Palette {
  if (!isEnemySlot(slotId)) return palette;
  const accent = palette.colors.find((entry) => entry.hex === palette.playerAccentKey);
  return accent ? paletteWithout(palette, [accent.index]) : palette;
}

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
  /**
   * Indexes of the cells that are full-bleed surface tiles, in ascending order.
   *
   * A tile sheet also carries object cells (an arrow, a sign) that are never repeated. The
   * shipped sheet cannot tell the two apart by inspection — both are rectangular patches
   * after framing — so the build records the decision here, and `art:validate` gates the
   * seam only on the frames named here.
   */
  readonly surfaceCells?: number[];
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

  // Hostile sheets carry two defects the border key cannot see: magenta residue fenced in by
  // the subject outline (WO-24 defect 2) and exhaust plumes hanging off the rear. Both are
  // keyed before slicing so that trim, fit and metrics all describe the art that ships.
  const base = chromaKey(source, palette.transparentKey);
  const keyed = isEnemySlot(slot.id) ? dropExhaustPlume(keyEnclosedMagenta(base)) : base;
  const quantisePalette = cellPalette(palette, slot.id);

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
  /** Indexes of full-bleed surface tiles: the only cells a seam can be measured on. */
  const tileFrames: number[] = [];
  const sizes: number[] = [];

  for (let index = 0; index < cols * rows; index += 1) {
    const col = index % cols;
    const row = Math.floor(index / cols);

    const sliced = crop(keyed, {
      left: col * cellW,
      top: row * cellH,
      width: cellW,
      height: cellH,
    });

    // Rotate before measuring so the trim box, the fit and the metrics all describe the
    // sprite the game will actually draw.
    const region = cellRotationDegrees(slot.id, index) === 180 ? rotate180(sliced) : sliced;

    // A tile cell whose art is a rectangular patch covering most of the cell is a surface:
    // it is drawn edge to edge and repeats. A cell holding an object drawn on transparency
    // (an arrow, a sign, a tunnel mouth) is framed like a sprite instead, because stretching
    // that object to fill a cell would not make it tile.
    const surfaceBox = slot.target === 'tile' ? surfaceTileBounds(region) : null;
    const isSurfaceTile = surfaceBox !== null;
    const bounds = surfaceBox ?? subjectBounds(region);
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

    // Surface tiles are the one target that must not be framed like a sprite. A sprite sits
    // alone in its cell, so `fitCentered`'s 6 % margin and `outline`'s 1 px ring help it
    // read. A tile is drawn beside copies of itself, so both of those become a lattice of
    // bare road between every cell: the margin is transparent, and the otherwise-desirable
    // outline traces the margin. Surfaces therefore fill their cell edge to edge and skip
    // the outline, at the cost of the trim box's slight aspect ratio.
    const canvas = isSurfaceTile
      ? fillCanvas(trimmed, slot.finalSize)
      : fitCentered(trimmed, slot.finalSize);

    const quantised = quantize(canvas, quantisePalette);
    const final = isSurfaceTile
      ? quantised.raster
      : outline(quantised.raster, quantisePalette);

    const framePath = join(workDir, `cell-${index}.png`);
    await encode(final, framePath);
    frames.set(index, framePath);

    const coverPixels = countOpaque(final);
    cells.push({
      index,
      name,
      empty: false,
      fill: coverPixels / (slot.finalSize * slot.finalSize),
      meanPaletteDistance: quantised.meanDistance,
      distinctColors: quantised.distinctColors,
      symmetry: slot.target === 'tile' ? 0 : mirrorSymmetry(final),
    });
    if (isSurfaceTile) tileFrames.push(index);
    sizes.push(Math.max(bounds.width, bounds.height));
  }

  const usable = cells.filter((c) => !c.empty);
  const usableCells = usable.length;
  const meanPaletteDistance = average(usable.map((c) => c.meanPaletteDistance));
  const meanSymmetry = average(usable.map((c) => c.symmetry));
  const meanDistinctColors = average(usable.map((c) => c.distinctColors));
  const sizeVariance = coefficientOfVariation(sizes);
  const meanSeamError = await measureSeam(frames, tileFrames);

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
    surfaceCells: slot.target === 'tile' ? tileFrames : undefined,
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

async function measureSeam(frames: Map<number, string>, tileFrames: readonly number[]): Promise<number> {
  if (tileFrames.length === 0) return 255;
  let sum = 0;
  for (const index of tileFrames) {
    const path = frames.get(index);
    if (!path) continue;
    sum += seamError(await decode(path));
  }
  return sum / tileFrames.length;
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
