# WO-19 — Decide the backdrop by hue and saturation, not distance from one hex

## Goal

Make `chromaKey()` recognise the flat magenta backdrop whatever its brightness, so a sheet
painted as `#df0b61`–`#ee0466`–`#c60756` keys cleanly instead of shipping pink plates.

## Context

The endpoint paints the backdrop as magenta in *hue* (~330–340°) but drifts in brightness
across one image. Measured on `pipeline/raw/art-02-player-vehicle/attempt-1.png`:

| sample | RGB | Manhattan distance from `#ff00ff` |
| --- | --- | --- |
| cell row 1 top edge | 224, 10, 100 | ~194 |
| cell col 1 left edge | 198, 7, 86 | ~232 |
| cell col 2 right edge | 196, 6, 84 | ~236 |

WO-18 keys a border-connected region within `tolerance * 2` = 180 of `#ff00ff`, so none of
this is removed: every cell ships as an opaque 64×64 plate that is 63–68% hot pink. Measured
with a hue/saturation predicate instead, all 16 cell borders are 96.5–100% backdrop — the
composition is fine, the predicate is wrong.

## Files (whitelist)

- `pipeline/lib/image.ts`
- `pipeline/lib/image.test.ts`

## Steps

1. In `chromaKey(raster, keyHex, tolerance = 90)`, replace the Manhattan-distance test inside
   `isKeyFamily` with a hue/saturation predicate applied to the source pixel:
   - convert RGB to HSV;
   - backdrop when `max(r,g,b) >= 90`, `saturation >= 0.55`, and `hue` in the magenta band
     **295–350° inclusive**;
   - keep the existing border-seeded, 4-connected, iterative flood fill, and keep the
     `tolerance` parameter in the signature (unused is not allowed — either use it to widen
     the hue band, e.g. `±tolerance / 12` around 322.5°, or document in the JSDoc why it is
     retained and give it a default that changes nothing). Prefer the former.
2. Keep the pure-white fallback (`dWhite < 24`) exactly as it is.
3. Update the JSDoc block: it currently explains the distance approach and the WO-18
   connectivity workaround. It must explain the hue test, why brightness drift breaks a
   radius test, and why connectivity still matters (palette colour 15 `hot-pink` `#ff2e63`
   sits at hue ~345° and is only safe because it is enclosed by the car).
4. Extend `pipeline/lib/image.test.ts`. Keep the existing cases and add:
   - backdrops `#ff00ff`, `#ee0466`, `#df0b61`, `#c60756` each key to fully transparent;
   - an enclosed `#ff2e63` block still survives;
   - an opaque block of palette `violet` `#6a4fa3` (hue ~258°) touching the border is **not**
     keyed;
   - a desaturated grey-pink (e.g. `#8a7a80`) touching the border is **not** keyed;
   - pure white `#ffffff` still keys via the fallback.
5. Do not change `pipeline/registry/*`, `pipeline/steps/*`, `public/assets/*`, or the budget.

## Acceptance criteria

- [ ] All four backdrop hexes key to 0 opaque pixels in a synthetic full-frame test.
- [ ] Enclosed `#ff2e63` preserved pixel-for-pixel; border-touching `#6a4fa3` preserved.
- [ ] Signature and call site unchanged (`pipeline/steps/process-slot.ts:76` still compiles).
- [ ] `npm run test` and `npm run typecheck` pass. No `any`, no non-null assertions.
- [ ] Measured on the real sheet: after `chromaKey`, `pipeline/raw/art-02-player-vehicle/attempt-1.png` is **more than 55% transparent**, and **every one of the 16 cell borders is at least 95% transparent**.

## Verification

```bash
npm run test && npm run typecheck
npx tsx -e "(async () => { const sharp = (await import('sharp')).default; const { chromaKey } = await import('./pipeline/lib/image.ts'); const { data, info } = await sharp('pipeline/raw/art-02-player-vehicle/attempt-1.png').ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const keyed = chromaKey({ width: info.width, height: info.height, data }, '#ff00ff'); let clear = 0; for (let i = 3; i < keyed.data.length; i += 4) if (keyed.data[i] === 0) clear++; console.log('transparent', (clear / (info.width * info.height) * 100).toFixed(1) + '%'); })()"
```

For the per-cell border figure, slice the keyed buffer into 16 cells and count alpha 0 along
each cell's edge — report the 4×4 table of percentages.

## Out of scope

- Do not run `art:claim`, `art:pull`, `art:select`, `art:atlas` or any fal tool. Re-processing
  is the gate order's job and spends nothing.
- Do not edit the slot definitions, the house style, or the palette.
