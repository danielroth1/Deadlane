# WO-62 — Transporter: dedicated sprite and bookends

## Goal

The level starts with the player car emerging from a dedicated transporter, and ends with
the transporter returning and the player driving into it. The transporter uses its own
generated art, not a donor enemy frame.

## Depends on

WO-51 (the `art-21-transporter` slot), WO-52 (motion/framing) and WO-54 (current road
edges).

## Steps (hints, not limits)

1. Claim `art-21-transporter` and wire the four cells: closed, ramp open, loading and
   damaged. The orchestrator runs `art:claim` immediately before the single `run_model`;
   the implementer continues at `art:pull`.
2. Add a run phase machine: `transporter-in`, `unload`, `play`, `boss`, `load`, `advance`.
   The start sequence runs after the sector card; the end sequence runs after the boss is
   down, so the existing boss gate is preserved.
3. At the start, the car is released from the transporter before control returns. At the
   end, the transporter arrives, opens its ramp, and the player must steer into the entry
   zone to advance. A missed entry must retry (the transporter comes back) instead of
   soft-locking the run.
4. Add a HUD prompt and a debug snapshot field for the current phase and entry-zone state.
5. Update e2e: the start waits for `phase === 'play'`, and a new spec fast-forwards to the
   end, enters the transporter and asserts the next sector starts. The existing boss
   spec must still pass.

## Verification

```bash
npm run typecheck
npm run test
npm run art:validate
npm run art:atlas
npm run build
npm run test:e2e
```

## Out of scope

- A story/cutscene system beyond the two transporter beats.
- Changing boss encounters, new boss art, new level types.
