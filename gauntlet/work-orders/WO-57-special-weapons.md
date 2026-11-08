# WO-57 — Special weapons: static oil/smoke, rockets, flamethrower, weapon audio

## Goal

The rear weapons stay where they are dropped and actually matter, the car gains rockets and
a flamethrower, and every special weapon has a distinct audio cue.

## Depends on

WO-52 (world motion) and WO-55 (impact response).

## Steps (hints, not limits)

1. Make hazards world-static: `Hazard.at` is fixed at the drop point and only the screen y
   is re-derived each frame. Oil and smoke must not ride with the car.
2. Oil sets an enemy spin/control-loss state with lateral drift and reduced fire; it must
   not instantly kill the first car that touches it. A spinning car can still be shot.
3. Smoke stays at the drop point and `smokeBlocksFire()` uses world positions. A cloud
   behind the car protects nobody.
4. Add `rocket` and `flame` rows to `weapons.json` (cooldown, ammo, damage, projectile speed
   or cone range/duration) and to the content schema. Add player ammo counts.
5. Rockets: a forward projectile with a travel limit and a splash radius; explode on the
   first enemy/boss/obstacle hit and damage everything inside the radius.
6. Flamethrower: a short-range forward cone with damage over time and a visible flickering
   flame stream. It should feel powerful at close range and useless at long range.
7. Add input keys and touch-pad buttons without breaking the existing fire/oil/smoke/steer
   paths. Show rocket/flame ammo in the HUD.
8. Claim `art-25-fx-expanded` and wire flame/rocket frames (the orchestrator runs
   `art:claim` immediately before the single `run_model`; the implementer continues at
   `art:pull`). Fall back to art-10 frames when a cell is missing.
9. Add procedural cues in `src/systems/audio.ts`: rocket launch and impact, flame
   ignite/loop, oil drop and smoke puff. Keep the audio registry single-owner and testable.
10. Unit-test static hazard projection, oil spin, the flame cone and the audio cue
    selection. Add an e2e stage for a pursuer crossing oil, a rocket hit and a flame burn.

## Verification

```bash
npm run typecheck
npm run test
npm run art:validate
npm run art:atlas
npm run build
npm run test:e2e
```

## Out of scope

- New boss attack patterns and boss audio (WO-58), the general FX variant system (WO-59).
- Generated audio files; audio stays procedural.
