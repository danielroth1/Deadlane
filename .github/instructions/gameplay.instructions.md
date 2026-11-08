---
description: 'DEADLANE gameplay rules: pixel units, seeded RNG, data-driven content, no any'
applyTo: 'src/**'
---

# Gameplay rules (`src/`)

- **Units are pixels.** Internal resolution 640×360, tiles 32×32, vehicles 64×64. Never scale
  by a fractional amount in gameplay code; Phaser's `Scale.FIT` handles display.
- **All randomness goes through `src/rng.ts`.** `Math.random()` in gameplay code is a review
  failure — it breaks seed reproducibility.
- **No `any`. No non-null assertions to silence the compiler.** Fix the type.
- **Tuning constants live in `src/config.ts`.** Do not scatter magic numbers.
- **Level generation returns data, not objects.** Generators return a `LevelBlueprint`; no
  Phaser inside `src/levels/`.
- **Content is data.** Enemies, bosses, civilians, weapons and challenges are JSON tables in
  `src/content/`, checked by the hand-written schema in `src/content/content.test.ts`. Adding a
  row should not need a code change; a new `behavior` or attack pattern does.
- **Art is data.** Every sprite id resolves through `Art` (`src/art/index.ts`), using the
  candidate tables in `src/art/ids.ts` and falling back to `src/art/placeholders.ts`. Never
  branch on which one you got — a slot with no approved art must still play.
- **No runtime network calls, no analytics, no telemetry.** The shipped game is deterministic,
  static and offline-capable.
- **Set membership uses `.has()`**, not `in`.
