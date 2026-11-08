# WO-49 — art-07 bosses (1 image)

## Goal

Generate the boss sheet and make the four act bosses draw real frames instead of
placeholders. `art-07-boss` is a 2×2 sheet at 128 px cells:

| Cell | Slug |
| --- | --- |
| command carrier | `boss/command-carrier` |
| gunship boss | `boss/gunship-boss` |
| river dreadnought | `boss/river-dreadnought` |
| boring machine | `boss/boring-machine` |

## Budget

One first attempt on `art-07-boss`. Ledger is 12/150. No retries inside this order — a
rejected image is a new order or an escalation.

## Depends on

WO-48 — the boss entity and its content table must exist before there is anything to draw.

## Steps (hints, not limits)

1. Orchestrator: `npm run art:status`, `npm run art:claim -- --slot art-07-boss`, then one
   `run_model` with exactly the printed arguments and `count: 1`.
2. Implementer: `art:pull`, `art:process`, `art:select`, `art:atlas`.
3. Map each boss id from WO-48's content table to its cell. If a specific cell is unusable,
   prefer drawing the boss with an existing cell over a placeholder that hides the problem,
   and say which cell you used and why.
4. Keep the placeholder path for a missing sheet.
5. Extend the content test so every boss `art` id is a key of the manifest.

## Verification

```bash
npm run art:status
npm run art:validate
npm run typecheck
npm run test
```

## Out of scope

- Boss behaviour, hp, attacks or scoring (WO-48).
- Retrying a rejected attempt.
