# Copilot instructions

`AGENTS.md` is the single source of truth for how work happens here.
`.github/instructions/*.instructions.md` attach the gameplay, pipeline and test rules by path,
so they are already in context when you touch those files.

Always-on rules:

1. **Never call a fal generation tool without `npm run art:claim` first.** There is no
   lifetime image ceiling and no per-slot attempt cap; the ledger is still the audit trail.
2. **Work the whole queue, not one round.** Plan with `/gauntlet-plan`, run with `/gauntlet`.
3. **Solve the work order; don't refactor what it didn't ask about.** No file whitelist —
   change whatever the fix needs.

Run before reporting done:

```bash
npm run typecheck && npm run test && npm run art:validate
```
