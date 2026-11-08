---
description: 'Work the DEADLANE gauntlet queue end to end: implement, review, record and commit every dispatchable work order in one run. Use when told to run the gauntlet, continue the gauntlet loop, or work the queue.'
---

# Work the gauntlet queue

Keep going until the queue is empty. Do not stop after one round, do not stop because an
order failed, and do not ask permission between rounds.

Repeat the round below until `npm run gauntlet:next` prints nothing dispatchable. The only
other reason to stop early is a broken environment (no fal tool, blocked fal account,
failing `typecheck`/`test` baseline) — see [When to stop](#when-to-stop).

## Each round

### 1. Get the order

```bash
npm run gauntlet:next
```

If it reports nothing dispatchable, report that and stop.

### 2. Art orders — the fal call is yours

If the order's steps include `art:claim`, do steps 2–3 of the order yourself, because
subagents have no fal tools:

```bash
npm run art:status
npm run art:claim -- --slot <slot-id>
```

If the fal `run_model` tool is not in your toolset, stop **before** claiming and report
`blocked: no fal tool available to the orchestrator`.

Call `run_model` with **exactly** the endpoint, prompt, seed and `count: 1` the claim
printed. Save the raw result to `/tmp/<slot-id>-attempt-<n>-result.json` and a short
evidence file to `/tmp/<slot-id>-attempt-<n>-evidence.md` (claim output, request id, image
URL, `pricing.amountUsd` from `pipeline/registry/model.json`).

Poll `check_job` if the result is `processing`. Never call `run_model` twice on one
claim. On failure or a blocked account, `npm run art:release -- --slot <slot-id>
--attempt <n>`, then either record `escalate` for this order (slot-specific failure) and
carry on, or stop (fal itself unavailable).

### 3. Implementer

Dispatch one subagent (`implementer` mode) with the work order text, verbatim:

```
WORK ORDER
<the order text, verbatim>

REFERENCE
<art orders only: the two /tmp evidence files>
```

Nothing else — the implementer works out what to change and how. For art orders, tell it to
continue at `art:pull -- --slot <slot-id> --attempt <n> --request-id <id> --url <url>
--cost <usd>`, then `art:process`, `art:select`, `art:atlas`.

### 4. Reviewer

Dispatch a **new** subagent (`reviewer` mode) with:

```
WORK ORDER
<the order text, verbatim>

DIFF
<unified diff of the round>

VERIFICATION
<command output from the implementer>
```

For art orders, add a `VISUAL` block: the verbatim output of `inspect_images` on the
generated URL, plus the `art:process` numbers (`usableCells`, `meanPaletteDistance`,
`sizeVariance`, `seamError`). Never include the implementer's report or reasoning — the
reviewer must judge the artefact, not the argument for it.

### 5. Record

```bash
npm run gauntlet:record -- --id <ID> --verdict pass --note "<one line>"
```

or

```bash
npm run gauntlet:record -- --id <ID> --verdict fail --note "<what the review found>"
```

On `fail`, run step 3 again with a **fresh** implementer and the reviewer's feedback
appended to the work order block. Do not reuse the previous implementer's context.

The three-round cap is per order. When it runs out, `gauntlet:record` escalates that order:
note the blocker, then go back to step 1 and take the next dispatchable order. Do not start
a fourth round on the same order.

### 6. Commit

One commit per round — the round's diff, `gauntlet/state.json`, and the new verdict file:

```bash
git add -A && git status --short
git commit -q -m "<ID> <verdict>: <one line>"
```

Read `git status` before staging. Never commit a credential, never commit
`pipeline/raw/`.

### 7. Next round

Go back to step 1. Do not summarise in between.

## When to stop

Stop and report only when `npm run gauntlet:next` prints nothing dispatchable, or the
environment is broken for every remaining order (no fal tool, blocked fal account, failing
`typecheck`/`test` baseline). An escalated order is not a stop signal — it is parked in
`gauntlet/state.json` for the human.

## Final report

When the queue drains, report once:

```
rounds: <n>   passed: <ids>   escalated: <ids + one-line reason each>
images: <used>/<ceiling> (from `npm run art:status`)
next: plan the next orders with /gauntlet-plan
```

Stop there. Do not author new work yourself — planning is a conversation with the human.

