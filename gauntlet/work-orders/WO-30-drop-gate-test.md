# WO-30 — Pipeline test: a declared drop beats an existing cell PNG

Reviewer suggestion from WO-29 round 1. The drop gate is currently proven only by running
`art:process` + `art:atlas` by hand; nothing in `npm run test` fails if the gate is
deleted.

## Goal

Pin the `droppedCells` behaviour with a unit test so the gate cannot regress silently.

## Files (whitelist)

- `pipeline/steps/build-atlas.ts`
- `pipeline/steps/build-atlas.test.ts` (new)

## Problem

`buildSheet()` reads and writes real work directories and the sheet output directory via
module-level constants, so it cannot be exercised in a test without touching
`pipeline/work/**` and `public/assets/sheets/**`. There is no seam to test.

## Steps

1. Extract the cell-selection rule from `buildSheet()` into a small exported pure function
   in `pipeline/steps/build-atlas.ts`, for example:

   ```ts
   export function includedCellIndexes(input: {
     readonly cols: number;
     readonly rows: number;
     readonly droppedCells?: readonly number[];
     readonly hasCell: (index: number) => boolean;
   }): number[]
   ```

   `buildSheet()` keeps its current behaviour by calling it, so nothing about the shipped
   output changes.
2. Add `pipeline/steps/build-atlas.test.ts` (vitest, same style as
   `pipeline/lib/image.test.ts`) covering:
   - a declared drop is excluded even when `hasCell` returns `true` for it;
   - a missing cell is excluded and stays out;
   - cells that are neither dropped nor missing are returned in ascending order;
   - `droppedCells` omitted behaves exactly as before (all existing cells included);
   - a 2x2 grid with `droppedCells: [0]` yields `[1, 2, 3]`.
3. Do not change any prompt, slot declaration, metric, or generated artefact.

## Acceptance criteria

- [ ] The pure function exists, is exported, and `buildSheet()` calls it.
- [ ] `npm run test` passes and reports at least 5 new tests in `build-atlas.test.ts`.
- [ ] `npm run typecheck` passes.
- [ ] `npm run art:atlas` regenerates `public/assets/assets.json` with the same 19 sprite
      ids and no change other than `generatedAt`.
- [ ] `npm run art:validate` still passes.
- [ ] No `any`, no non-null assertions, no skipped tests.

## Verification

```bash
npm run typecheck && npm run test
npm run art:atlas
npm run art:validate
node -e "const k=Object.keys(require('./public/assets/assets.json').sprites);console.log('sprites',k.length)"
```

Paste the raw output of each command, one command per block.

## Out of scope

- Any fal call.
- Changing what the game or the pipeline ships.
- The `usableCells` metric.
