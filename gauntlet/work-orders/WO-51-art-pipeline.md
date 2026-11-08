# WO-51 — Art process overhaul: unlimited images, new slots, soft art bible

## Goal

The human has removed the image-cost constraint and asked for new art categories: a
dedicated transporter, roadside/water/urban scenery, and an expanded effects sheet. Make
the pipeline express that. Remove the 150-image lifetime ceiling and the 6-attempt
per-slot cap, add the new slots, and turn the art bible into a style guide instead of a
rejection gate.

This is an explicit human override of the old "never raise the ceiling" rule. Keep
`art:claim` and `pipeline/budget.json` as the audit trail; cost is no longer the limiting
factor, but every image still needs a claim.

## Depends on

None.

## Steps (hints, not limits)

1. `pipeline/lib/ledger.ts`: remove R1 (lifetime ceiling), R2 (per-slot cap) and R3
   (no-starving). Keep R4 (a retry needs a new seed) and the claim-before-generate rule.
   Make `limit` / `perSlotLimit` optional or unlimited; migrate `pipeline/budget.json`
   through the existing CLI, never by hand.
2. Update `pipeline/cli/status.ts`, `claim.ts` and `select.ts` so they no longer report or
   enforce a ceiling. `art:status` must show usage without a cap.
3. Add slots in `pipeline/registry/slots.ts`:
   - `art-21-transporter` — 2x2 @128: closed, ramp open, loading, damaged.
   - `art-22-scenery-roadside` — 4x4 @64: trees, bushes, rocks, fences, signs, wrecks, pylons.
   - `art-23-scenery-water` — 4x4 @64: reeds, docks, buoys, moored boats, rocks, bridge piers.
   - `art-24-scenery-urban` — 4x4 @64: roofs, signs, AC units, dumpsters, lights, planters.
   - `art-25-fx-expanded` — 4x4 @64: flame stream frames, explosion variants, smoke, debris,
     shockwave, water splash, sparks.
   Every cell named row-major; no dropped cells yet.
4. Update every rule/document copy: `AGENTS.md`, `.github/copilot-instructions.md`,
   `.github/instructions/pipeline.instructions.md`, `pipeline/BUDGET.md`, `README.md`.
   The hard rules become: claim first, no keys, no hand-editing generated artifacts, and
   atlas-technical compatibility.
5. Rewrite `docs/ART_BIBLE.md` in guideline voice. Keep only atlas-technical requirements
   hard: fixed cell grid, background keying, frame bounds, no text in UI icons, no magenta
   bleed. Palette, outline, 1:1 pixel density, 90-degree rotation, binary alpha and shadow
   direction become preferences/warnings.
6. Split `art:validate` into technical failures and style warnings. Palette quantisation and
   outlining may stay as an optional default style pass, but they must not reject a sheet on
   style alone. Update the pipeline tests that currently pin rejection.
7. Do not generate images in this order.

## Verification

```bash
npm run typecheck
npm run test
npm run art:validate
npm run art:status
```

Also prove the ledger change with a claim/release smoke test past the old 150 and 6 limits,
and run `npm run art:atlas` to confirm existing sheets still pack.

## Out of scope

- Generating any of the new sheets; later orders claim them.
- Deleting the ledger or making generated artifacts hand-editable.
- Changing gameplay, content data or the game build.
