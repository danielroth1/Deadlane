# WO-10 — Art slot 01: style anchor

## Goal

Produce and approve the single image that defines the visual language for the entire game.

This is the reference every later sheet will be judged against, so it is worth more care
than any other slot.

## Context

Read `docs/ART_BIBLE.md` first. The prompt is already written: `pipeline/registry/prompts.ts`
composes the house style, and `pipeline/registry/slots.ts` defines what this slot contains.

This slot is `kind: "single"`, so the grid contract does not apply — it is one hero frame
that doubles as title-screen art.

## Files (whitelist)

- `public/assets/assets.json` (via `npm run art:atlas` only)
- `pipeline/budget.json` (via the art CLIs only)
- `pipeline/work/art-01-style-anchor/**`
- `docs/ART_BIBLE.md` (only to record the approved palette order)

## Steps

1. `npm run art:claim -- --slot art-01-style-anchor`
2. Call the fal MCP `run_model` tool with exactly the arguments that command printed.
   Keep `num_images` (or whatever `params.count` is) at **1**.
3. `npm run art:pull -- --slot art-01-style-anchor --attempt 1 --request-id <id> --url <url> --cost <usd>`
4. `npm run art:process -- --slot art-01-style-anchor`
5. `npm run art:select -- --slot art-01-style-anchor`
6. `npm run art:atlas`

If the result is unusable, record why and retry with a **different** seed — the ledger
refuses duplicate seeds on purpose. Maximum 6 attempts, then `art:select` the best.

## Acceptance criteria

- [ ] The image reads as a top-down game still, not a poster.
- [ ] Colours sit inside the 16-colour palette after quantisation; no pastel, no gradient.
- [ ] The road markings and the car silhouette are legible at 320px wide.
- [ ] `pipeline/budget.json` shows exactly the number of images you actually used.
- [ ] `npm run art:validate` passes.
- [ ] The game still builds and the title screen renders exactly one sprite and one sheet.
      The scene's literal format is `ART 1 SPRITES / 1 SHEETS` (`src/scenes/TitleScene.ts`);
      confirm it from the rendered page (or from an equivalent assertion), not inferred from
      a passing build.

## Verification

```bash
npm run art:status
npm run art:atlas && npm run art:validate
npm run test && npm run typecheck && npm run build
npm run test:e2e
```

## Reviewer rubric

Score 0–5 on each axis from `docs/ART_BIBLE.md` §7. Any axis below 3 is a FAIL, with the
axis named in the verdict.

## Out of scope

- Generating any other slot.
- Editing the house style prompt without a human decision.
