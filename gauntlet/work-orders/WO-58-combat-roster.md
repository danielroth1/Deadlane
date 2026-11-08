# WO-58 — Combat roster: fewer/tougher vehicles, signature enemy weapons, new boss patterns

## Goal

Traffic is less dense and more durable, every enemy has a distinct contact weapon or attack,
and bosses gain new attack patterns with matching audio.

## Depends on

WO-55 — contact response and impulses.

## Steps (hints, not limits)

1. Lower the on-screen traffic/enemy caps and increase generator spacing so the same seed
   produces materially fewer events.
2. Raise enemy hp so an ordinary enemy survives one gun volley and dies in roughly 2–4
   volleys. Add an optional civilian hp so a stray shot damages rather than instantly
   wrecks it.
3. Extend `EnemyDef` with a contact/weapon field and give every enemy id a distinct entry:
   spikes, ram plate, EMP, mines, broadside, drill, etc. Touching a side weapon must push
   the player sideways and briefly lock steering; it must not delete the enemy in the same
   frame.
4. Add new `BossAttackPatternId`s (for example `flame-wall`, `minefield`, `laser-sweep`,
   `ram-charge`, `missile-barrage`, `sonic-pulse`), assign them in `bosses.json`, and
   implement them in `src/systems/boss.ts` with a clear telegraph and a fair reaction
   window.
5. Add boss attack audio cues through the existing audio registry.
6. Keep the content schema and tests strict: every enemy id has a unique signature weapon,
   every boss pattern id is implemented, and density/hp changes are asserted.
7. Add a debug stage for a single enemy and for contact, so e2e can prove durability and the
   push/steer lock.

## Verification

```bash
npm run typecheck
npm run test
npm run art:validate
npm run build
npm run test:e2e
```

## Out of scope

- New boss art, new level types, new enemy behaviours outside the contact/attack table.
- Scoring rebalance beyond what durable cars require.
