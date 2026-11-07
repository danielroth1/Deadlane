# WO-25 — Pipeline: trim guard and nose-up orientation

Split out of WO-24 after its round 2 FAIL. WO-24's defects 1 (nose-down cells) and 4
(cell-2 trim collapse) cannot be fixed inside WO-24's whitelist; they are pipeline
defects and live here.

## Goal

Make `art:process` trim every enemy cell to the subject instead of to sheet-edge
specks, and give the pipeline an explicit, data-driven way to ship a cell nose-up.

## Files (whitelist)

- `pipeline/lib/image.ts`
- `pipeline/lib/image.test.ts`
- `pipeline/steps/process-slot.ts`
- `pipeline/work/art-0[3-6]-*/**` (regenerated output only — no hand edits)

## Measured problem

- The raw bottom-left quadrant of all four enemy sheets carries 1–3 stray pixels at
  `x = 0`, `y = 1022–1023`.
- `alphaBounds()` has no minimum-component guard, so the trim box stretches to
  352–405 px and the sprite ships at 89–95 px instead of 120 px.
- Measured cell-2 symmetry: art-03 5%, art-04 13%, art-05 17%, art-06 17%.
- art-03 cells 0–3 and art-04 cells 0 and 2 are nose-down (prow, lamps, blade at the
  bottom of the cell).

## Steps

1. Add a connected-component pass to `pipeline/lib/image.ts` that ignores components
   below a documented threshold (area and/or distance from the cell centre) when
   computing the trim box. A speck touching a cell edge must never set the bounds.
2. Add unit tests in `pipeline/lib/image.test.ts` with synthetic cells: a 2 px speck at
   `x = 0`, one at `y = max`, one enclosed, and a legitimate subject that touches the
   cell edge — the last one must still trim to the subject.
3. Add an explicit per-slot, per-cell orientation entry (data, in
   `pipeline/steps/process-slot.ts` or the slot record it already reads) that rotates a
   cell 180°. No auto-detection heuristics — the rotation is declared, and defaults to
   0°.
4. Declare the rotation for the nose-down cells: art-03 cells 0–3, art-04 cells 0 and 2.
5. Re-run `art:process` for art-03…06 and confirm no cell trims below 110 px of 120.

## Acceptance criteria

- [ ] A cell whose only edge-touching pixels are specks trims to its subject; a subject
      that genuinely touches the cell edge still trims to that edge (both covered by a
      unit test).
- [ ] After re-processing, all four sheets show cell-2 symmetry above 60% and no cell
      smaller than 110 px.
- [ ] Every cell in art-03 and art-04 is nose-up.
- [ ] `npm run test` and `npm run typecheck` pass.
- [ ] No hand-editing of `budget.json`, the atlas, or any cell PNG.

## Verification

```bash
npm run test && npm run typecheck
npm run art:process -- --slot art-03-enemy-ground-a
npm run art:process -- --slot art-04-enemy-ground-b
npm run art:process -- --slot art-05-enemy-air
npm run art:process -- --slot art-06-enemy-sea
```

## Out of scope

- Any fal call. No claim, no pull, no generation.
- Hot-pink residue and plumes (WO-26).
- `art:select`, `art:atlas`, `docs/ART_BIBLE.md` (WO-27).
