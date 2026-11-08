# WO-37 — Every enemy resolves to a shipped frame

## Goal

Four of nine enemies still draw a placeholder (`enforcer`, `speedboat`, `jetski`,
`dredger` declare no `art`), while shipped frames sit unused: `enemy-air/*` is never drawn
at all, and `enemy-ground-a/division-sports-coupe`,
`enemy-ground-b/ram-bulldozer`, `enemy-ground-b/missile-trailer`,
`enemy-water/hovercraft` and `enemy-water/torpedo-boat` are never requested.

This order needs **zero new images**.

## Hard constraints

- `art-03` cell 0 (`enforcer motorcycle`) and `art-06` cell 1 (`speedboat hostile`) are
  declared `droppedCells` because they break the nose-up contract. **Never** map to them and
  never remove the drop declaration.
- `src/content/content.test.ts` pins "exactly 5 enemies declare `art`". Update that
  expectation deliberately as part of this order; do not weaken the test to a count that
  can pass with a broken id.

## Steps (hints, not limits)

1. Map each placeholder enemy to the closest shipped frame that actually exists in
   `public/assets/assets.json`. If no shipped frame is a fair fit (the motorcycle and the
   hostile speedboat cells were dropped), leave that enemy on the placeholder and say why
   in the order report — do not force a bad mapping.
2. Use the air frames: add air units on `enemy-air/attack-helicopter` and
   `enemy-air/hunter-drone` with existing behaviours and sensible weights for `city` and
   `highway`.
3. Extend the content test to assert every declared `art` id is a key of `.sprites`, and
   that the two dropped cells are absent from the manifest.

## Verification

```bash
npm run typecheck
npm run test
```

## Out of scope

- New behaviours or new enemy classes.
- Any fal call.
