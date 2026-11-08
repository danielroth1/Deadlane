# WO-52 — Motion and framing: centred car, gradual speed, zoomed-out world

## Goal

The player car should sit in the centre of the screen, accelerate and decelerate gradually,
and be able to come to a complete halt. The world should show more of the road. Replace the
instant scroll multipliers with a motion model and drive the road, audio, spawner and score
from the player's velocity.

## Depends on

None.

## Steps (hints, not limits)

1. Add motion constants and a small pure speed controller in `src/config.ts` / a new
   `src/systems/motion.ts`: throttle acceleration, coast drag, brake deceleration, max
   speed and zero clamp.
2. Put the player at screen centre (`PLAYER.y` around `GAME.height / 2`); remove the
   bottom-edge bias and the engine jitter if it fights the centred framing.
3. `GameScene.update` advances `distance` by player speed, not `currentScroll()`. Road
   render, engine audio, spawn horizon, despawn bounds and distance score all read the same
   velocity.
4. Convert civilians and enemies from "share of the player's scroll" to absolute world
   speeds. If the player stops, civilian traffic must keep moving and enemies must keep
   their own velocity.
5. Add a configurable camera zoom for the world camera only. Keep the HUD and touch pad at
   1:1. Extend the world aperture (`worldWidth/height = GAME / zoom`) so the road, terrain
   and spawn/despawn bounds fill the zoomed view instead of showing black borders.
6. Pointer routing: pad buttons stay in HUD screen space; steering converts to world space.
7. Physics is permitted if the analytic motion layer is not enough. Keep the seeded run
   reproducible and keep the `at` projection as the source of screen y.
8. Update the known-flaky pause e2e: it currently checks a 300 ms instant boost. Make it
   check that speed rose over 300 ms, and re-run twice before treating a failure as real.

## Verification

```bash
npm run typecheck
npm run test
npm run art:validate
npm run build
npm run test:e2e
```

## Out of scope

- Lives, road width changes, obstacles, new art or the transporter.
- A physics engine for its own sake.
