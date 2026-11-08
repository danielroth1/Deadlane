# WO-34 — Weapons that work, driven by `weapons.json`

## Goal

Three of the player's and enemy's attacks are inert, and the content table that defines
them is never read:

- `enemyFire()` seeds the bullet with `distance - (PLAYER.y - enemy.sprite.y)`, which
  evaluates to `2·distance − atEnemy` — the bullet spawns below the player and travels
  further away. Only a point-blank turret can ever hit.
- Nothing calls `dropOil()`; only the unused `dropOilPublic()` wrapper exists. Even if
  bound, the kill test `hazard.sprite.y < PLAYER.y - 80` cannot be true for a slick dropped
  at `PLAYER.y + 30`.
- Nothing reads `kind === 'smoke'` for firing, although `weapons.json` promises "hostiles
  behind the cloud stop firing".
- `getWeapon()` in `src/content/index.ts` has no caller; `gun`/`oil`/`smoke` cooldowns and
  durations are duplicated in `config.ts` and `GameScene`.

## Steps (hints, not limits)

1. Fix the projectile origin so an enemy shot leaves the enemy and reaches the player's
   lane. Extract the world-position maths into a pure helper and test it.
2. Bind the oil slick to a documented control and update the README input table. Fix the
   catch window so a slick wrecks the next pursuer that crosses it, and make it expire.
3. Make smoke suppress hostile fire while a cloud is between the hostiles and the player.
4. Read cooldown/duration from `getWeapon()`; remove the duplicated constants rather than
   keeping both.
5. Cover the three behaviours with unit tests over the extracted helpers — no Phaser in the
   tests.

## Verification

```bash
npm run typecheck
npm run test
```

## Out of scope

- New weapons or ammo economy.
- Art for the oil/smoke effects — that is WO-41.
