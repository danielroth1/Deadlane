# WO-15 — Reopen an approved art slot

## Goal

Add the missing CLI that returns an `approved` slot to `open`, so a human can reject a
selected attempt and retry it without hand-editing the ledger.

## Context

`npm run art:select` sets `status: "approved"` and `selected: N`. `claimAttempt()` refuses
an approved slot, and `releaseAttempt()` only flips one attempt's `state` — it never clears
the slot status. `markSlotStatus()` exists in `pipeline/lib/ledger.ts` but no CLI calls it.
Result: a reviewer FAIL on the selected attempt leaves the slot permanently unretryable.
`pipeline/budget.json` is generated and must not be hand-edited, so this needs a script.

## Files (whitelist)

- `pipeline/lib/ledger.ts`
- `pipeline/cli/reopen.ts` (new)
- `package.json`

## Steps

1. In `pipeline/lib/ledger.ts`, add a pure `reopenSlot(ledger, slotId)` that returns a new
   ledger with the slot's `status` set to `'open'` and `selected` removed, leaving
   `attempts` (seeds, request ids, urls, costs) untouched. Throw `BudgetError` if the slot
   does not exist.
2. Add `pipeline/cli/reopen.ts` following the shape of `pipeline/cli/release.ts`:
   `--slot <id>` required, optional `--note <text>` (default `reopened by operator`).
   Print the usual banner, the new status, and the budget summary via `printSummary`.
3. Add `"art:reopen": "tsx pipeline/cli/reopen.ts"` to `package.json` scripts, next to
   `art:release`.

## Acceptance criteria

- [ ] `npm run art:reopen -- --slot art-01-style-anchor` exits 0 on an approved slot and
      `pipeline/budget.json` then shows that slot `"status": "open"` with **no** `selected`
      key, and both existing attempts still present with their seeds, request ids, urls and
      costs unchanged.
- [ ] `npm run art:status` afterwards reports the slot as `open`, still `2/6`, and reports
      `approved 0`.
- [ ] Reopening a slot that is already `open` exits non-zero with a clear message and does
      not modify the ledger.
- [ ] Unknown slot id exits non-zero with a clear message.
- [ ] No attempt gains or loses budget: used-image count is unchanged.
- [ ] `npm run test` and `npm run typecheck` pass. No `any`, no non-null assertions.

## Verification

```bash
npm run test && npm run typecheck
npm run art:reopen -- --slot art-01-style-anchor
npm run art:status
node -e "const b=require('./pipeline/budget.json').slots['art-01-style-anchor'];console.log(JSON.stringify({status:b.status,selected:b.selected,attempts:b.attempts.length}))"
npm run art:reopen -- --slot art-01-style-anchor; echo "second reopen exit=$?"
npm run art:status
```

## Out of scope

- Do **not** run `npm run art:claim`, `art:pull`, or any fal tool. The orchestrator owns
  budget; a claim spends an image.
- Do not change the 80-image ceiling, the 6-attempt cap, or any slot definition.
- Do not touch `pipeline/budget.json` by hand — reopening must go through the new CLI.
- Do not delete or rewrite existing attempts.
