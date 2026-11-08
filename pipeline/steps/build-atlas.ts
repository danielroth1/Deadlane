import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { REPO_ROOT } from '../lib/ledger.js';
import type { SlotSpec } from '../registry/slots.js';
import { WORK_ROOT, metricsPath } from './process-slot.js';

/**
 * Compose selected cell sprites into the sprite sheets the game loads.
 *
 * One sheet per slot rather than one giant atlas: slots have different cell sizes (32, 64,
 * 128), and keeping them separate means a failed slot can be swapped without touching the
 * rest. Phaser loads them as normal spritesheets.
 */

export interface FrameRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface SheetManifest {
  readonly slot: string;
  readonly code: string;
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  readonly image: string;
  readonly frames: Record<string, FrameRect>;
  /**
   * Frame ids that are full-bleed surface tiles, for tile slots only.
   *
   * The seam gate in `art:validate` uses this list: a frame named here is repeated by the
   * game and must wrap, while an object cell on the same sheet (an arrow, a sign) is drawn
   * once on transparency and is not tiled. The distinction is decided at process time and
   * carried here because it cannot be recovered reliably from the packed sheet.
   */
  readonly tiles?: string[];
}

export interface AssetsManifest {
  readonly generatedAt: string;
  readonly sheets: Record<string, SheetManifest>;
  readonly sprites: Record<string, { sheet: string; x: number; y: number; w: number; h: number }>;
}

export const ASSETS_DIR = resolve(REPO_ROOT, 'public', 'assets');
export const SHEETS_DIR = join(ASSETS_DIR, 'sheets');
export const ASSETS_MANIFEST = join(ASSETS_DIR, 'assets.json');

/** `art-03-enemy-ground-a` → `enemy-ground-a`, used to namespace frame ids. */
export function slotCode(slotId: string): string {
  return slotId.replace(/^art-\d+-/, '');
}

export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function frameId(slot: SlotSpec, index: number): string {
  const label = slot.cells?.[index];
  const cell = label ? slugify(label) : `cell-${index}`;
  return `${slotCode(slot.id)}/${cell}`;
}

export interface BuildSheetInput {
  readonly slot: SlotSpec;
  readonly attempt: number;
}

export interface IncludedCellIndexesInput {
  readonly cols: number;
  readonly rows: number;
  readonly droppedCells?: readonly number[];
  readonly hasCell: (index: number) => boolean;
}

/**
 * The cell-selection rule for a sheet, as a pure function so the drop gate can be tested
 * without touching the work or output directories.
 *
 * A declared drop is a decision, not an accident: the cell is excluded even when the
 * processed PNG is sitting in the work directory. That is different from a missing file
 * (`hasCell` returning false), which just means the cell has not been processed yet.
 *
 * Indexes are returned in ascending row-major order.
 */
export function includedCellIndexes({
  cols,
  rows,
  droppedCells,
  hasCell,
}: IncludedCellIndexesInput): number[] {
  const dropped = droppedCells ?? [];
  const included: number[] = [];

  for (let index = 0; index < cols * rows; index += 1) {
    if (dropped.includes(index)) continue;
    if (!hasCell(index)) continue;
    included.push(index);
  }

  return included;
}

/**
 * The cells to drop when packing one attempt.
 *
 * `SlotSpec.droppedCells` is a permanent decision about the slot; `droppedCellsByAttempt`
 * records the rejects of a single attempt. Both apply, and only the second one is bound to
 * the attempt number — which is the point: attempt 1's rejects must not ban the subjects a
 * later attempt exists to supply.
 */
export function droppedCellsForAttempt(
  slot: Pick<SlotSpec, 'droppedCells' | 'droppedCellsByAttempt'>,
  attempt: number,
): readonly number[] {
  return [...(slot.droppedCells ?? []), ...(slot.droppedCellsByAttempt?.[attempt] ?? [])];
}

