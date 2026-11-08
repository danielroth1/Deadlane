# WO-55 — Collision response: push apart, not delete

## Goal

A collision between the player and another car must separate both vehicles and impart an
impulse. It must not delete the other car in the same frame, and the two cars must not
remain overlapping.

## Depends on

WO-52 (velocity model) and WO-54 (current road edges).

## Steps (hints, not limits)

1. Put the contact maths in a pure module (`src/systems/collision.ts`): overlap depth,
   contact normal, separation and impulse. No Phaser in the pure part.
2. Add velocity/impulse state to the player, enemies and civilians, and route every
   player-versus-vehicle contact through the resolver.
3. Damage is a consequence of the hit, not the hit itself: a hard impact costs armour and
   may wreck the other car; a glancing impact pushes both cars and is recoverable.
4. Keep i-frames and the one-hit-per-window rule. A collision must not fire damage twice in
   the same frame or while invulnerable.
5. Add camera shake and a short control wobble on a hard hit. Keep the seeded run
   deterministic.
6. Physics is permitted if the analytic resolver cannot deliver the feel, but contact
   normals/impulses must stay deterministic and the `at` projection must remain the source
   of screen y.
7. Add a debug-only collision stage so Playwright can place a car beside the player and
   assert positions separated and velocity changed.

## Verification

```bash
npm run typecheck
npm run test
npm run art:validate
npm run build
npm run test:e2e
```

## Out of scope

- Signature enemy contact weapons (WO-58), boss collisions, ramps/jumps (WO-56).
- A full rigid-body simulation.
