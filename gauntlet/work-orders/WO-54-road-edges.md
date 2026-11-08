# WO-54 — Road edges: variable width, generated scenery, off-road damage

## Goal

The road can become tighter and wider again, generated scenery sits outside the shoulder,
and driving off the side damages the car and can destroy it.

## Depends on

WO-51 adds the scenery slots and removes the art ceiling. WO-52 provides centred motion.
WO-53 provides the life loss that a final off-road hit spends.

## Steps (hints, not limits)

1. Add road-width keyframes to `LevelBlueprint` (or a `RoadShape` beside the profile).
   Keep the lane count fixed per sector; vary width/lane width so lane indices stay valid.
2. Add `roadAt(road, at)` / `laneCenterAt(road, at, lane)` helpers and make entities and
   the spawner use the profile at their own `at`, not one blueprint-wide profile.
3. Make `RoadSystem` render variable-width bands (tile or drawn) and keep the road centred
   in the viewport. Update `validateBlueprint` to sample the width, viewport bounds and
   passability across the sector.
4. Add a `decor` event kind with side, lateral offset, prop and surface; generators place
   deterministic scenery outside the current edge. Decor must never collide, block a lane,
   or spawn inside the safe start.
5. Claim and wire `art-22-scenery-roadside`, `art-23-scenery-water` and
   `art-24-scenery-urban` (the orchestrator runs `art:claim` immediately before each
   `run_model`; the implementer continues at `art:pull`). Add the id tables in
   `src/art/ids.ts` and choose variants deterministically.
6. Remove the player x clamp. Allow a shoulder apron, then apply an off-road warning and
   progressive damage after a short grace period; a final hit spends armour/life through
   the normal damage path. Add a rough-terrain speed penalty and HUD warning.
7. The 1,000-seed matrix must prove every road is inside the viewport and at least passable.

## Verification

```bash
npm run typecheck
npm run test
npm run art:validate
npm run art:atlas
npm run build
npm run test:e2e
```

Include an e2e pixel proof of a narrow section and a wide section, plus an off-road damage
snapshot.

## Out of scope

- Water gameplay (WO-61), scenery physics, new level types.
- Rewriting the generator into five per-type generators.
