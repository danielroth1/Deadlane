# WO-28 — Enemy sprite ids: map content to real manifest frame ids

Found during WO-24/WO-27 review. No enemy sheet frame resolves at runtime: the lookup
derives ids that do not exist in the manifest, so every enemy silently draws the
procedural placeholder even though four enemy sheets shipped.

## Goal

Give every enemy that has a real frame an explicit, checked sprite id, and leave the rest
on the placeholder path.

## Files (whitelist)

- `src/content/index.ts`
- `src/content/enemies.json`
- `src/entities/enemy.ts`

## Measured problem

`src/entities/enemy.ts` builds candidates as `${slot}/${def.id}`:

```ts
const ART_SLOTS = ['enemy-ground-a', 'enemy-ground-b', 'enemy-air', 'enemy-sea'];
ART_SLOTS.map((slot) => `${slot}/${def.id}`)
```

`Art.has()` is `Boolean(manifest.sprites[id])`, and `public/assets/assets.json` `.sprites`
is keyed by `<sheet-code>/<cell-slug>` taken from the slot's human-written cell labels.
Enemy ids in `src/content/enemies.json` are `enforcer switchblade roadlord hauler turret
gunboat speedboat jetski dredger`; the shipped frame labels are `switchblade-interceptor`,
`road-lord-heavy`, `division-sports-coupe`, `hauler-armoured-truck`, `turret-rig`,
`ram-bulldozer`, `missile-trailer`, `attack-helicopter`, `gunship-large`, `hunter-drone`,
`jet-fighter`, `gunboat`, `hovercraft`, `torpedo-boat`. Only `gunboat` ever coincides.

## Steps

1. Add `readonly art?: string` to `EnemyDef` in `src/content/index.ts`, documented as a
   **full manifest sprite id** of the form `<sheet-code>/<cell-slug>`, not an enemy id.
2. Fill `art` in `src/content/enemies.json` only where a frame is the same vehicle:

   | enemy | `art` |
   | --- | --- |
   | `switchblade` | `enemy-ground-a/switchblade-interceptor` |
   | `roadlord` | `enemy-ground-a/road-lord-heavy` |
   | `hauler` | `enemy-ground-b/hauler-armoured-truck` |
   | `turret` | `enemy-ground-b/turret-rig` |
   | `gunboat` | `enemy-sea/gunboat` |

3. Leave `art` off `enforcer`, `speedboat`, `jetski` and `dredger`. Their cells were
   dropped or never shipped (`art-03` cell 0 motorcycle, `art-06` cell 1 speedboat) and no
   remaining frame is the same vehicle. **Do not invent a mapping** — the placeholder is
   the correct behaviour and `AGENTS.md` promises it.
4. In `src/entities/enemy.ts`, resolve `def.art` first and keep the existing derived
   candidates after it, so an unmapped enemy still tries `<slot>/<id>` before falling
   back to the placeholder.

## Acceptance criteria

- [ ] Every `art` value present in `src/content/enemies.json` exists as a key of
      `public/assets/assets.json` → `.sprites` (5 enemies mapped).
- [ ] Enemies without `art` still construct without throwing and draw the placeholder.
- [ ] `npm run typecheck`, `npm run test` and `npm run art:validate` pass.
- [ ] `public/assets/assets.json`, `pipeline/budget.json` and all cell/sheet PNGs are
      byte-identical — this order changes only content and lookup.
- [ ] No `any`, no non-null assertions.

## Verification

```bash
npm run typecheck && npm run test && npm run art:validate
node -e "const m=require('./public/assets/assets.json').sprites;const e=require('./src/content/enemies.json').enemies;const f=e.filter(x=>x.art);for(const x of f){if(!m[x.art])throw new Error(x.id+' -> '+x.art)}console.log('mapped',f.length,'of',e.length)"
```

Paste the raw output of each command. One command per block.

## Out of scope

- Any fal call. No claim, no pull, no generation.
- New art, new cells, re-packing a sheet (WO-27 is closed by human override).
- The `usableCells` metric (see `pipeline/steps/*`).
- Rendering scale or rotation of enemy sprites.
