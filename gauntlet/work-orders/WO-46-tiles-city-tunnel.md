# WO-46 — art-16 city and art-17 tunnel tiles (2 images)

## Goal

Finish the level-type coverage of the tile layer:

- `art-16-tiles-city` — street asphalt, intersection, crosswalk, sidewalk, roofs, manhole,
  kerb, plaza, parking paint, stop line.
- `art-17-tiles-tunnel` — tunnel asphalt, edge line, concrete walls, ceiling panels and
  lights, pillars, portal frame, grates, hazard stripe.

## Budget

One first attempt each. Ledger is 12/120. No retries inside this order.

## Depends on

WO-44 — the tile layer and frame chooser.

## Steps (hints, not limits)

1. Orchestrator: per slot in turn — `npm run art:claim`, one `run_model` with the printed
   arguments, `count: 1`. One image at a time.
2. Implementer per slot: `art:pull`, `art:process`, `art:select`, `art:atlas`.
3. Extend the frame chooser and tests for `city` and `tunnel`; keep the drawn theme as the
   fallback.
4. Tunnel: compose with the `visibility` overlay from WO-33 so the sheet and the darkness
   agree, and do not double-darken.

## Verification

```bash
npm run art:status
npm run art:validate
npm run typecheck
npm run test
```

## Out of scope

- Transition and overlay tiles (WO-47).
- Lighting systems, shadows or post-processing.
- Retrying a rejected attempt.
