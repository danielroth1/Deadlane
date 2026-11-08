# WO-43 — E2E reaches the end of a run

## Goal

The three smoke tests boot the game, press Space once and fetch the manifest. Nothing
reaches game over, restart, best-score persistence or a sector boundary — which is how the
pause soft-lock (WO-32) and the sector spawn starvation (WO-33) shipped green.

## Depends on

WO-32 (the `?debug=1` snapshot) and WO-33 (sector transitions).

## Steps (hints, not limits)

1. Add a deterministic run using `?seed=` and `?debug=1`, fast-forwarding with the snapshot
   rather than a long wall-clock wait.
2. Cover: game over shows a result; Space redeploys; the best score persists across a
   reload; a second sector still has live enemies after the boundary and the intro card.
3. Keep the existing base-path, frame-rate and manifest assertions.
4. No fixed timeouts where the snapshot can prove the state.

## Verification

```bash
npm run test:e2e
```

## Out of scope

- Unit-level coverage of gameplay systems — that belongs to their own orders.
- Screenshot snapshots.
