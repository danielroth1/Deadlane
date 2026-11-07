# WO-26 — Pipeline: key enclosed chroma residue and drop enemy plumes

Split out of WO-24 after its round 2 FAIL. WO-24's defect 2 (hot-pink rotor fan) lives
in pipeline code, not in the work directory.

## Goal

Stop magenta-family residue that is *enclosed* by a subject outline from reaching the
palette, and stop exhaust plumes from shipping.

## Files (whitelist)

- `pipeline/lib/image.ts`
- `pipeline/lib/image.test.ts`
- `pipeline/steps/process-slot.ts`
- `pipeline/work/art-0[3-6]-*/**` (regenerated output only — no hand edits)

## Measured problem

- `chromaKey()` (WO-18) is a border-connected flood fill. art-05 cell 0 carries a solid
  `#ff2e63` rotor fan *enclosed* by the 1 px outline, so the key never reaches it and
  `quantize()` snaps it to palette index 15 (hot pink).
- art-05 cell 3 ships an amber afterburner plume. `docs/ART_BIBLE.md` §8 forbids
  exhaust plumes and reserves hot pink for the player.

## Steps

1. Add an enclosed-region pass in `pipeline/lib/image.ts`: a connected region that is
   fully inside the subject and whose mean colour is in the magenta family (hue roughly
   300–340°, saturation ≥ 0.5) is keyed like the border field.
2. Alternatively — or additionally — remap palette index 15 to index 8 after quantise,
   gated to enemy slots so the player's hot-pink accent is untouched.
3. Decide and implement plume handling: either key the plume region or refuse the cell,
   but never ship it. Document which in a code comment.
4. Unit tests: an enclosed magenta blob is removed; a legitimate hot-pink *player*
   accent survives; an amber plume region is removed or rejected.

## Acceptance criteria

- [ ] No pixel of palette index 15 remains in any art-05 or art-06 cell.
- [ ] `art:validate` reports 0 off-palette pixels.
- [ ] The player sheet is byte-identical after the change.
- [ ] `npm run test` and `npm run typecheck` pass.
- [ ] No hand-editing of `budget.json`, the atlas, or any cell PNG.

## Verification

```bash
npm run test && npm run typecheck
npm run art:process -- --slot art-05-enemy-air
npm run art:process -- --slot art-06-enemy-sea
npm run art:validate
```

## Out of scope

- Any fal call. No claim, no pull, no generation.
- Trim and orientation (WO-25).
- `art:select`, `art:atlas`, `docs/ART_BIBLE.md` (WO-27).
