# WO-12 — Build the attempt review gallery

## Goal

A local page that shows every attempt of every slot side by side with its scores, so a
choice between six similar sheets takes seconds instead of a manual file hunt.

## Context

`pipeline/steps/process-slot.ts` writes `metrics.json` per attempt and per-cell PNGs. The
gallery reads those plus `pipeline/budget.json` and renders a static HTML file. It must
work with zero network access and no build step.

## Files (whitelist)

- `pipeline/ui/gallery.html`
- `pipeline/cli/gallery.ts`
- `pipeline/steps/gallery-data.ts` (new)
- `package.json`

## Steps

1. Build a data collector that walks `pipeline/work/<slot>/attempt-*/` and emits, per slot:
   attempt number, score summary, per-cell metrics, and data-URI thumbnails of each cell.
2. Render a single self-contained HTML file with:
   - a burn-down header driven by `pipeline/budget.json` (used / 80, unstarted slots),
   - one card per slot, attempts in columns, best attempt highlighted,
   - 1× / 2× / 4× zoom that uses `image-rendering: pixelated`,
   - the auto-selected attempt marked, with the reason,
   - a copyable `npm run art:select -- --slot X --attempt N` line per attempt.
3. `npm run art:gallery` writes `pipeline/ui/gallery.generated/index.html` and prints a
   `file://` URL.

## Acceptance criteria

- [ ] Works offline: no CDN, no fonts, no scripts fetched over the network.
- [ ] Renders correctly with zero processed attempts (empty state, no crash).
- [ ] With at least two processed attempts it marks exactly one as best and prints the
      matching `art:select` command.
- [ ] Sprites are shown with nearest-neighbour scaling at every zoom level.
- [ ] The burn-down numbers match `npm run art:status` exactly.

## Verification

```bash
npm run art:gallery
# open the printed file:// path
npm run art:status   # numbers must agree
npm run test && npm run typecheck
```

## Out of scope

- Changing the scorer.
- Any image generation.
