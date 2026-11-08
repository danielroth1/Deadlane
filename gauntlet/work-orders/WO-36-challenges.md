# WO-36 — All five challenge kinds, paid from `challenges.json`

## Goal

`challenges.json` defines five kinds — `reach`, `destroy`, `clean`, `collect`, `survive` —
but `buildChallenges()` only ever emits `reach`, `destroy` and `clean`. The `collect` and
`survive` rows and every `reward` value are dead data; completion pays a hardcoded 250/300
in `GameScene`.

## Steps (hints, not limits)

1. Emit all five kinds from `src/levels/generators/shared.ts`, using `CHALLENGE_TEMPLATES`
   for labels, targets and rewards rather than duplicating them.
2. Carry `reward` through the challenge system into the completion callback and pay what
   the JSON says.
3. Show progress for `collect` and `survive` in the HUD the way `destroy` already does.
4. Add a levels test asserting every template kind appears across a run of generated
   sectors, so a kind cannot silently disappear again.
5. Keep the 1,000-seed validation matrix green.

## Verification

```bash
npm run typecheck
npm run test
```

## Out of scope

- New challenge kinds or a reward shop.
