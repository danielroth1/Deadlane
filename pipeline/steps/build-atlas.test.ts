import { describe, expect, it } from 'vitest';
import { droppedCellsForAttempt, includedCellIndexes, mergeShippedSheets } from './build-atlas';
import type { SheetManifest } from './build-atlas';
import { SLOTS } from '../registry/slots';

/**
 * A sheet cell can be absent from the atlas for two different reasons.
 *
 *  - The registry declared it dropped (`droppedCells` for the slot, or
 *    `droppedCellsByAttempt` for one attempt). That is a decision, and a permanent drop
 *    must survive any re-run of `art:process`, which rewrites every non-empty PNG.
 *  - The processed PNG is not on disk (`hasCell` returns false). That just means the cell
 *    has not been processed yet.
 *
 * `includedCellIndexes` is that whole rule, extracted from `buildSheet()` so it can be
 * pinned here without touching `pipeline/work/**` or `public/assets/sheets/**`.
 */

describe('includedCellIndexes', () => {
  it('excludes a declared drop even when the cell exists', () => {
    const included = includedCellIndexes({
      cols: 4,
      rows: 1,
      droppedCells: [1],
      hasCell: () => true,
    });

    expect(included).toEqual([0, 2, 3]);
  });

  it('excludes a missing cell and does not readmit it', () => {
    const included = includedCellIndexes({
      cols: 2,
      rows: 2,
      hasCell: (index) => index !== 2,
    });

    expect(included).toEqual([0, 1, 3]);
    expect(included).not.toContain(2);
  });

  it('returns cells that are neither dropped nor missing in ascending order', () => {
    const present = new Set([3, 0, 2]);

    const included = includedCellIndexes({
      cols: 2,
      rows: 2,
      hasCell: (index) => present.has(index),
    });

    expect(included).toEqual([0, 2, 3]);
  });

  it('includes every existing cell when droppedCells is omitted', () => {
    const included = includedCellIndexes({
      cols: 2,
      rows: 2,
      hasCell: () => true,
    });

    expect(included).toEqual([0, 1, 2, 3]);
  });

  it('yields [1, 2, 3] for a 2x2 grid with droppedCells: [0]', () => {
    const included = includedCellIndexes({
      cols: 2,
      rows: 2,
      droppedCells: [0],
      hasCell: () => true,
    });

    expect(included).toEqual([1, 2, 3]);
  });

  it('drops and misses together exclude both cells', () => {
    const included = includedCellIndexes({
      cols: 2,
      rows: 2,
      droppedCells: [0],
      hasCell: (index) => index !== 1,
    });

    expect(included).toEqual([2, 3]);
  });
});

/**
 * A drop belongs to the attempt that produced the cells, not to the slot forever.
 *
 * `art-08-civilians` attempt 1 supplied six usable vehicles out of sixteen cells; a retry
 * draws sixteen new cells and must be judged on those, not banned by attempt 1's rejects.
 */
describe('droppedCellsForAttempt', () => {
  it('applies a permanent drop to every attempt', () => {
    expect(droppedCellsForAttempt({ droppedCells: [0] }, 3)).toEqual([0]);
  });

  it('applies an attempt-scoped drop only to its own attempt', () => {
    const slot = { droppedCells: [0], droppedCellsByAttempt: { 1: [1, 2] } };

    expect(droppedCellsForAttempt(slot, 1)).toEqual([0, 1, 2]);
    expect(droppedCellsForAttempt(slot, 2)).toEqual([0]);
  });

  it('leaves every later art-08 attempt free of attempt-1 rejects', () => {
    const slot = SLOTS.find((s) => s.id === 'art-08-civilians');
    expect(slot, 'art-08-civilians must be registered').toBeDefined();
    if (!slot) return;

    expect(slot.droppedCells ?? []).toEqual([]);
    expect(droppedCellsForAttempt(slot, 1)).toHaveLength(10);
    expect(droppedCellsForAttempt(slot, 2)).toEqual([]);
  });
});

/**
 * Rebuilding the atlas must not delete art the game is already drawing.
 *
 * `art-08-civilians` shipped six frames, then the slot was reopened so a retry could be
 * claimed. The reopen hides the slot from `art:atlas`, and before this merge that also
 * erased its frames from `assets.json`.
 */
describe('mergeShippedSheets', () => {
  const sheet = (slot: string, frame: string): SheetManifest => ({
    slot,
    code: slot.replace(/^art-\d+-/, ''),
    cellSize: 32,
    cols: 4,
    rows: 4,
    image: `assets/sheets/${slot}.png`,
    frames: { [frame]: { x: 0, y: 0, w: 32, h: 32 } },
  });

  it('carries a shipped sheet forward when its slot is not rebuilt', () => {
    const shipped = { 'art-08-civilians': sheet('art-08-civilians', 'civilians/sedan') };
    const merged = mergeShippedSheets(
      [sheet('art-09-weapons-pickups', 'weapons-pickups/crate')],
      shipped,
      () => true,
    );

    expect(Object.keys(merged)).toEqual(['art-08-civilians', 'art-09-weapons-pickups']);
  });

  it('lets a rebuilt sheet replace the shipped one', () => {
    const merged = mergeShippedSheets(
      [sheet('art-08-civilians', 'civilians/sedan')],
      { 'art-08-civilians': sheet('art-08-civilians', 'civilians/taxi') },
      () => true,
    );

    expect(Object.keys(merged['art-08-civilians']?.frames ?? {})).toEqual(['civilians/sedan']);
  });

  it('drops a shipped sheet whose image is gone', () => {
    const merged = mergeShippedSheets(
      [],
      { 'art-08-civilians': sheet('art-08-civilians', 'civilians/sedan') },
      () => false,
    );

    expect(merged).toEqual({});
  });
});
