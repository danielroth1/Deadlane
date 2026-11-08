# WO-35 — Damage and score truth

## Goal

Two scoring rules contradict the content data:

- `resolveCollisions()` tests player bullets against enemies only, so shooting a civilian
  does nothing and `SCORE.civilianDestroyed` (−500) is unreachable.
- `damagePlayer()` subtracts `SCORE.civilianHit * 0.2` (−50) on every armour hit, including
  enemy fire, so being shot costs score. `SCORE.enemyDestroyed` (+150) is never used.

`src/content/civilians.json` also claims civilian contact costs armour, which it does not.

## Steps (hints, not limits)

1. Let player bullets hit civilian traffic, apply `SCORE.civilianDestroyed`, and give the
   player a short, readable announcement.
2. Make an armour hit cost armour only — no score delta — while a kill pays
   `SCORE.enemyDestroyed`.
3. Make the `civilians.json` comment and the HUD/README wording match what the code does.
4. Extract the scoring deltas into a pure function and test the four cases (enemy kill,
   civilian kill, civilian contact, armour hit).

## Verification

```bash
npm run typecheck
npm run test
```

## Out of scope

- Rebalancing the score curve. Use the values already in `config.ts`.
