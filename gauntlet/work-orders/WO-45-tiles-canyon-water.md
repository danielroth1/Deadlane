# WO-45 — art-14 canyon and art-15 water tiles (2 images)

## Goal

The tile layer from WO-44 currently themes only the highway. Generate the two outdoor
sheets and wire them to their level types:

- `art-14-tiles-canyon` — cracked asphalt, sand, cliff rock, dry scrub, painted centre line.
- `art-15-tiles-water` — open/choppy water, foam, wake, banks, reed bed, pier plank, buoy.

## Budget

One first attempt each. Ledger is 12/120. No retries inside this order.

## Depends on

WO-44 — the tile layer, the pure frame chooser and the fallback contract.

## Steps (hints, not limits)

1. Orchestrator: per slot in turn — `npm run art:status`,
   `npm run art:claim -- --slot <slot-id>`, one `run_model` with the printed arguments,
   `count: 1`. Claim the second only after the first is atlased.
2. Implementer per slot: `art:pull`, `art:process`, `art:select`, `art:atlas`.
3. Extend the frame chooser and its tests for `canyon` and `river`. Keep the drawn theme as
   the fallback for both.
4. On water, the road surface is water: do not keep asphalt bands under the water theme.

## Verification

```bash
npm run art:status
npm run art:validate
npm run typecheck
npm run test
```

## Out of scope

- City, tunnel and transition tiles.
- Changing level generators or road profiles.
- Retrying a rejected attempt.
