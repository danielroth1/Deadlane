# WO-21 — Player vehicle sheet becomes a 2×2 hero sheet

## Goal

Turn `art-02-player-vehicle` from a 4×4 sheet of sixteen 64 px cells into a 2×2 sheet of four
128 px cells, and stop the house style from painting road markings behind every subject.

## Context

The WO-11 gate measured 9/16 usable cells at 64 px. The failures were not the model being
bad at grids — they were size (a car trimmed to 19×34 px inside a 64 px cell) and content the
prompt asked for: `interceptor banking left/right` and three `speedboat` cells are rotated by
definition, and `HOUSE_STYLE` names "every lane marking and every guardrail", so the model
paints lane paint into a vehicle sheet.

The human has decided: vehicle sheets become 2×2 at 128 px, and the image ceiling is now 120
(WO-20), which leaves room for the states that no longer fit in one sheet.

## Files (whitelist)

- `pipeline/registry/slots.ts`
- `pipeline/registry/prompts.ts`
- `docs/ART_BIBLE.md`

## Steps

1. `art-02-player-vehicle`: `grid` becomes `{ cols: 2, rows: 2 }`, `finalSize` becomes `128`.
2. Keep exactly these four cells, in reading order — every one axis-aligned, nose up:
   `interceptor clean`, `interceptor damaged`, `interceptor wrecked`, `hover interceptor`.
3. Rewrite that slot's `subject` so it describes four separate subjects in four cells (one car
   per cell, same scale, same pose, pointing up), and its `emphasis` so it forbids: rotation
   or banking, side-on or three-quarter views, road markings/lane paint, tyre smoke, and any
   shadow cast onto the background.
4. `HOUSE_STYLE` in `prompts.ts`: replace the clause that enumerates `every car, every lane
   marking and every guardrail` with a generic one — the outline requirement must apply to
   **every shape of every subject**, without naming scenery the sheet slots must not draw.
   Keep the overhead camera, palette, lighting, pixel and no-text clauses byte-identical.
5. Do not touch any other slot's grid, `finalSize`, subject or cells. `art-07-boss` (2×2) and
   the 4×4 prop/tile/UI slots stay as they are.
6. `docs/ART_BIBLE.md` §5: record (a) the vehicle sheets are 2×2 @128 px with axis-aligned
   subjects only, (b) that the dropped player states — speedboat clean/damaged/wrecked, oil
   pod, smoke pod, headlights on, shield active, trailing exhaust, banking left/right,
   airborne — are **owed** and must be carried by new 2×2 slots when the batch order runs,
   and (c) remove the round-1 claim that "packed sheets are not viable" or the round-2 claim
   that "the gate passes", and state the measured facts only: 9/16 usable at 64 px, key now
   correct at 79.9%, decision = 2×2 @128 px.

## Acceptance criteria

- [ ] `art-02-player-vehicle` composes a prompt containing `a strict 2 by 2 grid` and **not**
      `4 by 4`; it contains `128`; it contains none of `banking`, `speedboat`, `oil-slick`,
      `shield active`.
- [ ] The composed prompt for `art-01-style-anchor` is unchanged except for the `HOUSE_STYLE`
      clause in step 4 — it still contains `lane markings` (from its own subject) and still
      contains `perpendicular to the ground`.
- [ ] `frameId()` still produces `player-vehicle/interceptor-clean` for cell 0, so
      `src/entities/player.ts` keeps resolving.
- [ ] No other slot's `grid` or `finalSize` changed — verify by diff.
- [ ] `npm run test` and `npm run typecheck` pass. No `any`, no non-null assertions.

## Verification

```bash
npm run test && npm run typecheck
npx tsx -e "(async () => { const { buildPrompt, HOUSE_STYLE } = await import('./pipeline/registry/prompts.ts'); const { requireSlot } = await import('./pipeline/registry/slots.ts'); console.log('HOUSE:', HOUSE_STYLE); for (const id of ['art-02-player-vehicle','art-01-style-anchor']) { const s = requireSlot(id); const p = buildPrompt(s); console.log(id, s.grid.cols + 'x' + s.grid.rows, s.finalSize); console.log(p.prompt); } })()"
git --no-pager diff --stat
```

## Out of scope

- Do not call any fal tool and do not run any `art:*` CLI except read-only status.
- Do not change the palette, the model pin, the budget, `pipeline/steps/**` or
  `pipeline/lib/**`.
- Do not add the new slots for the owed states — that is a later order.
