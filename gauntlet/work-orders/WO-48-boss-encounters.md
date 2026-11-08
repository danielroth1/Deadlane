# WO-48 — Act bosses

## Goal

The game promises a hunt, but every threat is a one-shot chaff enemy: nothing escalates, and
there is no encounter that tests what the player has learned. Add an act boss that closes
each act and gates the transition.

`art-07-boss` defines four boss machines, so the encounter is themed by level type rather
than being one generic bullet sponge:

| Cell | Boss | Appears in |
| --- | --- | --- |
| 0 | command carrier (six-wheel, dorsal turret) | highway, city |
| 1 | gunship | any type, act 2+ variant |
| 2 | river dreadnought | river |
| 3 | boring machine | tunnel |

Bosses are playable with placeholders from day one. `art-07` is WO-49; do not block on it.

## Depends on

WO-33 — the sector transition, which currently owns what happens at a boundary. A boss
encounter replaces the plain sector-end flow.

## Steps (hints, not limits)

1. **Data, not code.** Add a boss table (JSON + schema next to the other content tables):
   id, boss kind, level types it can appear in, hp, speed, attack pattern id, score reward.
   Adding a boss variant should not need a new class.
2. **Spawn at the act boundary.** Every act ends with the boss for that level type. Hold
   the sector transition until the boss is destroyed; the existing transition then runs
   unchanged. A sector reset must never despawn a live boss.
3. **An entity that reads as a boss.** Bigger collision box, more hp than any enemy, at
   least two telegraphed attacks, and a health bar. Reuse the existing behaviour/weapons
   patterns where they fit instead of inventing a parallel combat system.
4. **Presentation.** Boss name banner and hp bar in the HUD; a clear victory beat before the
   next act starts.
5. **Reward.** Pay the boss reward from the content table on defeat.
6. **Tests.** Pure boss selection (level type + act index → boss id) and the hp/defeat state
   machine must be unit-tested. Cover "sector reset does not remove a live boss" in e2e via
   the `?debug=1` snapshot from WO-32.

## Verification

```bash
npm run typecheck
npm run test
npm run test:e2e
```

## Out of scope

- Boss art (WO-49). Placeholders are fine here.
- New level types.
- Multi-phase boss scripting beyond two attack patterns per boss.
