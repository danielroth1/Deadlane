# WO-50 — Full touch controls

## Goal

The game advertises drag steering, but touch play is not viable: `pointerdown` only plays
the gun sound, and there is no way to accelerate, brake, drop oil, drop smoke or pause
without a keyboard.

Make the game fully playable with two thumbs on a phone-sized screen. No new art — UI slots
19/20 are deliberately out of scope, so the controls are drawn from the locked palette with
`Graphics` and the bitmap font.

## Depends on

WO-32 (the single pause owner) and WO-34 (fire/oil/smoke input paths).

## Steps (hints, not limits)

1. Show the touch pad when the device is touch-first (`pointer: coarse`) or after the first
   touch, and keep it out of the way of the play field. It must not shift the 640×360
   letterboxed canvas.
2. Cover the full control set: steer (drag, already there), accelerate, brake, fire, oil,
   smoke, pause. Buttons must be reachable one-thumbed and must not overlap the HUD.
3. Multi-touch must work: steering with one finger while holding fire with the other.
   Track pointers by `pointer.id`; do not let a second pointer hijack the steer drag.
4. Buttons set the same input state the keyboard sets — one gameplay path, not two.
5. Prevent browser scroll/zoom/double-tap gestures on the canvas and the pad.
6. Keep desktop mouse behaviour sane: clicking the play field fires (restores the WO-34
   tap-to-fire), and the pad stays hidden.
7. Test the pure input-state mapping in unit tests, and drive a pointer sequence in
   `e2e/smoke.spec.ts` against the `?debug=1` snapshot to prove fire/steer/pause change.

## Verification

```bash
npm run typecheck
npm run test
npm run test:e2e
```

## Out of scope

- Art-19/20 icons and chrome — draw shapes, not sprites.
- Gamepad support, haptics, or a settings screen.
