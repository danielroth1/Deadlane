# WO-16 — Force a strict overhead camera in the house style

## Goal

Make the composed prompt demand a genuinely orthographic, overhead, pixel-art game view,
and drop the wording that was literally asking the model for a horizon.

## Context

The round 1 style anchor came back as a one-point-perspective bridge shot with a horizon and
a car seen from behind-above. `docs/ART_BIBLE.md` requires the game to be seen from directly
above. Two prompt strings are responsible:

- `HOUSE_STYLE` in `pipeline/registry/prompts.ts` says `viewed directly from above` but not
  that the camera is perpendicular to the ground, nor that horizons and vanishing points are
  forbidden.
- the `art-01-style-anchor` subject in `pipeline/registry/slots.ts` asks for `distant city
  lights on the horizon`, which invites exactly the composition that was rejected.

The human has approved changing the house style prompt in this order (normally out of scope).

## Files (whitelist)

- `pipeline/registry/prompts.ts`
- `pipeline/registry/slots.ts`

## Steps

1. `HOUSE_STYLE` — rewrite the opening clause so the camera is unambiguous and the medium is
   named up front, e.g. `retro 2D pixel art game still, strict top-down orthographic view
   from directly overhead, camera perpendicular to the ground plane, flat map-like framing,
   no horizon, no sky, no vanishing point`. Keep the existing palette, lighting, pixel-crisp
   and no-text clauses. Keep `exactly one pixel dark outline around every shape`, and make it
   explicit that the outline applies to every element in the frame (car, lane markings,
   guardrails) so it survives on a full-bleed scene that has no magenta to chroma-key.
2. `NEGATIVE_HINTS` — add `no horizon`, `no sky`, `no vanishing point`, `no one-point
   perspective`, `no chase camera`.
3. `pipeline/registry/slots.ts`, `art-01-style-anchor` — remove `distant city lights on the
   horizon` and any sky reference from the subject; describe the city as flat light
   reflected on wet asphalt instead. Make the `emphasis` text say the camera is perpendicular
   to the ground and that the whole frame is road surface with no horizon.
4. Do not change any other slot's subject text, grid, `finalSize`, or the slot list.

## Acceptance criteria

- [ ] The composed prompt for `art-01-style-anchor` contains `no horizon` and
      `perpendicular to the ground` (or equivalent wording that says both), and contains no
      occurrence of the word `horizon` inside `CONTENT:`.
- [ ] `HOUSE_STYLE` still names the 16-colour palette, the 1-pixel dark outline, the
      no-text rule, and still forbids gradients/glow/anti-aliasing.
- [ ] `npm run test` and `npm run typecheck` pass. No `any`, no non-null assertions.
- [ ] No slot count, grid, `finalSize` or budget value changes.

## Verification

```bash
npm run test && npm run typecheck
npx tsx -e "(async () => { const { buildPrompt } = await import('./pipeline/registry/prompts.ts'); const { requireSlot } = await import('./pipeline/registry/slots.ts'); const p = buildPrompt(requireSlot('art-01-style-anchor')); console.log('PROMPT:', p.prompt); console.log('NEGATIVE:', p.negativePrompt); })()"
```

## Out of scope

- Do **not** call any fal tool and do not run `art:claim`, `art:pull`, `art:process`,
  `art:select` or `art:atlas`.
- Do not change the image model, the pricing, the budget, or the outlined/chroma-key step in
  `pipeline/steps/`.
- Do not expand the palette or reorder `pipeline/registry/palette.json`.
