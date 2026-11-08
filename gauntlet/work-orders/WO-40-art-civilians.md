# WO-40 — art-08 civilians: traffic from the atlas (1 image)

## Goal

All 14 civilian ids ask for `civilians/<shape>` and fall back to `ensureVehicleTexture`,
because `art-08-civilians` has never been generated. It is the largest placeholder block on
screen. The three water civilian ids (`skiff`, `barge`, `boat`) have no cell in the sheet at
all.

## Budget

One first attempt on `art-08-civilians` (4×4 grid, 64 px cells). Ledger is 12/120.
No retry inside this order — a rejected image is a new order or an escalation.

## Steps (hints, not limits)

1. Before generation, re-scope three unused cells in `pipeline/registry/slots.ts` to
   `skiff`, `barge` and `pleasure boat`, and update the slot `subject` prose. The slot is
   unstarted, so this costs nothing and allocates no new slot.
2. Orchestrator: `npm run art:status`, `npm run art:claim -- --slot art-08-civilians`,
   then one `run_model` with exactly the printed arguments and `count: 1`.
3. Implementer continues at `art:pull`, then `art:process`, `art:select`, `art:atlas`.
4. Add `art` to the civilian definition and map all 14 ids to real cells; read it in
   `src/entities/civilian.ts`. The placeholder path stays for missing sheets.
5. Extend `src/content/content.test.ts` the way WO-31 did for enemies: every declared
   civilian `art` id must be a key of the manifest.

## Verification

```bash
npm run art:status
npm run art:validate
npm run typecheck
npm run test
```

## Out of scope

- Retrying a rejected attempt.
- New civilian behaviours or traffic density changes.
