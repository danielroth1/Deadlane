# WO-13 — Remaining art slots 03-20

## Goal

Fill the remaining 18 art slots within the leftover budget, one slot per gauntlet round.

## Context

Only run this after WO-11's gate has passed: it commits ~70 images. Each slot is one
implementer + reviewer pair; do not batch slots into one round, because a failed batch
wastes more budget than a failed slot.

Budget maths: 80 images total, 20 slots, 6 attempts each maximum. After slots 01 and 02 the
remaining budget is whatever `npm run art:status` says — trust it over arithmetic.

## Files (whitelist)

- `pipeline/work/**`
- `pipeline/budget.json` (via the art CLIs only)
- `public/assets/**` (via `npm run art:atlas` only)
- `src/art/index.ts` — only if a generated frame id needs adding to a candidate list

## Order of work

Slots are independent once the style anchor exists. Do them in this order, because it
front-loads the ones that unblock gameplay:

1. `art-13-tiles-highway`, `art-14-tiles-canyon`, `art-16-tiles-city` — the three most
   visible roads.
2. `art-03-enemy-ground-a`, `art-08-civilians`, `art-10-fx`, `art-09-weapons-pickups`.
3. `art-17-tiles-tunnel`, `art-15-tiles-water`, `art-18-tiles-transition`.
4. `art-04-enemy-ground-b`, `art-05-enemy-air`, `art-06-enemy-sea`.
5. `art-11-props-a`, `art-12-props-b`.
6. `art-19-ui-icons`, `art-20-ui-chrome`, `art-07-boss`.

## Per-slot loop

```bash
npm run art:claim -- --slot <id>
# run_model with the printed arguments (one image)
npm run art:pull -- --slot <id> --attempt <n> --request-id <r> --url <u> --cost <c>
npm run art:process -- --slot <id>
npm run art:select -- --slot <id>
```

Retry only when a metric names a fixable problem. A retry costs an image; a vague "looks
bad" is not a reason.

## Acceptance criteria

- [ ] Every slot is `approved` or explicitly `skipped`, with a note saying why.
- [ ] `npm run art:validate` passes: in-palette, correct dimensions, no empty frames, tiles
      wrap.
- [ ] `pipeline/budget.json` never exceeds 80, and no slot exceeds 6 attempts.
- [ ] The game renders with generated art for every road type.
- [ ] Total recorded spend is reported in the final verdict.

## Verification

```bash
npm run art:status
npm run art:validate
npm run test && npm run typecheck && npm run build
```

## Out of scope

- Raising the budget.
- Hand-editing generated atlases.
