import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUDIO } from '@/config';
import { AudioSystem } from './audio';
import {
  AUDIO_KEY,
  MUTE_KEY,
  acquireAudio,
  disposeAudio,
  readStoredMute,
  storeMute,
  toggleAudioMute,
  type RegistryLike,
} from './audio-registry';

/**
 * The audio system, against a fake context.
 *
 * The real bug this pins down is lifecycle: the engine oscillator must be started exactly
 * once per context and stopped on `destroy()`, and the registry must never hold two live
 * systems. A fake context counts both without needing Web Audio in Node.
 */

class FakeParam {
  value = 0;
  readonly targets: number[] = [];
  setValueAtTime(): void {}
  exponentialRampToValueAtTime(): void {}
  linearRampToValueAtTime(): void {}
  setTargetAtTime(target: number): void {
    this.targets.push(target);
    this.value = target;
  }
}

class FakeNode {
  connect(): void {}
  disconnect(): void {}
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeOscillator extends FakeNode {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeParam();
  started = 0;
  stopped = 0;
  constructor(private readonly ctx: FakeContext) {
    super();
  }
  start(): void {
    this.started += 1;
    this.ctx.startedOscillators.push(this);
  }
  stop(): void {
    this.stopped += 1;
    this.ctx.stoppedOscillators.push(this);
  }
}

class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  start(): void {}
  stop(): void {}
}

class FakeBiquadFilter extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeParam();
}

class FakeContext {
  state: AudioContextState = 'running';
  currentTime = 1;
  sampleRate = 48_000;
  readonly destination = new FakeNode();
  readonly gains: FakeGain[] = [];
  readonly startedOscillators: FakeOscillator[] = [];
  readonly stoppedOscillators: FakeOscillator[] = [];
  resumed = 0;
  closed = 0;

  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }

  createOscillator(): FakeOscillator {
    return new FakeOscillator(this);
  }

  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource();
  }

  createBiquadFilter(): FakeBiquadFilter {
    return new FakeBiquadFilter();
  }

  createBuffer(_channels: number, frames: number): { getChannelData(): Float32Array } {
    return { getChannelData: () => new Float32Array(frames) };
  }

  resume(): Promise<void> {
    this.resumed += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
}

function fakeContext(): FakeContext {
  return new FakeContext();
}

function systemOn(ctx: FakeContext): AudioSystem {
  return new AudioSystem(() => ctx as unknown as AudioContext);
}

/** The master gain is the first one created. */
function masterGain(ctx: FakeContext): FakeGain {
  const gain = ctx.gains[0];
  if (!gain) throw new Error('no master gain was created');
  return gain;
}

describe('AudioSystem lifecycle', () => {
  it('starts the engine once and stops it on destroy', () => {
    const ctx = fakeContext();
    const audio = systemOn(ctx);

    audio.unlock();
    expect(ctx.startedOscillators).toHaveLength(1);

    audio.destroy();
    expect(ctx.stoppedOscillators).toHaveLength(1);
    expect(ctx.closed).toBe(1);
    expect(ctx.state).toBe('closed');
  });

  it('reuses the context when unlocked twice instead of stacking a second engine', () => {
    const ctx = fakeContext();
    const audio = systemOn(ctx);

    audio.unlock();
    audio.unlock();

    expect(ctx.startedOscillators).toHaveLength(1);
    expect(ctx.gains).toHaveLength(2); // master + engine gain, built once
  });

  it('destroys safely when it was never unlocked, and twice in a row', () => {
    const ctx = fakeContext();
    const audio = systemOn(ctx);

    expect(() => audio.destroy()).not.toThrow();

    audio.unlock();
    audio.destroy();
    expect(() => audio.destroy()).not.toThrow();
    expect(ctx.closed).toBe(1);
  });

  it('does nothing when Web Audio is unavailable', () => {
    const audio = new AudioSystem(() => null);

    expect(() => audio.unlock()).not.toThrow();
    expect(() => audio.play('gun')).not.toThrow();
    expect(() => audio.updateEngine(1)).not.toThrow();
    expect(() => audio.destroy()).not.toThrow();
  });
});

describe('AudioSystem mute', () => {
  it('builds the master gain silent when muted before unlock', () => {
    const ctx = fakeContext();
    const audio = systemOn(ctx);

    audio.setMuted(true);
    audio.unlock();

    expect(audio.isMuted).toBe(true);
    expect(masterGain(ctx).gain.value).toBe(0);
  });

  it('restores the configured volume when unmuted', () => {
    const ctx = fakeContext();
    const audio = systemOn(ctx);

    audio.setMuted(true);
    audio.unlock();
    audio.setMuted(false);

    expect(masterGain(ctx).gain.targets.at(-1)).toBe(AUDIO.masterVolume);
  });

  it('skips one-shot sounds while muted', () => {
    const ctx = fakeContext();
    const audio = systemOn(ctx);

    audio.unlock();
    audio.setMuted(true);
    audio.play('gun');
    expect(ctx.startedOscillators).toHaveLength(1); // the engine only

    audio.setMuted(false);
    audio.play('hit');
    expect(ctx.startedOscillators).toHaveLength(2);
  });
});

function fakeRegistry(): RegistryLike & { readonly entries: Map<string, unknown> } {
  const entries = new Map<string, unknown>();
  return {
    entries,
    get: (key: string): unknown => entries.get(key),
    set: (key: string, value: unknown): unknown => entries.set(key, value),
    remove: (key: string): unknown => entries.delete(key),
  };
}

function fakeStorage(): Map<string, string> {
  const store = new Map<string, string>();
  // The module only reads storage in a browser, so both globals are stubbed together.
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      store.set(key, value);
    },
  });
  return store;
}

describe('audio registry ownership', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hands out one shared system and keeps the registry entry authoritative', () => {
    const registry = fakeRegistry();

    const first = acquireAudio(registry);
    const second = acquireAudio(registry);

    expect(second).toBe(first);
    expect(registry.entries.get(AUDIO_KEY)).toBe(first);
  });

  it('persists the mute toggle and restores it on the next acquire', () => {
    const store = fakeStorage();
    const registry = fakeRegistry();

    const audio = acquireAudio(registry);
    expect(audio.isMuted).toBe(false);

    expect(toggleAudioMute(registry)).toBe(true);
    expect(audio.isMuted).toBe(true);
    expect(store.get(MUTE_KEY)).toBe('1');

    disposeAudio(registry);
    const next = acquireAudio(registry);

    expect(next).not.toBe(audio);
    expect(next.isMuted).toBe(true);

    expect(toggleAudioMute(registry)).toBe(false);
    expect(store.get(MUTE_KEY)).toBe('0');
  });

  it('drops the entry on dispose so shutdown cannot leak a voice', () => {
    const registry = fakeRegistry();

    acquireAudio(registry);
    disposeAudio(registry);

    expect(registry.entries.has(AUDIO_KEY)).toBe(false);
    expect(() => disposeAudio(registry)).not.toThrow();
  });

  it('treats unreadable storage as unmuted instead of throwing', () => {
    const registry = fakeRegistry();
    vi.stubGlobal('window', {});
    vi.stubGlobal('localStorage', undefined);

    expect(readStoredMute()).toBe(false);
    expect(() => storeMute(true)).not.toThrow();
    expect(acquireAudio(registry).isMuted).toBe(false);
  });
});
