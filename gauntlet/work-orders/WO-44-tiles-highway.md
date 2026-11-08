# WO-44 — Tile layer, starting with art-13 highway tiles (1 image)

## Goal

The road is drawn from the locked palette. `src/systems/road.ts` already anticipates this
order ("When `art-13..art-18` are approved, `tileTexture` can be layered underneath without
changing any of this geometry"), but no tile layer exists. This order introduces it and
builds the first sheet, `art-13-tiles-highway` (4×4 grid, 32 px tiles, seamless).

## Budget

One first attempt on `art-13-tiles-highway`. Ledger is 12/120. No retries inside this order.

## Depends on

WO-33 — the sector transition owns road/visibility changes in the same scene.

## Steps (hints, not limits)

1. Add a tile layer that renders the road surface, shoulders and terrain bands from atlas
   tile frames, scrolled by the same `distance` value the drawn road uses. Keep the road
   profile geometry (`left`, `width`, `lanes`, `laneWidth`) authoritative.
2. Choose frames with a **pure** function (road profile + distance → frames) and unit-test
   it: lane dashes must scroll continuously, edges must not drift, and the seam must repeat
   without a visible jump.
3. Degrade cleanly: when a tile sheet is absent, the current drawn theme is the fallback.
   A missing or rejected sheet must never blank the road.
4. Orchestrator: `npm run art:status`, `npm run art:claim -- --slot art-13-tiles-highway`,
   one `run_model` with exactly the printed arguments and `count: 1`.
5. Implementer: `art:pull`, `art:process`, `art:select`, `art:atlas`.
6. Wire the tile layer for `highway` only. Other level types keep their drawn theme until
   WO-45..WO-47 land.

## Verification

```bash
npm run art:status
npm run art:validate
npm run typecheck
npm run test
npm run test:e2e
```

## Out of scope

- Changing road geometry, lane widths or collision.
- Tiles for canyon, river, city, tunnel or transitions (own orders).
- Retrying a rejected attempt.
