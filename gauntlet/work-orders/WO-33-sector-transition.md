# WO-33 — Sector transition: clear the world, present the sector, ramp from config

## Goal

Sector 2 and later are broken and invisible:

- `advanceLevel()` resets `distance` to 0 while live enemies and civilians keep
  `at ≈ 24,000`. `EnemyVehicle.isOffscreen` / `CivilianVehicle.isOffscreen` only test
  `y > 460`, so nothing from the previous sector despawns. The screen fills to
  `SPAWN.maxEnemiesOnScreen` / `maxTrafficOnScreen`, `spawnEvent` starts returning early,
  and `eventCursor` keeps advancing — the sector silently eats its own spawns.
- There is no sector presentation: no `LevelIntro` scene exists (AGENTS.md lists one;
  `src/main.ts` registers six scenes), the transition is a one-second toast, and
  `blueprint.levelLabel` / `LEVEL_PROFILES[type].label` are never rendered.
- `LevelBlueprint.visibility` (tunnel 0.45) is generated and never read.
- `DIFFICULTY.rampSeconds`, `SPAWN.directorInterval` and `SPAWN.despawnMargin` are dead
  config.

## Steps (hints, not limits)

1. Make the boundary well-defined: every entity from the previous sector is destroyed on
   both edges, and the spawner's cursor, counters and timers start the new sector clean.
2. Add a short level-intro presentation that names the sector and level type before play
   resumes. Register it in `src/main.ts` (and keep the repo map in AGENTS.md honest).
3. Apply `visibility` for the run (a dark overlay, not a change to `RoadSystem` geometry).
4. Drive intensity from `DIFFICULTY.rampSeconds`; delete or consume `directorInterval` and
   `despawnMargin` — no dead knobs left behind.
5. Reset the challenge label and any per-sector HUD state on advance.
6. Test the spawner reset as a pure function if you can; otherwise cover it in e2e after
   two sector boundaries.

## Done when

- Crossing a sector boundary leaves zero previous-sector units alive.
- Sector 2 spawns at the same rate as sector 1 (assert live counts, not a screenshot).
- A card names the sector, and a tunnel run is visibly darker.

## Verification

```bash
npm run typecheck
npm run test
npm run test:e2e
```

## Out of scope

- New level types.
- Tile art (WO-44..WO-47) — the drawn road stays as the fallback.
