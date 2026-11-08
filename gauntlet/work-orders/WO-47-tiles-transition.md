# WO-47 — art-18 transition and overlay tiles (1 image)

## Goal

The last tile sheet covers what sits between themes and on top of them: asphalt→sand,
asphalt→water, asphalt→concrete, shoulder→grass, grass→rock, chevron shoulder, faded paint,
rain, snow, fog, scanline, vignette corner, dirt and crack overlays, and blend masks.

This is what makes a sector boundary read as a place rather than a colour change.

## Budget

One first attempt on `art-18-tiles-transition`. Ledger is 12/120. No retries inside this
order.

## Depends on

WO-44 — the tile layer and frame chooser.

## Steps (hints, not limits)

1. Orchestrator: `npm run art:claim -- --slot art-18-tiles-transition`, one `run_model`
   with the printed arguments, `count: 1`.
2. Implementer: `art:pull`, `art:process`, `art:select`, `art:atlas`.
3. Use the blend tiles at the sector boundary from WO-33 and the overlays where they mean
   something (dust in canyon, wet in tunnel/river, oil/cracks as damage). Partial opacity
   only where the sheet's `emphasis` allows it.
4. Extend the frame chooser and its tests. Missing sheet = no overlay, never a black band.

## Verification

```bash
npm run art:status
npm run art:validate
npm run typecheck
npm run test
```

## Out of scope

- New weather systems or particle effects.
- UI chrome (art-19/20).
- Retrying a rejected attempt.
