/**
 * Seeded randomness.
 *
 * Every generator draws from an `Rng` built from the level seed. `Math.random()` is banned
 * in gameplay code because a level must be reproducible from its seed alone — that is what
 * makes bug reports testable and what will later let a `?seed=` URL replay a run exactly.
 *
 * Algorithm: sfc32, small, fast, and good enough for layout decisions.
 */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Weighted pick; weights must be positive. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  /** Fork a child generator, so subsystems do not consume each other's stream. */
  fork(salt: string): Rng;
}

export function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function createRng(seed: number): Rng {
  let a = (seed ^ 0x9e3779b9) >>> 0;
  let b = (seed ^ 0x85ebca6b) >>> 0;
  let c = (seed ^ 0xc2b2ae35) >>> 0;
  let d = (seed ^ 0x27d4eb2f) >>> 0;

  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };

  // Warm up: the first values of sfc32 correlate with the raw seed.
  for (let i = 0; i < 12; i += 1) next();

  const rng: Rng = {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    range: (min, max) => next() * (max - min) + min,
    chance: (p) => next() < p,
    pick: <T,>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('rng.pick called with an empty array');
      return items[Math.floor(next() * items.length)]!;
    },
    weighted: <T,>(items: readonly T[], weights: readonly number[]): T => {
      if (items.length === 0) throw new Error('rng.weighted called with an empty array');
      const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
      if (total <= 0) return rng.pick(items);
      let roll = next() * total;
      for (let i = 0; i < items.length; i += 1) {
        roll -= Math.max(0, weights[i] ?? 0);
        if (roll <= 0) return items[i]!;
      }
      return items[items.length - 1]!;
    },
    fork: (salt) => createRng((seed ^ hashSeed(salt)) >>> 0),
  };

  return rng;
}

/** A stable, human-shareable seed string, e.g. `deadlane-a1b2c3`. */
export function formatSeed(seed: number): string {
  return seed.toString(36).toUpperCase().padStart(6, '0');
}

/** Read a seed from `?seed=` when present, otherwise derive one from the clock. */
export function seedFromLocation(search: string, fallback: () => number): number {
  const params = new URLSearchParams(search);
  const raw = params.get('seed');
  if (!raw) return fallback();
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
  return hashSeed(raw);
}
