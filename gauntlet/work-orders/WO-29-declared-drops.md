# WO-29 — Pipeline: declare dropped cells instead of `rm`-ing them

Found during WO-27. art-03 cell 0 (nose-down motorcycle) and art-06 cell 1 (three-quarter
speedboat) were removed by a manual `rm` between `art:process` and `art:atlas`. Nothing
records that decision, so any re-run of `art:process` restores both cells and the bad
frames return.

## Goal

Make "this cell must never ship" declared registry data, enforced by the atlas builder.

## Files (whitelist)

- `pipeline/registry/slots.ts`
- `pipeline/steps/build-atlas.ts`

## Measured problem

`pipeline/steps/build-atlas.ts` includes a cell iff its PNG exists:

```ts
for (let index = 0; index < cols * rows; index += 1) {
  const cellPath = join(workDir, `cell-${index}.png`);
  if (!existsSync(cellPath)) continue;
  ...
}
```

`pipeline/steps/process-slot.ts` writes `cell-<i>.png` for every non-empty cell, so the
drop survives only as long as nobody reprocesses the slot. There is no `exclude`/`skip`
field on `SlotSpec`.

## Steps

1. Add `readonly droppedCells?: readonly number[]` to `SlotSpec` in
   `pipeline/registry/slots.ts`, documented as **row-major cell indexes that must never
   reach the atlas, even when the processed PNG exists**, and as data rather than an `rm`
   in the work directory.
2. Declare the two known drops:
   - `art-03-enemy-ground-a` → `droppedCells: [0]` (enforcer motorcycle: nose-down)
   - `art-06-enemy-sea` → `droppedCells: [1]` (speedboat hostile: three-quarter view)
3. `build-atlas.ts` skips a declared index before the `existsSync` check, so the frame is
   absent from the manifest and the composite regardless of what is in the work dir.
4. Comment the skip with the reason (declared drop vs. missing file are different things).

## Acceptance criteria

- [ ] `SlotSpec` carries `droppedCells` and both slots declare theirs.
- [ ] After reprocessing both slots — which restores `cell-0.png` (art-03) and
      `cell-1.png` (art-06) on disk — `npm run art:atlas` still emits **no**
      `enemy-ground-a/enforcer-motorcycle` and **no** `enemy-sea/speedboat-hostile` frame.
- [ ] `public/assets/assets.json` `.sprites` still has exactly 19 entries and the other
      17 are unchanged.
- [ ] `npm run art:validate` reports 0 off-palette pixels.
- [ ] `npm run typecheck` and `npm run test` pass.
- [ ] `pipeline/budget.json` is untouched; no cell PNG, sheet PNG or manifest is hand-edited
      (only `art:process` / `art:atlas` write them).

## Verification

```bash
npm run typecheck && npm run test
npm run art:process -- --slot art-03-enemy-ground-a
npm run art:process -- --slot art-06-enemy-sea
npm run art:atlas
npm run art:validate
node -e "const m=require('./public/assets/assets.json').sprites;const k=Object.keys(m);if(k.includes('enemy-ground-a/enforcer-motorcycle')||k.includes('enemy-sea/speedboat-hostile'))throw new Error('dropped frame leaked');console.log('sprites',k.length)"
```

Paste the raw output of each command, one command per block. Do not abridge stdout.

## Out of scope

- Any fal call. No claim, no pull, no generation.
- Re-packing, re-generating, or re-steering a sheet (WO-27 closed).
- The enemy frame-id lookup (WO-28).
- Changing `usableCells`, `meanPaletteDistance`, or any other metric.
