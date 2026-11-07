# WO-17 — Remove the light pool and tyre smoke from the anchor subject

## Goal

Make the style-anchor subject describe a flat, uniformly lit night highway, so the model
stops painting a streetlight cone and soft smoke that quantise to an olive wash and stepped
translucency.

## Context

Round 2 and 3 of WO-10 failed the palette axis: the subject text asks for
`flat city light reflected on the wet asphalt` and `tyre smoke behind the rear wheels`. The
model renders both as a soft warm falloff — a streetlight cone plus a blown-out core — and
as translucent smoke. After quantisation the falloff becomes an olive wash
(`#4e7a3f`, 18,590 px) that is not in the source, and the smoke becomes stepped grey. Both
are banned by `docs/ART_BIBLE.md` §8 (no glows) and §2 (flat fills, binary alpha).

The human has decided the anchor drops the light pool and the smoke.

## Files (whitelist)

- `pipeline/registry/slots.ts`

## Steps

1. In the `art-01-style-anchor` `subject`, remove `flat city light reflected on the wet
   asphalt` and `tyre smoke behind the rear wheels`.
2. Replace them with wording that demands uniform flat lighting and nothing cast onto the
   road, e.g. `uniform flat night ambient light across the asphalt, no light pools, no
   streetlight cones, no smoke`.
3. Keep the car, the eight-lane asphalt highway, the lane markings and the steel guardrails.
   Keep the emphasis lines as they are.
4. Change nothing else in the file: no other slot's subject, grid or `finalSize`, no
   `HOUSE_STYLE`, no palette.

## Acceptance criteria

- [ ] The composed prompt for `art-01-style-anchor` contains none of `tyre smoke`,
      `wet asphalt` or `reflected`.
- [ ] The composed prompt contains `no light pools` and `no smoke` (or wording that says the
      same thing).
- [ ] Every other slot's `subject`, `grid` and `finalSize` are unchanged — verify by diffing,
      not by reading.
- [ ] `npm run test` and `npm run typecheck` pass. No `any`, no non-null assertions.

## Verification

```bash
npm run test && npm run typecheck
npx tsx -e "(async () => { const { buildPrompt } = await import('./pipeline/registry/prompts.ts'); const { requireSlot } = await import('./pipeline/registry/slots.ts'); const p = buildPrompt(requireSlot('art-01-style-anchor')); console.log('PROMPT:', p.prompt); })()"
git --no-pager diff --stat -- pipeline/registry/slots.ts
```

## Out of scope

- Do not call any fal tool and do not run `art:claim`, `art:pull`, `art:process`,
  `art:select`, `art:reopen` or `art:atlas`.
- Do not touch `pipeline/registry/prompts.ts`, the palette, the model pin, the budget, or
  `pipeline/steps/`.
