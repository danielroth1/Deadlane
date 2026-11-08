# WO-32 — Pause that can be resumed

## Goal

Esc currently stops the world permanently. `GameScene.togglePause()` calls
`this.scene.pause()`, the only Esc listeners live in that scene, and Phaser's keyboard
plugin refuses input for a scene that is not RUNNING. The pause banner is drawn and tweened
inside the paused scene, so it never appears either. Pressing Esc means reloading the page.

Make pause a two-way state, and give Playwright a way to observe it.

## Evidence

- `src/scenes/GameScene.ts:143` registers a `keydown-ESC` listener that calls
  `togglePause()`; `:233` also checks `JustDown(ESC)`, so one keypress has two paths.
- `node_modules/phaser/src/input/keyboard/KeyboardPlugin.js` gates input on
  `Systems.canInput()` — a paused scene receives no keys.
- The pause card is created in the same scene that gets paused.

## Steps (hints, not limits)

1. Give Esc exactly one owner. Either the HUD scene (which keeps running) drives pause and
   resume on `GameScene`, or the key is handled before the pause takes effect.
2. Draw the pause card somewhere still updating, and say how to resume on it.
3. Keep the game state observable: a read-only `window.__deadlane` snapshot gated behind
   `?debug=1` — `paused`, HUD state, live enemy/civilian counts, muted. No gameplay writes
   from the snapshot, no network.
4. Extend `e2e/smoke.spec.ts`: pause, assert the card and a frozen world, resume, assert
   input works again.

## Verification

```bash
npm run typecheck
npm run test
npm run test:e2e
```

## Out of scope

- Pausing during level intro or game over.
- A settings menu. Mute is WO-39.
