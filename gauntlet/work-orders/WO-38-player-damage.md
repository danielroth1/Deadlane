# WO-38 — Player shows its damage and wreck states

## Goal

The player sheet ships four cells, but only `player-vehicle/interceptor-clean` is ever
requested. `interceptor-damaged` and `interceptor-wrecked` never appear at any armour level
or on death, and `PLAYER.leanThreshold` (120) is ignored in favour of a hardcoded `0.1`.

## Steps (hints, not limits)

1. Pick the player frame from armour tier with a pure helper, and test it across the tier
   boundaries.
2. Show the wrecked frame when the run ends, before the game-over scene takes over.
3. Use `PLAYER.leanThreshold` for the lean calculation instead of the hardcoded value.
4. Keep the placeholder path working when the sheet is missing.

## Verification

```bash
npm run typecheck
npm run test
```

## Out of scope

- New player art or new vehicle states.
