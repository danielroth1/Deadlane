# WO-24 — Enemy sheets 03-06 at 2×2

## Goal

Process, select and pack the four enemy sheets generated under the 2×2 @128 contract, and
record the measured yield per slot.

## Context

WO-23 re-scoped `art-03`…`art-06` to 2×2 @128 with axis-aligned subjects only. The
orchestrator has already claimed, generated and pulled one image per slot (see STATE). This
order turns them into game assets and measures what came back.

## Files (whitelist)

- `pipeline/work/art-03-enemy-ground-a/**`
- `pipeline/work/art-04-enemy-ground-b/**`
- `pipeline/work/art-05-enemy-air/**`
- `pipeline/work/art-06-enemy-sea/**`
- `pipeline/budget.json` (via the art CLIs only)
- `public/assets/**` (via `npm run art:atlas` only)
- `docs/ART_BIBLE.md` (only to record the measured yield)

## Steps

1. `npm run art:process -- --slot <id>` for each of the four slots.
2. Read `usable cells N/4`, then check each cell PNG against: background removed, one whole
   subject, no opaque pixel on any cell border, nose up.
3. `npm run art:select -- --slot <id> --attempt <n>` — the only attempt with a usable cell set;
   say so if a slot's best attempt is below 3/4.
4. `npm run art:atlas`.
5. Record the four `usableCells` numbers and any off-contract cell in `docs/ART_BIBLE.md` §5.

## Acceptance criteria

- [ ] Each of the four slots has a selected attempt and a sheet in `public/assets/sheets/`.
- [ ] `npm run art:validate` passes with all sheets.
- [ ] `npm run test`, `npm run typecheck`, `npm run build` and `npm run test:e2e` pass.
- [ ] The report states, per slot: `usableCells`, per-cell transparency, whether any cell has
      an opaque border pixel, and any cell that fails (side-on subject, baked-in text, spray,
      exhaust plume).
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
- Changing slot definitions, the palette or the house style.

## STATE

Four images, all already paid for and pulled:

| slot | attempt | seed | request id |
| --- | --- | --- | --- |
| art-03-enemy-ground-a | 2 | 673772911 | 01a1b835-a6bb-77e0-830c-d298da08393c |
| art-04-enemy-ground-b | 1 | 1472777606 | 01a1b836-288d-74a2-bf56-218537fa2713 |
| art-05-enemy-air | 1 | 701217366 | 01a1b836-7984-7961-961b-d5bae4f0f1d6 |
| art-06-enemy-sea | 1 | 1262471897 | 01a1b836-c94c-7380-ac7a-f2395c334730 |

`art-03` attempt 1 was rejected for baked-in text labels and is in the ledger at 8/120; do not
select it. `art-06` attempt 1 appears to contain one cell with two crossed hulls and white
spray — measure it rather than assuming.
