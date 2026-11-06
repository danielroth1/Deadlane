---
description: 'Generate one DEADLANE art slot through the fal MCP server, within the budget governor. Use for a single slot only.'
---

# One art slot, end to end

Arg: `<slot-id>` (for example `art-13-tiles-highway`).

## 0. Preconditions

```bash
npm run art:status
```

Stop if `remaining` is 0, the slot is already `approved`, or `attempts` is already 6.

## 1. Claim

```bash
npm run art:claim -- --slot <slot-id>
```

This prints a `run_model(...)` block. It is the only sanctioned way to spend an image.
If it refuses, read the reason — do not work around it.

## 2. Generate

Call the fal MCP `run_model` tool with **exactly** the printed arguments.

- One image. Always. The budget counts images, not calls.
- If the result is `processing`, poll with `check_job` and `get_job_result` — **never**
  call `run_model` again to check progress; that creates a second billable job.

## 3. Record

```bash
npm run art:pull -- --slot <slot-id> --attempt <n> \
  --request-id <request_id> --url <image_url> --cost <usd>
```

## 4. Process

```bash
npm run art:process -- --slot <slot-id>
```

Read the numbers before deciding anything:

| Metric | Healthy | Meaning |
| --- | --- | --- |
| `usable cells` | ≥ 10/16 | how many sprites survived slicing |
| `palette distance` | < 45 | how far the source colour drifted from the locked palette |
| `scale variance` | < 0.25 | whether the model kept a consistent sprite size |
| `seam error` | < 45 (tiles) | whether the sheet wraps |
| `score` | > 60 | weighted summary |

## 5. Retry — only with a diagnosis

A retry is allowed only when a metric names a fixable problem:

| Symptom | Fix |
| --- | --- |
| few usable cells, cells empty | grid contract not followed → retry, prompt emphasises the grid |
| high palette distance | colours too saturated → retry, prompt emphasises the 16-colour palette |
| high scale variance | sprites at different sizes → retry, prompt emphasises uniform scale |
| high seam error | tiles do not wrap → retry with the tiling clause emphasised |

"Looks bad" is not a diagnosis. Retries must use a new seed — the ledger rejects a
duplicate.

## 6. Select and pack

```bash
npm run art:select -- --slot <slot-id>
npm run art:atlas
npm run art:validate
```

## 7. Report

```
<slot-id>  attempt <n>/6  cells <u>/16  score <s>  images used <n>/80
```

If the slot needed more than three attempts, say which metric improved each time. If it hit
six, say so and recommend the best attempt explicitly.
