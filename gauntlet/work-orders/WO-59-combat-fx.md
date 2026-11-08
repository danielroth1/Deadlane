# WO-59 — Motion and combat FX: skid marks, varied explosions, rotors, sparks/debris

## Goal

Add the visual-effects layer: tyre lines on sharp turns, drift smoke, varied explosion
packages, spinning helicopter rotors, impact sparks/debris/shockwaves, landing dust, oil
splatter and electric arcs.

## Depends on

WO-52 (motion), WO-55 (collisions), WO-56 (landing/air state), WO-57 (art-25 and flame
frames), WO-58 (enemy/boss content).

## Steps (hints, not limits)

1. Add a small effect system with a deterministic variant table. Use `src/rng.ts` or a
   stable hash of the event so the same seed replays the same effects.
2. Add a bounded, world-static decal layer for tyre lines and drift smoke. Trigger on high
   lateral velocity and hard braking, not on every frame; cap the number of live marks and
   fade them out.
3. Build at least four distinct explosion packages from `art-25-fx-expanded` and art-10:
   fireball, smoke, debris and shockwave. Cars should burn with flame plus smoke before/as
   they explode; the boss explosion should be visibly different.
4. Add a rotor overlay for helicopters/gunships: rotate a crisp cross in 90-degree steps (no
   blurred disc), and keep it aligned to the sprite.
5. Hook impact sparks, debris, shockwave, landing/off-road dust, oil splatter and electric
   arc into the collision, jump and weapon paths.
6. Extend `EFFECT_ART` mappings for all new frames. Add debug-only counters
   (`lastFx`, `skidMarks`, `rotorTicks`) so Playwright can prove variants changed, tyre
   lines appeared and a rotor is animating.
7. Do not claim `art-25` again; it is generated in WO-57.

## Verification

```bash
npm run typecheck
npm run test
npm run art:validate
npm run build
npm run test:e2e
```

## Out of scope

- Water splash (WO-61), new audio beyond WO-57/WO-58, soft/additive glow that the style guide
  does not want.
