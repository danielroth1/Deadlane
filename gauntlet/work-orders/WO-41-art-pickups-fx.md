# WO-41 — art-09 pickups and art-10 effects (2 images)

## Goal

The five pickup kinds draw as procedural diamonds and explosions draw as a flat square
tweened from 0.6 to 1.6, because `art-09-weapons-pickups` and `art-10-fx` have never been
generated. The muzzle flash, smoke cloud and oil slick are flat rectangles too.

## Budget

One first attempt each on `art-09-weapons-pickups` and `art-10-fx` (4×4 grids, 32 px cells).
Ledger is 12/120. No retries inside this order.

## Depends on

WO-34 — the weapons order settles where the oil, smoke and muzzle effects are spawned.

## Steps (hints, not limits)

1. Orchestrator: for each slot in turn — `npm run art:status`,
   `npm run art:claim -- --slot <slot-id>`, one `run_model` with exactly the printed
   arguments and `count: 1`. Never claim the second slot before the first is atlased.
2. Implementer per slot: `art:pull`, `art:process`, `art:select`, then `art:atlas`.
3. Map the pickup kinds and the explosion/muzzle/smoke oil effects to real cell ids; keep
   the procedural path as the fallback when a frame is missing.
4. Add a test that every pickup and effect id the game asks for resolves in the manifest.

## Verification

```bash
npm run art:status
npm run art:validate
npm run typecheck
npm run test
```

## Out of scope

- New pickup kinds, particles or an effects framework.
- Retrying a rejected attempt.
