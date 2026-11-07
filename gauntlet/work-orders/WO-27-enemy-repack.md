# WO-27 — Re-pack enemy sheets 03-06 and record measured yield

Split out of WO-24. This is the packing half of WO-24, unchanged in intent, now
running on a fixed pipeline (WO-25 trim/orientation, WO-26 chroma residue).

## Goal

Select, pack and measure the four enemy sheets from the images already paid for under
WO-23/WO-24, and record the honest yield per slot.

## Files (whitelist)

- `pipeline/work/art-03-enemy-ground-a/**`
- `pipeline/work/art-04-enemy-ground-b/**`
- `pipeline/work/art-05-enemy-air/**`
- `pipeline/work/art-06-enemy-sea/**`
- `pipeline/budget.json` (via the art CLIs only)
- `public/assets/**` (via `npm run art:atlas` only)
- `docs/ART_BIBLE.md` (only to record the measured yield)

## STATE

Four images, all already paid for and pulled:

| slot | attempt | seed | request id |
| --- | --- | --- | --- |
| art-03-enemy-ground-a | 2 | 673772911 | 01a1b835-a6bb-77e0-830c-d298da08393c |
| art-04-enemy-ground-b | 1 | 1472777606 | 01a1b836-288d-74a2-bf56-218537fa2713 |
| art-05-enemy-air | 1 | 701217366 | 01a1b836-7984-7961-961b-d5bae4f0f1d6 |
| art-06-enemy-sea | 1 | 1262471897 | 01a1b836-c94c-7380-ac7a-f2395c334730 |

`art-03` attempt 1 was rejected for baked-in text labels; do not select it. The slots are
`approved` from an earlier round — `npm run art:reopen -- --slot <id>` before
`art:select`. Never hand-edit `budget.json`.

## Steps

1. `art:reopen` then `art:select` each slot onto the attempt above.
2. `npm run art:atlas`.
3. Measure every cell: transparency, border-ring pixel count, nose-up, one whole subject.
4. Record the four `usableCells` numbers, the per-cell readings and any off-contract cell
   in `docs/ART_BIBLE.md` §5.

## Cell gate

A cell ships only if it is nose-up, axis-aligned top-down, one whole subject, has no
opaque border pixel and no hot-pink or plume pixel.

`art-06` cell 1 (two crossed hulls plus white spray, three-quarter view) is **known
off-contract**. If it still fails after WO-25/WO-26, do not ship it and do not
re-generate: record the slot as 3/4 and say so. Shipping a three-quarter cell, or
claiming 4/4 for a sheet that contains one, is a review failure.

## Acceptance criteria

- [ ] Each of the four slots has a selected attempt and a sheet in `public/assets/sheets/`.
- [ ] `npm run art:validate` passes with all sheets and 0 off-palette pixels.
- [ ] `npm run test`, `npm run typecheck`, `npm run build` and `npm run test:e2e` pass.
- [ ] The report states, per slot: `usableCells`, per-cell transparency, whether any cell
      has an opaque border pixel, and any cell that fails.
- [ ] `usableCells` agrees with the per-cell gate, and any slot below 4/4 is stated as such.
- [ ] No hand-editing of `budget.json` or the atlas.

## Verification

```bash
npm run art:process -- --slot art-03-enemy-ground-a
npm run art:process -- --slot art-04-enemy-ground-b
npm run art:process -- --slot art-05-enemy-air
npm run art:process -- --slot art-06-enemy-sea
npm run art:atlas && npm run art:validate
npm run test && npm run typecheck && npm run build && npm run test:e2e
```

## Out of scope

- Generating or re-generating anything: do not call any fal tool, do not claim or pull.
- Pipeline code changes (WO-25, WO-26).
- Changing slot definitions, the palette or the house style.
