# WO-31 — Content test: every `art` id resolves in the shipped manifest

Reviewer suggestion from WO-28 round 1. The "every declared `art` id exists" rule is
currently checked only by an ad-hoc `node -e` in the work order, so renaming a sheet cell
turns an enemy back into a silent placeholder with no failing test.

## Goal

Make the WO-28 invariant part of `npm run test`.

## Files (whitelist)

- `src/content/content.test.ts`

## Steps

1. In `src/content/content.test.ts`, add a test that loads the shipped manifest
   (`public/assets/assets.json`) and asserts, for every enemy carrying `art`, that the id
   is a key of `.sprites`.
2. Assert the count too: exactly 5 enemies declare `art`, and they are
   `switchblade`, `roadlord`, `hauler`, `turret`, `gunboat`. A silent extra mapping should
   fail the test rather than pass unnoticed.
3. Read the manifest from disk with `node:fs` / `node:path` in the same way other tests in
   the file read JSON, and keep the test independent of working directory
   (`import.meta.url`-relative or `process.cwd()`-plus-path, consistent with the file).
4. Import the enemy table from the module under test (`src/content/index.ts`), not by
   re-reading `enemies.json`, so normalisation is covered.

## Acceptance criteria

- [ ] The test fails if an `art` value is changed to a non-existent frame id (state this
      was checked by hand, then reverted).
- [ ] `npm run test` passes and reports the new test.
- [ ] `npm run typecheck` passes.
- [ ] No production file changes; `public/assets/**`, `src/content/enemies.json` and
      `pipeline/**` are byte-identical.
- [ ] No `any`, no non-null assertions, no skipped tests.

## Verification

```bash
npm run typecheck && npm run test
git status --short
```

Paste the raw output of each command, one command per block.

## Out of scope

- Any fal call.
- Changing ids, content data, or the atlas.
