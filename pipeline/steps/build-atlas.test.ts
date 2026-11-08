import { describe, expect, it } from 'vitest';
import { includedCellIndexes } from './build-atlas';

/**
 * A sheet cell can be absent from the atlas for two different reasons.
 *
 *  - The registry declared it dropped (`droppedCells`). That is a decision, and it must
 *    survive any re-run of `art:process`, which rewrites every non-empty PNG.
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
