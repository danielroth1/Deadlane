# The image ledger

DEADLANE used to cap art spending at **150 generated images for the life of the project**
with a **6-attempt cap per slot**. The human removed both limits: image cost is no longer
the limiting factor, and the art needs room to grow. What remains is the audit trail — every
image is claimed before it is requested, and every claim is recorded in
`pipeline/budget.json`.

There is no ceiling to be "under". The point of the ledger is now to answer "what did we
generate, with which seed and prompt, and what did it cost?" without trusting a chat log.

## The numbers

| Limit | Value | Enforced by |
| --- | --- | --- |
| Lifetime images | **none** | `pipeline/lib/ledger.ts` — `limit` is optional |
| Attempts per slot | **none** | `pipeline/lib/ledger.ts` — `perSlotLimit` is optional |
| Slots | 25, fixed for the project | `pipeline/registry/slots.ts` |

Both caps are still *supported*. A ledger that carries `limit` or `perSlotLimit` enforces
it; a ledger without those fields is unlimited. `npm run art:migrate -- --unlimited` is the
sanctioned way to remove them, and `--limit <n>` / `--per-slot <n>` set them again if the
human ever asks for that. Never edit the numbers into `budget.json` by hand.

## The rules

**R1 — optional lifetime limit.** If the ledger satisfies `limit`, `art:claim` refuses once
that many images are consumed. Without the field there is no ceiling at all.

**R2 — optional per-slot cap.** If the ledger sets `perSlotLimit`, a slot refuses further
attempts after that many. Without it a slot can be retried as long as the work needs.

**R3 — retries must differ.** Every attempt in a slot needs a distinct seed. A retry with
the same seed produces the same image, so it is refused as a duplicate.

**R4 — a claim is taken before generation and released only when nothing was produced.**
`art:claim` writes the attempt with `state: "claimed"`, and only then may `run_model` be
called. If generation fails or returns no image, `art:release` returns it. A bad image is
never released — it was billed, and it stays in the ledger.

## Why a ledger and not a spreadsheet

Each attempt is written to `pipeline/budget.json` before the image is requested:

```json
{
  "attempt": 3,
  "seed": 1182341,
  "promptHash": "9f2c...",
  "state": "claimed",
  "requestId": "...",
  "url": "...",
  "costUsd": 0.02
}
```

`state` moves `claimed → generated`, or `claimed → released` when generation failed and the
image is given back. `art:status` renders the whole ledger, so at any moment you can answer
"what have we generated, and what did it buy?" without reading the JSON.

## Day-to-day

```bash
npm run art:status                  # images used, per-slot attempts, picks
npm run art:claim -- --slot <id>    # reserve an image, print the run_model call
npm run art:pull -- …               # record the result and download it
npm run art:process -- --slot <id>  # slice, quantise, score
npm run art:select -- --slot <id>   # pick the best attempt
npm run art:atlas                   # repack the game assets
npm run art:validate                # technical gate + style warnings
```

## When something goes wrong

| Situation | Do this |
| --- | --- |
| `run_model` errored, no image produced | `art:release` — the image is given back |
| Image exists but is unusable | **Do not release it.** It was billed. Retry with a new seed |
| A slot keeps failing its brief | Change the slot spec or the prompt, then retry; there is no attempt cap |
| A selected attempt fails review | `art:reopen` the slot, then claim a retry with a new seed |
| `art:validate` reports style warnings | Read them; they are preferences and do not fail the gate |
| `art:validate` reports technical failures | Fix the sheet — the atlas or the game would break |
| Tempted to edit `budget.json` | Don't. Use `art:migrate`, `art:claim`, `art:release` |

## What the budget buys

The pipeline spends money only on **composition** — what shapes are in the frame. Scale,
palette, outlines, recolours, damage states and every animation frame are produced in code
by `pipeline/steps/` and `src/art/`. Sheets cover a game that would otherwise need several
hundred sprites, because nothing that can be derived is ever generated.
