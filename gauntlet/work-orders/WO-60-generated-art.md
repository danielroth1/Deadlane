# WO-60 — Generated art batch: UI, civilians, remaining character sheets

## Goal

Finish the generated art the game still draws as placeholders or primitives: HUD icons,
UI chrome, the missing civilian vehicles and watercraft, and optionally the dedicated boss
sheet.

## Depends on

WO-51 (slots and no ceiling), WO-53 (lives in the HUD), WO-57 (rocket/flame readouts).

## Steps (hints, not limits)

1. `art-19-ui-icons`: re-scope the never-attempted cells to the final HUD set — gun, oil,
   smoke, rocket, flame, armour, life, shield, nitro, speed, boss, warning, reticle,
   arrow left, arrow right, boat. Drop icons the HUD no longer uses.
2. `art-20-ui-chrome`: panel corner/edges, meter frame/fill, boss bar, pause card,
   title/game-over cards, divider, banner, progress cap and corner brackets.
3. `art-08-civilians` retry: one whole vehicle per cell, square-on overhead, nose/bow up,
   no side or three-quarter views, no fused cells, no painted water. Cover all 14 civilian
   ids, including wagon, hatchback, coupe, van, box-truck, skiff, barge and boat, while
   keeping the six subjects already shipped.
4. Optional: retry `art-07-boss` for dedicated boss cells. It must not block the order; the
   current donor frames remain acceptable if the retry is weak.
5. Wire the generated icons/chrome into `HudScene`, `TitleScene`, `GameOverScene` and
   `LevelIntroScene`, keeping primitive fallbacks. Wire the civilian art ids in
   `civilians.json`.
6. Run `art:process`, `art:select` and `art:atlas` for each slot. The orchestrator runs
   `art:claim` immediately before each `run_model`; the implementer continues at
   `art:pull`.

## Verification

```bash
npm run typecheck
npm run test
npm run art:validate
npm run art:atlas
npm run build
npm run test:e2e
```

Also run `npm run repo:map` and show that every civilian id resolves.

## Out of scope

- New slots not named in WO-51; generated audio.
- Rewriting sheets that already passed (art-01…art-06, art-09…art-18).
