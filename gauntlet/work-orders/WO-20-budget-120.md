# WO-20 — Raise the image ceiling to 120 and migrate the ledger

## Goal

Change the lifetime image ceiling from 80 to 120 — a human decision, explicitly authorised in
conversation — without losing a single existing attempt, and add the migration command that
lets future slot-list changes reach `pipeline/budget.json` without hand-editing it.

## Context

`pipeline/budget.json` carries `"limit": 80` and is written only by the art CLIs. The number
also appears hardcoded in `pipeline/cli/init.ts`. Raising the ceiling therefore needs a ledger
migration, not an edit: `art:init` recreates the ledger and would wipe 6 paid attempts and
$0.040 of recorded spend.

The same migration must be able to add new slots later (the vehicle sheets are becoming 2×2,
which means more, smaller slots) — a new slot that exists in the registry but not in the
ledger currently throws "Unknown slot" from `requireSlotRecord`.

## Files (whitelist)

- `pipeline/lib/ledger.ts`
- `pipeline/cli/migrate.ts` (new)
- `pipeline/cli/init.ts`
- `package.json`

(That is four files, one over the usual guard; the change is a few dozen lines and they are
inseparable — a shared constant plus its two users plus the script entry.)

## Steps

1. `pipeline/lib/ledger.ts`:
   - export `const DEFAULT_IMAGE_LIMIT = 120;`
   - add `export function setLimit(ledger, limit): Ledger` — returns a copy with the new
     limit; throws `BudgetError` if `limit < usedImages(ledger)` (never orphan spend);
   - add `export function addMissingSlots(ledger, slotIds): Ledger` — appends a
     `{ id, attempts: [], status: 'open' }` record for every id not already present, and
     leaves existing records byte-identical.
2. `pipeline/cli/migrate.ts` — `--limit <n>` optional (default: current limit), prints what
   changed (old → new limit, slots added by id) and the budget summary. Writes only after all
   validations pass.
3. `pipeline/cli/init.ts` — use `DEFAULT_IMAGE_LIMIT` instead of the literal `80`.
4. `package.json` — add `"art:migrate": "tsx pipeline/cli/migrate.ts"` next to `art:init`.
5. Do not change `pipeline/registry/**`, `pipeline/steps/**` or `public/assets/**`.

## Acceptance criteria

- [ ] `npm run art:migrate -- --limit 120` exits 0 and `pipeline/budget.json` then reads
      `"limit": 120` with **every existing slot and attempt unchanged** — same ids, seeds,
      request ids, urls, costs, `selected`, `status`.
- [ ] `npm run art:status` reports the new ceiling and the same used count (6/120, $0.040).
- [ ] `art:migrate` with no `--limit` is a no-op that still adds missing slots.
- [ ] `art:migrate -- --limit 3` (below the 6 already used) exits non-zero and writes nothing.
- [ ] `setLimit` and `addMissingSlots` are covered by tests in `pipeline/lib/ledger.test.ts`…
      only if that file is already in the whitelist — it is **not**, so put the coverage in
      `pipeline/cli/migrate.ts`'s behaviour and report it from the verification commands
      instead. Do not touch the test file.
- [ ] `npm run test` and `npm run typecheck` pass. No `any`, no non-null assertions.

## Verification

```bash
npm run test && npm run typecheck
npm run art:migrate -- --limit 120
npm run art:status
node -e "const b=require('./pipeline/budget.json');console.log('limit',b.limit,'slots',Object.keys(b.slots).length,'used',Object.values(b.slots).reduce((n,s)=>n+s.attempts.filter(a=>a.state!=='released').length,0))"
npm run art:migrate -- --limit 3; echo "low-limit exit=$?"
```

## Out of scope

- Do not claim, generate, pull, select or atlas anything. No fal call.
- Do not change the 6-attempt per-slot cap.
- Do not reorder or rename existing slots.
