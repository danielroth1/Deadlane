# WO-39 — Stoppable engine and a mute control

## Goal

`AudioSystem.destroy()` has no caller, so the engine oscillator keeps its last gain through
game over and the title screen. `TitleScene` constructs a new `AudioSystem` on every return
and overwrites the registry entry, so repeated runs stack voices. `setMuted()`/`isMuted`
have no caller: there is no mute control and no persisted setting.

## Steps (hints, not limits)

1. Stop and dispose the audio system on scene shutdown and before a new one is created;
   make the registry entry the single owner.
2. Add a mute toggle bound to a documented key, and persist it (localStorage is enough).
3. Make the audio system testable with an injectable context factory; add a unit test with
   a fake `AudioContext` that counts started and stopped oscillators.
4. Update the README input table if you add a key.

## Verification

```bash
npm run typecheck
npm run test
```

## Out of scope

- New sounds, music, or a volume slider.
