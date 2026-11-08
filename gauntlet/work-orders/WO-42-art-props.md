# WO-42 — art-11 and art-12: roadside and terrain props (2 images)

## Goal

Every prop in every level type draws the same 18 px procedural cone, because
`art-11-props-a` and `art-12-props-b` have never been generated. Several ids the generators
ask for (`buoy`, `reed-bed`, `pier`, `roadblock`, `dumpster`, `manhole`, `pillar`, `rubble`,
`hazard-stripe`) have no cell in either sheet.

## Budget

One first attempt each on `art-11-props-a` and `art-12-props-b` (4×4 grids, 32 px cells).
Ledger is 12/120. No retries inside this order.

## Depends on

WO-33 — the sector work touches the level and spawn paths this order re-points.

## Steps (hints, not limits)

1. Reconcile the data before spending anything: re-scope cells (both slots are unstarted)
   or re-point `propPool` rows so every prop id the generators can emit has a cell. Update
   the slot `subject` prose to match.
2. Orchestrator: per slot — `art:claim`, one `run_model` with the printed arguments,
   `count: 1`. One image at a time, first slot atlased before the second is claimed.
3. Implementer per slot: `art:pull`, `art:process`, `art:select`, `art:atlas`.
4. Read the prop id in the prop spawn path; keep the procedural fallback for missing cells.
5. Add a test that every `propPool` id resolves in the manifest, so the sheets and the
   generators cannot drift apart again.

## Verification

```bash
npm run art:status
npm run art:validate
npm run typecheck
npm run test
```

## Out of scope

- New props or new level types.
- Changing road geometry or collision behaviour.
- Retrying a rejected attempt.
