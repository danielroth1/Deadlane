# WO-61 — Water sections, boat transformation, water splashes

## Goal

A sector can contain water. The car transforms into a boat on water and back to a car on
land. Boats spawn only on water, land vehicles only on land, and the water has wake and
splash effects.

## Depends on

WO-52 (motion), WO-54 (road edges and art-23 water scenery), WO-56 (jump/landing), WO-59
(FX layer), WO-60 (art-08 watercraft).

## Steps (hints, not limits)

1. Add surface segments to `LevelBlueprint` (`land` / `water`) and expose
   `roadAt(at).surface`. Generators must place complete water stretches with shore
   transitions, not a one-pixel boundary.
2. Render water with art-15 tiles and art-18 shore/blend cells; place water scenery from
   art-23 outside the navigable channel.
3. On water, draw the shipped `player-vehicle/hover-interceptor` frame and switch handling
   to boat feel (same controls, different inertia/turn). Switch back on land.
4. Filter enemy and civilian pools by the surface at the spawn distance: boats only in
   water, land vehicles only on land. Extend validation to assert this and to reject a
   transition with no playable surface.
5. Add wake/foam while moving, a splash on entering/leaving water, and a splash on landing
   from a jump. Emit them through the WO-59 FX system using art-25 frames.
6. Add a HUD surface indicator and a debug snapshot field for the current surface. Add an
   e2e fast-forward to a water stretch and assert the boat frame, a boat-only enemy and a
   splash event.

## Verification

```bash
npm run typecheck
npm run test
npm run art:validate
npm run build
npm run test:e2e
```

The 1,000-seed matrix must prove every surface segment is playable and no boat/land enemy
is placed on the wrong surface.

## Out of scope

- Deleting the existing `river` level type; it becomes the water-heavy sector.
- New level types, boat-specific combat rebalance or new audio.
