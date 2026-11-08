import { describe, expect, it } from 'vitest';
import {
  attemptsFor,
  claimAttempt,
  clearLimits,
  createLedger,
  isSlotExhausted,
  markSlotStatus,
  recordGeneration,
  releaseAttempt,
  remainingImages,
  reopenSlot,
  selectAttempt,
  summarize,
  unstartedSlots,
  usedImages,
  type Ledger,
} from '../lib/ledger';

/**
 * The ledger rules are the most expensive thing in this repository to get wrong: each
 * mistake costs real money and cannot be undone. They are asserted here rather than
 * trusted to agent discipline.
 *
 * The lifetime ceiling and the per-slot cap are gone by explicit human decision. What
 * remains is the audit trail: every image is claimed first, a retry needs a new seed, and
 * releasing returns an image that was never produced. Both caps are still asserted as
 * *optional* — a ledger that carries one must enforce it.
 */

const SLOTS = ['art-01', 'art-02', 'art-03', 'art-04'];

function fresh(limits: { limit?: number; perSlotLimit?: number } = {}): Ledger {
  return createLedger(SLOTS, limits);
}

function claim(ledger: Ledger, slot: string, seed: number) {
  return claimAttempt(ledger, slot, { seed, promptHash: `hash-${slot}-${seed}` });
}

