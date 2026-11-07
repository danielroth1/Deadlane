---
description: 'Work the DEADLANE gauntlet queue end to end: implement, review, record and commit one work order after another until the queue is empty or an order escalates. Use when told to run the gauntlet, continue the gauntlet loop, or work the queue.'
---

# Work the gauntlet queue

Keep going. Do not stop after one round and do not ask permission between rounds.

Repeat the round below until `npm run gauntlet:next` prints nothing dispatchable, or an
order escalates, or a fal call fails and needs a human. Then report once.

## Each round

### 1. Get the order

```bash
npm run gauntlet:next
```

If it reports nothing dispatchable, report that and stop.

### 2. Size guard

Before dispatching, check the order against these limits:

| Limit | Value |
| --- | --- |
| deliverables | 1 |
| files touched | ≤ 3 |
| changed lines | ≤ ~200 |

If it exceeds any limit, **split it**: add narrower orders to `gauntlet/state.json`, mark
the original `blocked` with a note, and continue with the next dispatchable order. Do not
dispatch an oversized order.

### 3. Art orders — the fal call is yours

If the order's steps include `art:claim`, do steps 2–3 of the order yourself, because
subagents have no fal tools:

```bash
npm run art:status
npm run art:claim -- --slot <slot-id>
```

Call `fal run_model` with **exactly** the endpoint, prompt, seed and `count: 1` the claim
printed. Save the raw result to `/tmp/<slot-id>-attempt-<n>-result.json` and a short
evidence file to `/tmp/<slot-id>-attempt-<n>-evidence.md` (claim output, request id, image
URL, `pricing.amountUsd` from `pipeline/registry/model.json`).

Poll `fal check_job` if the result is `processing`. Never call `run_model` twice on one
claim. On failure or a blocked account, `npm run art:release -- --slot <slot-id>
--attempt <n>` and stop.

### 4. Implementer

Dispatch one subagent (`implementer` mode) with exactly:

```
WORK ORDER
<the order text, verbatim>

FILES IN SCOPE
<the order's whitelist>

REFERENCE
<at most two file paths — for art orders, the two /tmp evidence files>
```

Nothing else. No repo tour, no history, no prior attempt. For art orders, tell it to
continue at `art:pull -- --slot <slot-id> --attempt <n> --request-id <id> --url <url>
--cost <usd>`, then `art:process`, `art:select`, `art:atlas`.

### 5. Reviewer

Dispatch a **new** subagent (`reviewer` mode) with exactly:

```
WORK ORDER
<the order text, verbatim>

DIFF
<unified diff of the round>

VERIFICATION
<command output from the implementer>
```

For art orders, add a `VISUAL` block: the verbatim output of `fal inspect_images` on the
generated URL, plus the `art:process` numbers (`usableCells`, `meanPaletteDistance`,
`sizeVariance`, `seamError`). Never include the implementer's report or reasoning — the
reviewer must judge the artefact, not the argument for it.

### 6. Record

```bash
npm run gauntlet:record -- --id <ID> --verdict pass --note "<one line>"
```

or

```bash
npm run gauntlet:record -- --id <ID> --verdict fail --note "<criteria that failed>"
```

On `fail`, run step 4 again with a **fresh** implementer and the reviewer's numbered
issues appended to the work order block. Do not reuse the previous implementer's context.
Three rounds and the order escalates automatically — stop there and report it.

### 7. Commit

One commit per round — the round's diff, `gauntlet/state.json`, and the new verdict file:

```bash
git add -A && git status --short
git commit -q -m "<ID> <verdict>: <one line>"
```

Read `git status` before staging. Never commit a credential, never commit
`pipeline/raw/`.

### 8. Next round

Go back to step 1. Do not summarise in between.

## Final report

When the queue drains or an order escalates, report at most six lines:

```
rounds: <n>   passed: <ids>   failed: <ids>
escalated: <id or none>
images used: <n>/80
next: <order id or "escalated to human" or "queue empty">
```

Stop there.

