import { describe, expect, it } from 'vitest';
import { createRng, formatSeed, hashSeed, seedFromLocation } from './rng';

describe('rng', () => {
  it('replays the same stream for the same seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const left = Array.from({ length: 32 }, () => a.next());
    const right = Array.from({ length: 32 }, () => b.next());
    expect(left).toEqual(right);
  });

  it('diverges for different seeds', () => {
    const a = Array.from({ length: 8 }, (_, i) => createRng(i + 1).next());
    expect(new Set(a).size).toBe(8);
  });

  it('stays inside its declared ranges', () => {
    const rng = createRng(99);
    for (let i = 0; i < 500; i += 1) {
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);

      const f = rng.range(-2, 2);
      expect(f).toBeGreaterThanOrEqual(-2);
      expect(f).toBeLessThan(2);
    }
  });

  it('forks independently', () => {
    const parent = createRng(7);
    const a = parent.fork('traffic');
    const b = parent.fork('enemy');
    const a1 = a.next();
    const b1 = b.next();
    expect(a1).not.toBe(b1);
  });

  it('respects weights', () => {
    const rng = createRng(5150);
    const counts: Record<'common' | 'rare', number> = { common: 0, rare: 0 };
    for (let i = 0; i < 4000; i += 1) {
      const pick = rng.weighted(['common', 'rare'] as const, [9, 1]);
      counts[pick] += 1;
    }
    // 9:1 should land well inside this band over 4000 draws.
    expect(counts.common).toBeGreaterThan(counts.rare * 5);
  });

  it('hashes and formats seeds stably', () => {
    expect(hashSeed('deadlane')).toBe(hashSeed('deadlane'));
    expect(hashSeed('deadlane')).not.toBe(hashSeed('deadlanf'));
    expect(formatSeed(1)).toHaveLength(6);
  });

  it('reads a seed from the query string', () => {
    expect(seedFromLocation('?seed=123', () => 0)).toBe(123);
    expect(seedFromLocation('?seed=abc', () => 0)).toBe(hashSeed('abc'));
    expect(seedFromLocation('', () => 42)).toBe(42);
  });
});
