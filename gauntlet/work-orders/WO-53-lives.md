# WO-53 — Lives and respawn

## Goal

The run starts with 3 lives. When armour reaches zero, spend one life and respawn with
armour restored and a short invulnerability window. At zero lives the run ends once, and
the result screen still stores the best score.

## Depends on

WO-52 — the centred car and motion model decide where a respawn places the car and how
speed resets.

## Steps (hints, not limits)

1. Add `PLAYER.startLives` / `maxLives` and keep lives in the run state, separate from
   armour.
2. Route every zero-armour path through one `spendLife()` / respawn routine: decrement
   lives, reset armour to the starting loadout, grant i-frames, clear or knock back nearby
   threats, reset speed, and keep the same world distance.
3. At zero lives, run the existing end-of-run flow exactly once. Do not double-fire if two
   collisions land in the same frame.
4. Add `lives` to `HudState` and draw life pips in `HudScene`, distinct from armour pips.
5. Include lives in the game-over summary and the debug snapshot. Add a debug-only
   `loseLife()` control so Playwright can prove the 3→2→1→0 transition without waiting.
6. Update `e2e/run.spec.ts`: the current run ends after one `destroyPlayer()`. It must now
   lose three lives before the result screen appears, and still prove the best score and
   redeploy work.

## Verification

```bash
npm run typecheck
npm run test
npm run art:validate
npm run build
npm run test:e2e
```

## Out of scope

- Checkpoints, extra-life pickups, scoring changes or new art.
- Changing what a life costs in the HUD beyond the new pips.
