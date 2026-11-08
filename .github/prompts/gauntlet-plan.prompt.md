---
description: 'Plan the next stretch of DEADLANE work: run a gap analysis toward a fully functioning game, discuss the candidate work orders with me, then have the planner write the accepted ones into gauntlet/ as pending orders the orchestrator can dispatch. Use when the queue is drained, when planning a new phase, or when asked what to build next.'
---

# Plan the next work orders

You are planning, not implementing. Nothing in `src/`, `pipeline/`, `public/` or `docs/`
changes in this session.

## 1. Fix the target

Restate the goal in one sentence. If I gave one, use it verbatim and move on — do not
interview me. If I did not, use the `planner` agent's definition of a fully functioning
game (boots, plays, progresses, ends, looks finished, ships, feels complete) and say so.

## 2. Get the gap analysis

Dispatch the **planner** subagent with the goal and the definition of done, and say this is the
analysis turn. It returns `GOAL GAPS`, `CANDIDATE ORDERS` and `NOT DOING`, and writes nothing.
Keep its evidence — quote the gaps, do not rewrite them from memory, and do not plan from your
own recollection of the codebase.

## 3. Discuss

Present the candidates as a numbered list, one line each:

```
1. <title> — <gap it closes> · verify: <command> · depends on: <n> · size: S/M/L
```

Then ask exactly three questions:

- which orders to keep, drop or merge,
- whether the ordering is right (which one lands first),
- whether any gap is out of scope for this phase.

Revise the list as I answer. Keep it under twelve lines; if it is longer, merge. Do not
write files yet. Do not start work.

## 4. Write the accepted plan

Only after I approve, in however many words: dispatch the **planner** again with the approved
list — the keep/drop/merge decisions and the final ordering — and say this is the write turn.
It creates the work-order files, appends the state entries, proves the queue dispatches with
`npm run gauntlet:status` and `npm run gauntlet:next`, and commits
`chore: plan WO-<first>..WO-<last>`.

Do not write those files yourself. The planner owns the file shape, the id allocation and the
commit; you relay the decisions and check the result.

When it returns, show me its `QUEUE` line and commit, then hand back with: "run `/gauntlet`".

## Rules

- Planning writes only `gauntlet/` — never game code, pipeline code, content data or docs.
  The planner is the only writer; you dispatch it and report.
- Never raise the image ceiling or the attempt cap. Art work names its slot id and fits the
  existing budget.
- Never reopen a `done` order. Plan a new one that supersedes it.
- An escalated order is context, not a plan item: mention it and let me decide whether its
  blocker becomes a new order.
- If I ask for an order the planner never surfaced, put it in the write-turn dispatch — I am
  the authority on scope.
- Everything else — what makes a good order, what the planner may read, the output shape —
  is owned by `.github/agents/planner.agent.md`. Do not restate it here.
