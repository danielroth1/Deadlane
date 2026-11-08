# WO-56 — Road hazards: solid obstacles and ramps

## Goal

Road obstacles are solid and hurt, and ramps launch the car so it can jump over ground
obstacles.

## Depends on

WO-52 (motion), WO-54 (current road edges), WO-55 (impact response).

## Steps (hints, not limits)

1. Give the prop table a collision class (`solid`, `soft`, `hazard`) and half-extents. Props
   that currently draw as cones/barriers/tyre stacks/roadblocks must resolve, not pass
   through.
2. Solid obstacles damage or slow the car on contact through the WO-55 path; soft props
   (cones) can be knocked aside without armour damage.
3. Add a ramp event and sprite. Prefer the shipped `weapons-pickups/weapons-van-ramp` cell;
   if `art-22`/`art-24` carries a better ramp cell, use it instead of spending a new image.
4. Add player airborne state: a ramp starts a jump, ground obstacles and vehicles are
   ignored while airborne, a shadow shows height, and a landing event fires for dust/water
   splash. The jump must not skip boss or bullet collisions unless the design says so.
5. Add ramps and solid obstacles to the level pools. Extend validation so a ramp never
   overlaps an all-lane wall and no obstacle row blocks every lane.
6. Unit-test the jump clearance and prop solidity. Add a debug-only ramp/barrier stage for
   e2e.

## Verification

```bash
npm run typecheck
npm run test
npm run art:validate
npm run build
npm run test:e2e
```

## Out of scope

- Water ramps/splashes (WO-61), the new FX variant system (WO-57/WO-59).
- Destructible scenery.
