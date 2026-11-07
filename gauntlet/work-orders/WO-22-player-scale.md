# WO-22 — Draw the generated player sprite at 64 px and unswap its frames

## Goal

Stop the 128 px player sheet from doubling the car on screen, and make
`player-vehicle/damaged` / `player-vehicle/wrecked` name the cells they actually show.

## Context

`art-02-player-vehicle` is now a 2×2 sheet at `finalSize: 128` (WO-21). `Art.imageAny()` sizes
the sprite to the texture's native frame, so the car is drawn 128 px wide on a 640×360 canvas
and its collision half-extents in `src/entities/player.ts` (36% / 42% of display size) double
with it — it spans more than one lane.

Separately, the sheet's cells were drawn slightly differently from the declared order: cell 1
is declared `interceptor damaged` but is drawn as the burning wreck, and cell 2 is declared
`interceptor wrecked` but is a second clean car. Frame ids come from the labels
(`frameId()` in `pipeline/steps/build-atlas.ts`), so the shipped manifest maps those names to
the wrong pictures.

## Files (whitelist)

- `src/config.ts`
- `src/entities/player.ts`
- `pipeline/registry/slots.ts`
- `public/assets/**` (via `npm run art:atlas` only)

## Steps

1. `src/config.ts`: add `spriteSize: 64` to `PLAYER`, with a comment saying it is the on-screen
   footprint and is deliberately independent of the sheet's `finalSize`.
2. `src/entities/player.ts`: after creating the sprite, scale it so its **displayed** size is
   `PLAYER.spriteSize` whatever the sheet cell size is — `const scale = PLAYER.spriteSize /
   Math.max(this.sprite.width, this.sprite.height)`, guarded against zero and applied with
   `setScale`. Do not hardcode `0.5`: with a placeholder texture it must stay 1.
3. `pipeline/registry/slots.ts`, `art-02-player-vehicle`: swap the labels of cells 1 and 2 so
   the burning car is `interceptor wrecked` and the undamaged-but-different car is
   `interceptor damaged`. Change nothing else — same grid, size, subject and emphasis.
4. Run `npm run art:atlas` so the manifest frame ids follow the new labels.
5. Leave every other entity, slot and asset alone.

## Acceptance criteria

- [ ] The player's displayed width is 64 px in game whether art resolves to the sheet
      (128 px frame) or to the procedural placeholder (64 px texture).
- [ ] Collision half-extents are unchanged from the 64 px placeholder's values.
- [ ] `public/assets/assets.json` exposes `player-vehicle/interceptor-clean`,
      `player-vehicle/interceptor-damaged`, `player-vehicle/interceptor-wrecked`,
      `player-vehicle/hover-interceptor`, and no duplicate frame ids.
- [ ] `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:e2e` and
      `npm run art:validate` all pass.
- [ ] No `any`, no non-null assertions.

## Verification

```bash
npm run typecheck && npm run test && npm run art:atlas && npm run art:validate && npm run build && npm run test:e2e
node -e "const a=require('./public/assets/assets.json');const s=a.sprites;console.log(Object.keys(s).filter(k=>k.startsWith('player-vehicle/')).join('\n'));console.log('frames', new Set(Object.values(s).map(v=>v.sheet)).size)"
```

## Out of scope

- Do not call any fal tool and do not claim, pull, process or select any slot.
- Do not change the grid contract, the palette, or any other sprite.
- Do not compensate for the tail-light colour; that is an art-side concern.
