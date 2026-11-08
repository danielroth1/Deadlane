---
description: 'Work the DEADLANE gauntlet queue end to end: implement, review, record and commit every dispatchable work order in one run. Use when told to run the gauntlet, continue the gauntlet loop, or work the queue.'
agent: 'orchestrator'
---

# Work the gauntlet queue

The procedure is `.github/agents/orchestrator.agent.md` — that file is the single source of
truth for the loop, the art steps, the stop conditions and the commit rule. This prompt
exists so `/gauntlet` is one keystroke and already in the right agent mode.

Work the whole queue in one run:

```bash
npm run gauntlet:next
```

then implement → review → record → commit per round, repeating until nothing is
dispatchable. If the `orchestrator` agent mode did not load, read
`.github/agents/orchestrator.agent.md` and follow it exactly.


