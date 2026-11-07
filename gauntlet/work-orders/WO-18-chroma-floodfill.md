# WO-18 — Key the magenta backdrop by flood fill, not an exact colour

## Goal

Make `chromaKey()` remove the flat magenta field whatever its exact hex, so a generated
subject with a `#ee0466`-style backdrop is keyed instead of shipping a pink plate.

## Context

Attempt 5 of the style anchor is the first with a keyable backdrop, but the model rendered it
as `#ee0466`. `chromaKey()` compares each pixel to `palette.transparentKey` (`#ff00ff`) with a
Manhattan tolerance of 90; the distance here is 174, so **0 of 1,048,576 pixels were keyed**.
The processed cell stayed a 601×601 opaque plate, 48% of it hot-pink, `outline()` only traced
the plate perimeter, and `meanPaletteDistance` jumped to 62.6.

The fix must not key palette colour 15 `hot-pink` (`#ff2e63`) on the subject, which is closer
to magenta than the backdrop is. The reliable discriminator is connectivity: the backdrop is a
flat region touching the image border; subject pixels are enclosed by the subject.

## Files (whitelist)

- `pipeline/lib/image.ts`
- `pipeline/lib/image.test.ts` (new)

## Steps

1. Rewrite `chromaKey(raster, keyHex, tolerance = 90)` so it keys a **border-connected** region
   of magenta-family pixels:
   - seed from every border pixel that is within `tolerance * 2` (Manhattan) of `keyHex`;
   - flood fill 4-connected through pixels within the same distance of `keyHex`;
   - set those pixels transparent; leave every enclosed pixel untouched even if its colour is
     magenta-family.
   Keep the exported signature and the `Raster` shape unchanged — `pipeline/steps/process-slot.ts`
   must keep compiling with `chromaKey(source, palette.transparentKey)`.
2. Add `pipeline/lib/image.test.ts` covering: an exact `#ff00ff` backdrop keys to transparent;
   an `#ee0466` backdrop keys to transparent; a `#ff2e63` block **enclosed** by an opaque plate
   survives with its pixels intact; border pixels that are not magenta-family are left alone.
3. Do not change `pipeline/registry/palette.json`, `pipeline/steps/process-slot.ts`, or any
   other slot/registry file.

## Acceptance criteria

- [ ] `chromaKey` keys a flat `#ee0466` border-connected backdrop (0% of it left opaque).
- [ ] An enclosed `#ff2e63` region is preserved pixel-for-pixel.
- [ ] Signature and call sites unchanged; `npm run typecheck` passes.
- [ ] New tests pass; `npm run test` still passes in full. No `any`, no non-null assertions.
- [ ] No other file is modified.

## Verification

```bash
npm run test && npm run typecheck
git --no-pager diff --stat
```

## Out of scope

- Do not run any `art:*` CLI and do not call any fal tool. The orchestrator re-processes the
  existing attempt afterwards with no new spend.
- Do not touch `pipeline/registry/*`, `pipeline/steps/*`, the budget, or `public/assets/*`.