describe('image budget ledger', () => {
  it('starts empty and unlimited', () => {
    const ledger = fresh();
    expect(usedImages(ledger)).toBe(0);
    expect(ledger.limit).toBeUndefined();
    expect(ledger.perSlotLimit).toBeUndefined();
    expect(remainingImages(ledger)).toBe(Number.POSITIVE_INFINITY);
    expect(unstartedSlots(ledger)).toBe(4);
  });

  it('consumes one image per claim', () => {
    const result = claim(fresh(), 'art-01', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(usedImages(result.ledger)).toBe(1);
    expect(result.attempt.attempt).toBe(1);
  });

  it('allows more than the old six attempts on one slot', () => {
    let ledger = fresh();
    for (let seed = 1; seed <= 9; seed += 1) {
      const result = claim(ledger, 'art-01', seed);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      ledger = result.ledger;
    }

    expect(attemptsFor(ledger, 'art-01')).toBe(9);
    expect(isSlotExhausted(ledger, 'art-01')).toBe(false);
  });

  it('has no lifetime image ceiling by default', () => {
    let ledger = fresh();
    for (let seed = 1; seed <= 4; seed += 1) {
      const result = claim(ledger, 'art-01', seed);
      if (!result.ok) throw new Error(`seed ${seed} should be claimable`);
      ledger = result.ledger;
    }

    expect(usedImages(ledger)).toBe(4);
    expect(remainingImages(ledger)).toBe(Number.POSITIVE_INFINITY);
    expect(summarize(ledger).limit).toBeUndefined();
    expect(summarize(ledger).remaining).toBeUndefined();
  });

  it('still enforces an explicitly configured lifetime limit', () => {
    let ledger = createLedger(['only'], { limit: 3 });
    for (const seed of [1, 2, 3]) {
      const result = claim(ledger, 'only', seed);
      if (!result.ok) throw new Error(`seed ${seed} should be claimable`);
      ledger = result.ledger;
    }
    expect(usedImages(ledger)).toBe(3);
    expect(remainingImages(ledger)).toBe(0);

    const overflow = claim(ledger, 'only', 4);
    expect(overflow.ok).toBe(false);
    if (overflow.ok) return;
    expect(overflow.reason).toContain('limit');
  });

  it('still enforces an explicitly configured per-slot cap', () => {
    let ledger = createLedger(['only'], { perSlotLimit: 2 });
    for (const seed of [1, 2]) {
      const result = claim(ledger, 'only', seed);
      if (!result.ok) throw new Error(`seed ${seed} should be claimable`);
      ledger = result.ledger;
    }

    const third = claim(ledger, 'only', 3);
    expect(third.ok).toBe(false);
    if (third.ok) return;
    expect(third.reason).toContain('attempts');
    expect(isSlotExhausted(ledger, 'only')).toBe(true);
  });

  it('clears both caps during migration without touching recorded spend', () => {
    const capped = createLedger(SLOTS, { limit: 150, perSlotLimit: 6 });
    const first = claim(capped, 'art-01', 1);
    if (!first.ok) throw new Error('expected claim');

    const unlimited = clearLimits(first.ledger);
    expect(unlimited.limit).toBeUndefined();
    expect(unlimited.perSlotLimit).toBeUndefined();
    expect(usedImages(unlimited)).toBe(1);
    expect(unlimited.slots['art-01']?.attempts).toHaveLength(1);
  });

  it('rejects a duplicate seed in the same slot', () => {
    const first = claim(fresh(), 'art-01', 42);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const duplicate = claim(first.ledger, 'art-01', 42);
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.reason).toContain('already used');
  });

  it('returns budget when an attempt is released', () => {
    const first = claim(fresh(), 'art-01', 1);
    if (!first.ok) throw new Error('expected claim');
    expect(usedImages(first.ledger)).toBe(1);

    const released = releaseAttempt(first.ledger, 'art-01', 1, 'model returned nothing');
    expect(usedImages(released)).toBe(0);
    expect(remainingImages(released)).toBe(Number.POSITIVE_INFINITY);
    // A released slot counts as unstarted again.
    expect(unstartedSlots(released)).toBe(4);
  });

  it('records generation details without changing the budget', () => {
    const first = claim(fresh(), 'art-01', 7);
    if (!first.ok) throw new Error('expected claim');

    const recorded = recordGeneration(first.ledger, 'art-01', 1, {
      requestId: 'req_123',
      url: 'https://example.test/a.png',
      costUsd: 0.02,
    });

    expect(usedImages(recorded)).toBe(1);
    const attempt = recorded.slots['art-01']!.attempts[0]!;
    expect(attempt.state).toBe('generated');
    expect(attempt.requestId).toBe('req_123');
    expect(summarize(recorded).spendUsd).toBeCloseTo(0.02);
  });

  it('only selects generated attempts', () => {
    const first = claim(fresh(), 'art-01', 3);
    if (!first.ok) throw new Error('expected claim');

    expect(() => selectAttempt(first.ledger, 'art-01', 1)).toThrow(/generated/);

    const recorded = recordGeneration(first.ledger, 'art-01', 1, {
      requestId: 'r',
      url: 'u',
    });
    const selected = selectAttempt(recorded, 'art-01', 1);
    expect(selected.slots['art-01']!.selected).toBe(1);
    expect(selected.slots['art-01']!.status).toBe('approved');
  });

  it('refuses new art for an approved slot', () => {
    const first = claim(fresh(), 'art-01', 3);
    if (!first.ok) throw new Error('expected claim');
    const recorded = recordGeneration(first.ledger, 'art-01', 1, { requestId: 'r', url: 'u' });
    const approved = selectAttempt(recorded, 'art-01', 1);

    const extra = claim(approved, 'art-01', 4);
    expect(extra.ok).toBe(false);
  });

  it('reopens a rejected slot so a retry can be claimed, keeping the attempt', () => {
    const first = claim(fresh(), 'art-01', 3);
    if (!first.ok) throw new Error('expected claim');
    const recorded = recordGeneration(first.ledger, 'art-01', 1, {
      requestId: 'r',
      url: 'u',
      costUsd: 0.01,
    });
    const approved = selectAttempt(recorded, 'art-01', 1);

    const reopened = reopenSlot(approved, 'art-01');
    expect(reopened.slots['art-01']?.status).toBe('open');
    expect(reopened.slots['art-01']?.selected).toBeUndefined();
    expect(reopened.slots['art-01']?.attempts).toEqual(approved.slots['art-01']?.attempts);
    expect(summarize(reopened).spendUsd).toBeCloseTo(0.01);

    const retry = claim(reopened, 'art-01', 4);
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.attempt.attempt).toBe(2);
    expect(retry.ledger.slots['art-01']?.attempts).toHaveLength(2);
  });

  it('refuses claims for skipped slots', () => {
    const ledger = markSlotStatus(fresh(), 'art-02', 'skipped');
    const result = claim(ledger, 'art-02', 1);
    expect(result.ok).toBe(false);
  });

  it('rejects unknown slots', () => {
    const result = claim(fresh(), 'art-99', 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('Unknown slot');
  });

  it('summarises ledger state for the CLI', () => {
    const ledger = createLedger(['a', 'b']);
    const summary = summarize(ledger);
    expect(summary.limit).toBeUndefined();
    expect(summary.used).toBe(0);
    expect(summary.remaining).toBeUndefined();
    expect(summary.unstarted).toBe(2);
    expect(summary.approved).toBe(0);
  });
});
