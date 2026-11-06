# The image budget

DEADLANE has a hard ceiling of **80 generated images for the life of the project**. This
document explains how that number is spent, why the rules are enforced by code rather than
by good intentions, and what to do when something goes wrong.

## The numbers

| Limit | Value | Enforced by |
| --- | --- | --- |
| Lifetime images | 80 | `pipeline/lib/ledger.ts` rule R1 |
| Attempts per slot | 6 (1 + 5 retries) | rule R2 |
| Slots | 20, fixed for the project | `pipeline/registry/slots.ts` |

80 / 20 = 4 attempts per slot on average. That is the design point: one image to see
whether the approach works, three to get it right.

## The four rules

**R1 — lifetime ceiling.** Once 80 images are consumed, `art:claim` refuses. There is no
override. Shipping happens with whatever exists.

**R2 — per-slot cap.** A slot may be attempted six times. After that, `art:select` chooses
the best existing attempt and the slot is closed for good.

**R3 — no starving.** A retry is refused if spending it would leave a slot that has never
been attempted with no budget at all. This forces a first pass across all 20 slots before
any slot gets polished. In practice it is the rule that produces a complete-looking game
instead of three beautiful sheets and seventeen placeholders.

**R4 — retries must differ.** Every attempt in a slot needs a distinct seed. A retry with
the same seed produces the same image and burns money for nothing.

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
"how many images do we have left, and what did they buy?" without trusting a chat log.

## Day-to-day

```bash
npm run art:status                  # budget, per-slot attempts, picks
npm run art:claim -- --slot <id>    # reserve an image, print the run_model call
npm run art:pull -- …               # record the result and download it
npm run art:process -- --slot <id>  # slice, quantise, score
npm run art:select -- --slot <id>   # pick the best attempt
npm run art:atlas                   # repack the game assets
npm run art:validate                # CI gate
```

## When something goes wrong

| Situation | Do this |
| --- | --- |
| `run_model` errored, no image produced | `art:release` — the image is given back |
| Image exists but is unusable | **Do not release it.** It was billed. Retry with a new seed |
| A slot used all six attempts | `art:select --attempt <best>` and move on |
| Budget exhausted, game still has gaps | Ship. `src/art/placeholders.ts` covers every missing sprite |
| Tempted to raise 80 | Ask the human first. This is their money and their call |

## What the budget buys

The pipeline spends money only on **composition** — what shapes are in the frame. Scale,
palette, outlines, recolours, damage states and every animation frame are produced in code
by `pipeline/steps/` and `src/art/`. Twenty sheets cover a game that would otherwise need
several hundred sprites, because nothing that can be derived is ever generated.
