# Copilot instructions

Read [`AGENTS.md`](../AGENTS.md) first — it is the single source of truth for how work
happens in this repository.

The three rules that matter most:

1. **Never call a fal generation tool without `npm run art:claim` first.** The lifetime
   ceiling is 80 images and the ledger is the audit trail.
2. **Work in gauntlet rounds.** One implementer, one fresh reviewer, verdict recorded with
   `npm run gauntlet:record`.
3. **Only edit files in the current work order's whitelist.**

Run before reporting done:

```bash
npm run typecheck && npm run test && npm run art:validate
```
