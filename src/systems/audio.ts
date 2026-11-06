import { AUDIO } from '@/config';

/**
 * Procedural audio.
 *
 * No audio files, no licensing, no load time: every sound is synthesised. The engine is a
 * single oscillator whose frequency follows speed, which gives the player a continuous
 * speed cue that a looped sample cannot.
 *
 * The context starts suspended until a user gesture, per browser autoplay policy, so every
 * public method is a no-op until `unlock()` has run.
 */

type Sound = 'gun' | 'explosion' | 'hit' | 'pickup' | 'engineFail';

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private muted = false;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }

    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = AUDIO.masterVolume;
    this.master.connect(this.ctx.destination);
    this.startEngine();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : AUDIO.masterVolume, this.ctx.currentTime, 0.02);
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  private startEngine(): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = AUDIO.engineBaseHz;
    gain.gain.value = 0.0;

    osc.connect(gain);
    gain.connect(this.master);
    osc.start();

    this.engine = osc;
    this.engineGain = gain;
  }

  /** speed01 is 0–1; maps onto the engine pitch. */
  updateEngine(speed01: number): void {
    if (!this.ctx || !this.engine || !this.engineGain) return;
    const clamped = Math.max(0, Math.min(1, speed01));
    const target = AUDIO.engineBaseHz + (AUDIO.engineMaxHz - AUDIO.engineBaseHz) * clamped;
    this.engine.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineGain.gain.setTargetAtTime(0.06 + clamped * 0.05, this.ctx.currentTime, 0.1);
  }

  play(sound: Sound): void {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;

    switch (sound) {
      case 'gun':
        this.noiseBurst(now, 0.05, 900, 0.28);
        break;
      case 'explosion':
        this.noiseBurst(now, 0.42, 220, 0.5);
        this.tone(now, 90, 40, 0.4, 'square', 0.22);
        break;
      case 'hit':
        this.tone(now, 180, 70, 0.18, 'square', 0.3);
        break;
      case 'pickup':
        this.tone(now, 520, 880, 0.12, 'square', 0.18);
        break;
      case 'engineFail':
        this.tone(now, 140, 30, 0.9, 'sawtooth', 0.3);
        break;
      default:
        break;
    }
  }

  private tone(
    at: number,
    fromHz: number,
    toHz: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), at + duration);

    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(at);
    osc.stop(at + duration + 0.02);
  }

  private noiseBurst(at: number, duration: number, cutoffHz: number, volume: number): void {
    if (!this.ctx || !this.master) return;

    const frames = Math.floor(this.ctx.sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Deterministic pseudo-noise: a fixed LCG keeps the sound identical between runs.
    let state = 0x2f6e2b1;
    for (let i = 0; i < frames; i += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      data[i] = (state / 0xffffffff) * 2 - 1;
    }

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffHz * 4, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoffHz), at + duration);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(at);
    source.stop(at + duration + 0.02);
  }

  destroy(): void {
    this.engine?.stop();
    this.engine?.disconnect();
    this.engineGain?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
  }
}