export async function buildSheet({ slot, attempt }: BuildSheetInput): Promise<SheetManifest | null> {
  const workDir = join(WORK_ROOT, slot.id, `attempt-${attempt}`);
  if (!existsSync(workDir)) return null;

  const { cols, rows } = slot.grid;
  const size = slot.finalSize;
  const width = cols * size;
  const height = rows * size;

  const composites: sharp.OverlayOptions[] = [];
  const frames: Record<string, FrameRect> = {};
  const tiles: string[] = [];
  const surfaceCells = new Set(readSurfaceCells(slot, attempt));

  const included = includedCellIndexes({
    cols,
    rows,
    droppedCells: droppedCellsForAttempt(slot, attempt),
    hasCell: (index) => existsSync(join(workDir, `cell-${index}.png`)),
  });

  for (const index of included) {
    const cellPath = join(workDir, `cell-${index}.png`);
    const x = (index % cols) * size;
    const y = Math.floor(index / cols) * size;

    composites.push({
      input: await readFile(cellPath),
      left: x,
      top: y,
    });

    const id = frameId(slot, index);
    frames[id] = { x, y, w: size, h: size };
    if (surfaceCells.has(index)) tiles.push(id);
  }

  if (composites.length === 0) return null;

  await mkdir(SHEETS_DIR, { recursive: true });

  const imageName = `${slot.id}.png`;
  const canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  await canvas
    .composite(composites)
    .png({ compressionLevel: 9, palette: false })
    .toFile(join(SHEETS_DIR, imageName));

  const manifest: SheetManifest = {
    slot: slot.id,
    code: slotCode(slot.id),
    cellSize: size,
    cols,
    rows,
    image: `assets/sheets/${imageName}`,
    frames,
    ...(tiles.length > 0 ? { tiles } : {}),
  };

  await writeFile(
    join(SHEETS_DIR, `${slot.id}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  return manifest;
}

/**
 * Cells the processed attempt declared as full-bleed surface tiles.
 *
 * Returns an empty list when there is no metrics file (a cell set packed by hand) so an
 * older work directory still builds; the seam gate then simply has nothing to check.
 */
function readSurfaceCells(slot: SlotSpec, attempt: number): readonly number[] {
  const path = metricsPath(slot.id, attempt);
  if (!existsSync(path)) return [];
  try {
    const metrics = JSON.parse(readFileSync(path, 'utf8')) as { surfaceCells?: number[] };
    return metrics.surfaceCells ?? [];
  } catch {
    return [];
  }
}

/**
 * Merge the sheets rebuilt this run with sheets that have already shipped.
 *
 * A slot can be approved, packed into `public/assets`, and later reopened to claim a
 * retry — `art-08-civilians` was reopened exactly that way after WO-40. A rebuild only
 * packs approved slots, so without this merge the reopen would silently delete frames the
 * game is already drawing. A freshly built sheet always replaces the shipped one, and a
 * shipped sheet whose image is gone from disk is not carried over.
 */
export function mergeShippedSheets(
  built: readonly SheetManifest[],
  shipped: Record<string, SheetManifest>,
  imageExists: (sheet: SheetManifest) => boolean,
): Record<string, SheetManifest> {
  const merged: Record<string, SheetManifest> = {};

  for (const [slotId, sheet] of Object.entries(shipped)) {
    if (imageExists(sheet)) merged[slotId] = sheet;
  }
  for (const sheet of built) {
    merged[sheet.slot] = sheet;
  }

  return merged;
}

export interface BuildAtlasOptions {
  /** Sheets from the previous manifest, kept for slots this run does not rebuild. */
  readonly carryOver?: Record<string, SheetManifest>;
}

export async function buildAtlas(
  entries: readonly { slot: SlotSpec; attempt: number }[],
  options: BuildAtlasOptions = {},
): Promise<AssetsManifest> {
  const manifest: AssetsManifest = {
    generatedAt: new Date().toISOString(),
    sheets: {},
    sprites: {},
  };

  const built: SheetManifest[] = [];

  for (const entry of entries) {
    const sheet = await buildSheet(entry);
    if (!sheet) continue;
    built.push(sheet);
  }

  const sheets = mergeShippedSheets(built, options.carryOver ?? {}, (sheet) =>
    existsSync(resolve(REPO_ROOT, 'public', sheet.image)),
  );

  const sprites: AssetsManifest['sprites'] = {};
  for (const [slotId, sheet] of Object.entries(sheets)) {
    for (const [id, rect] of Object.entries(sheet.frames)) {
      sprites[id] = { sheet: slotId, ...rect };
    }
  }

  await mkdir(ASSETS_DIR, { recursive: true });
  const final: AssetsManifest = { ...manifest, sheets, sprites };
  await writeFile(ASSETS_MANIFEST, `${JSON.stringify(final, null, 2)}\n`, 'utf8');
  return final;
}

export async function loadAssetsManifest(): Promise<AssetsManifest | null> {
  if (!existsSync(ASSETS_MANIFEST)) return null;
  return JSON.parse(await readFile(ASSETS_MANIFEST, 'utf8')) as AssetsManifest;
}
