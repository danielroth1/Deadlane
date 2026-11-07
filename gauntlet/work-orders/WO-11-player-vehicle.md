# WO-11 — Art slot 02: player vehicle sheet (go/no-go gate)

## Goal

Produce the 4×4 player vehicle sheet, and use it to decide whether packed sheets are viable
for this model before the remaining ~76 images are spent.

**This order is a gate.** If it fails, stop and re-plan the slot allocation — do not
continue to WO-13.

## Context

The whole art plan assumes one image yields about ten usable sprites. That assumption is
cheap to test here and expensive to discover later. `art:process` reports
`usableCells / totalCells`; that number is the gate.

## Files (whitelist)

- `pipeline/work/art-02-player-vehicle/**`
- `pipeline/budget.json` (via the art CLIs only)
- `public/assets/**` (via `npm run art:atlas` only)
- `docs/ART_BIBLE.md` (only to record the decision)

## Steps

1. `npm run art:claim -- --slot art-02-player-vehicle`
2. `run_model` with the printed arguments, one image.
3. `npm run art:pull -- ... --attempt <n> ...`
4. `npm run art:process -- --slot art-02-player-vehicle`
5. Read the reported `usable cells N/16`.
6. Retry only if fewer than 6 cells are usable **and** the failure is diagnosable from the
   metrics (empty cells vs off-palette vs inconsistent scale).
7. `npm run art:select` and `npm run art:atlas`.

## Acceptance criteria

- [ ] At least **3 of 4** cells are usable. This is the gate. (Amended from 6 of 16 when the
      contract moved to 2×2 @128 px — WO-21.)
- [ ] The interceptor is axis-aligned and points up in every cell.
- [ ] No cell straddles a boundary (the slicer would have produced two half-cars).
- [ ] Hostile red is absent; hot pink tail lights are present.
- [ ] `npm run art:validate` passes.
- [ ] In game, the player sprite is visibly the generated one, not the placeholder.

## Verification

```bash
npm run art:process -- --slot art-02-player-vehicle
npm run art:select -- --slot art-02-player-vehicle
npm run art:atlas && npm run art:validate
npm run dev    # drive the car, confirm the sprite changed
```

## If the gate fails

Record the measured yield in the verdict and stop. The human then chooses between:

- **A:** switch the 4×4 contract to 2×2 (four sprites per image, ~40 slots, more consistency)
- **B:** generate individual hero sprites for vehicles and keep sheets for tiles only
- **C:** keep 4×4 and accept placeholder fallbacks for unsheeted cells

Do not choose on your own: re-allocating the budget is a human decision.

## Out of scope

- Editing the grid contract.
- Generating other slots.
