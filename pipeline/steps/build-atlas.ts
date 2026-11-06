import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { REPO_ROOT } from '../lib/ledger.js';
import type { SlotSpec } from '../registry/slots.js';
import { WORK_ROOT } from './process-slot.js';

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

export async function buildSheet({ slot, attempt }: BuildSheetInput): Promise<SheetManifest | null> {
  const workDir = join(WORK_ROOT, slot.id, `attempt-${attempt}`);
  if (!existsSync(workDir)) return null;

  const { cols, rows } = slot.grid;
  const size = slot.finalSize;
  const width = cols * size;
  const height = rows * size;

  const composites: sharp.OverlayOptions[] = [];
  const frames: Record<string, FrameRect> = {};

  for (let index = 0; index < cols * rows; index += 1) {
    const cellPath = join(workDir, `cell-${index}.png`);
    if (!existsSync(cellPath)) continue;

    const x = (index % cols) * size;
    const y = Math.floor(index / cols) * size;

    composites.push({
      input: await readFile(cellPath),
      left: x,
      top: y,
    });

    frames[frameId(slot, index)] = { x, y, w: size, h: size };
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
  };

  await writeFile(
    join(SHEETS_DIR, `${slot.id}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  return manifest;
}

export async function buildAtlas(
  entries: readonly { slot: SlotSpec; attempt: number }[],
): Promise<AssetsManifest> {
  const manifest: AssetsManifest = {
    generatedAt: new Date().toISOString(),
    sheets: {},
    sprites: {},
  };

  const sheets: Record<string, SheetManifest> = {};
  const sprites: AssetsManifest['sprites'] = {};

  for (const entry of entries) {
    const sheet = await buildSheet(entry);
    if (!sheet) continue;

    sheets[sheet.slot] = sheet;
    for (const [id, rect] of Object.entries(sheet.frames)) {
      sprites[id] = { sheet: sheet.slot, ...rect };
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
