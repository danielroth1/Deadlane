---
description: 'DEADLANE asset factory rules: claim before generating, never hand-edit budget or atlas'
applyTo: 'pipeline/**'
---

# Asset factory rules (`pipeline/`)

- **Claim before you spend.** Never call a fal generation tool without
  `npm run art:claim -- --slot <slot-id>` immediately before it in the same round, and never
  generate twice on one claim. One image per claim; a claim that is never used is still spent
  budget.
- **Never hand-edit `pipeline/budget.json` or `public/assets/atlas/*`.** They are produced by
  the CLIs. Change the script, then re-run it.
- **Never commit `pipeline/raw/`,** and never commit `pipeline/work/` — both are generated
  scratch, and `work/` is not gitignored.
- **Never write a fal key or OAuth token anywhere.** The relay authenticates through the
  editor; there is no `FAL_KEY` in this project and there must never be one.
- **Limits are fixed:** 150 images lifetime, 6 attempts per slot. Never raise either without
  the human saying so in the conversation.
- **After a reviewer FAIL on a selected attempt,** run
  `npm run art:reopen -- --slot <slot-id>` before re-claiming — `art:claim` refuses an
  approved slot and `release` does not clear the slot status.
- **`art:process` is not idempotent across labels.** It overwrites `cell-<i>.png` for every
  non-empty cell, and prompts drift from the declared cell order, so map ids from the pixels,
  not from the labels.
