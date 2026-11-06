---
description: 'Run one full DEADLANE gauntlet round: dispatch an implementer for the next work order, then a fresh reviewer, then record the verdict.'
---

# Gauntlet round

Run one round. Nothing else.

## 1. Get the order

```bash
npm run gauntlet:next
```

If it reports nothing dispatchable, report that and stop.

## 2. Size guard

Before dispatching, check the order against these limits:

| Limit | Value |
| --- | --- |
| deliverables | 1 |
| files touched | ≤ 3 |
| changed lines | ≤ ~200 |

If it exceeds any limit, **split it**: add narrower orders to `gauntlet/state.json`, mark
the original `blocked` with a note, and stop. Do not dispatch an oversized order.

## 3. Implementer

Dispatch one subagent (`implementer` mode) with exactly:

```
WORK ORDER
<the order text, verbatim>

FILES IN SCOPE
<the order's whitelist>

REFERENCE
<at most two file paths>
```

Nothing else. No repo tour, no history, no prior attempt.

## 4. Reviewer

Dispatch a **new** subagent (`reviewer` mode) with exactly:

```
WORK ORDER
<the order text, verbatim>

DIFF
<unified diff of the round>

VERIFICATION
<command output from the implementer>
```

Never include the implementer's report or reasoning — the reviewer must judge the artefact,
not the argument for it.

## 5. Record

```bash
npm run gauntlet:record -- --id <ID> --verdict pass --note "<one line>"
```

or

```bash
npm run gauntlet:record -- --id <ID> --verdict fail --note "<criteria that failed>"
```

On `fail`, run step 3 again with a **fresh** implementer and the reviewer's numbered
issues appended to the work order block. Do not reuse the previous implementer's context.

## 6. Report

Four lines maximum:

```
<ID>  <PASS|FAIL>  <one-line reason>
next: <order id or "escalated to human">
images used: <n>/80
```

Stop there.
