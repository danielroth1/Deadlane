---
description: 'DEADLANE test rules: content schema, 1,000-seed level matrix, known e2e flake'
applyTo: '**/*.test.ts, e2e/**'
---

# Test rules

- **`src/content/content.test.ts` is the content schema.** It is hand-written on purpose (a
  runtime validator would cost bundle bytes to catch what CI catches free). Adding a content
  row means adding data, not a test; a new behaviour or attack pattern needs code and a test.
- **`src/levels/levels.test.ts` runs 1,000 seeds per registered level type.** A generator is
  not done until that passes. Never lower the seed count to make a failure go away.
- **Seeded fixtures only.** Tests that touch gameplay randomness seed `src/rng.ts`; a test that
  calls `Math.random()` is non-reproducible and will be rejected.
- **e2e drives the `?debug=1` snapshot** against the production build under the `/deadlane/`
  base path. Assert on the snapshot, not on canvas pixels.
- **Known flake:** `e2e/smoke.spec.ts › Esc pauses the run, and Esc resumes it` fails
  intermittently on clean HEAD (a 300 ms boost assertion). Re-run rather than chasing it; if it
  fails twice in a row, treat it as real.
