import { GAME } from '@/config';
import { AudioSystem } from './audio';

/**
 * Ownership of the one live `AudioSystem`.
 *
 * The game registry holds the instance, so every scene shares a single context: creating a
 * second one stacks voices, and the engine oscillator of the old one never stops. Scenes
 * acquire through this module and release on shutdown; nothing constructs an `AudioSystem`
 * on its own.
 *
 * The mute preference lives in localStorage so it survives a reload. Reading it is done
 * here rather than in `AudioSystem` to keep that class free of browser storage.
 */

/** Registry key holding the live audio system. */
export const AUDIO_KEY = 'audio';

/** localStorage key for the persisted mute preference. */
export const MUTE_KEY = `${GAME.storagePrefix}muted`;

/** The slice of Phaser's data manager this module needs; keeps it testable off-Phaser. */
export interface RegistryLike {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
  remove(key: string): unknown;
}

function storage(): Storage | null {
  // Guard on `window` first: Node exposes a stubbed `localStorage` getter that warns when
  // touched, and this module is loaded by the unit tests.
  if (typeof window === 'undefined') return null;
  try {
    return localStorage;
  } catch {
    // Private-mode browsers can throw on access; audio still works, it just is not saved.
    return null;
  }
}

export function readStoredMute(): boolean {
  return storage()?.getItem(MUTE_KEY) === '1';
}

export function storeMute(muted: boolean): void {
  storage()?.setItem(MUTE_KEY, muted ? '1' : '0');
}

/** The registered system, or a new one seeded with the saved preference. */
export function acquireAudio(registry: RegistryLike): AudioSystem {
  const existing = registry.get(AUDIO_KEY);
  if (existing instanceof AudioSystem) return existing;

  const audio = new AudioSystem();
  audio.setMuted(readStoredMute());
  registry.set(AUDIO_KEY, audio);
  return audio;
}

/** Stop and drop the registered system. Safe when there is none. */
export function disposeAudio(registry: RegistryLike): void {
  const existing = registry.get(AUDIO_KEY);
  if (existing instanceof AudioSystem) existing.destroy();
  registry.remove(AUDIO_KEY);
}

/** Flip mute, apply it, and persist it. Returns the new state. */
export function toggleAudioMute(registry: RegistryLike): boolean {
  const audio = acquireAudio(registry);
  const muted = !audio.isMuted;
  audio.setMuted(muted);
  storeMute(muted);
  return muted;
}
