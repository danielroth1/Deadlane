# WO-14 — End-to-end test and GitHub Pages deploy

## Goal

Prove the built game runs from the production bundle under `/deadlane/`, and deploy it
automatically on every push to `main`.

## Context

The most common failure for a Vite game on GitHub Pages is a wrong `base`: assets 404 and
the page renders an empty canvas with no console error that points at the cause. The e2e
test asserts the base path explicitly so this cannot ship silently.

## Files (whitelist)

- `e2e/smoke.spec.ts` (new)
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `README.md`

## Steps

1. Write `e2e/smoke.spec.ts` asserting:
   - the page loads at `/deadlane/` and the canvas element exists,
   - no `pageerror` or console `error` events during 3 seconds of play,
   - the title text renders,
   - pressing Space transitions into a running game (canvas still present, no errors),
   - the frame rate holds: sample `requestAnimationFrame` deltas over 2 seconds and assert
     the median is under 20 ms.
2. Add `ci.yml`: install, `typecheck`, `test`, `art:validate`, `build`, `test:e2e` on PRs.
3. Add `deploy.yml`: on push to `main`, build and publish `dist` with
   `actions/upload-pages-artifact` + `actions/deploy-pages`, with the correct `permissions`
   and `concurrency` blocks.
4. Document in `README.md`: local dev, the art pipeline in three commands, the budget, and
   how to replay a seed with `?seed=`.

## Acceptance criteria

- [ ] `npm run test:e2e` passes locally against the production build.
- [ ] The e2e spec fails loudly if `base` is changed to `/` (verify by temporarily changing it).
- [ ] CI never calls the fal API and never needs a credential.
- [ ] `deploy.yml` publishes to GitHub Pages and the deployed game boots.
- [ ] `README.md` explains the 80-image budget in one paragraph.

## Verification

```bash
npm run build
npm run test:e2e
npm run test && npm run typecheck && npm run lint
```

## Out of scope

- Changing gameplay.
- Adding analytics.
