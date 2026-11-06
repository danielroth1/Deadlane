import { describe, expect, it } from 'vitest';
import {
  claimAttempt,
  createLedger,
  markSlotStatus,
  recordGeneration,
  releaseAttempt,
  remainingImages,
  selectAttempt,
  summarize,
  unstartedSlots,
  usedImages,
  type Ledger,
} from '../lib/ledger';

/**
 * The budget rules are the most expensive thing in this repository to get wrong: each
 * mistake costs real money and cannot be undone. They are asserted here rather than
 * trusted to agent discipline.
 */

const SLOTS = ['art-01', 'art-02', 'art-03', 'art-04'];

function fresh(limit = 20, perSlot = 6): Ledger {
  return createLedger(SLOTS, limit, perSlot);
}

function claim(ledger: Ledger, slot: string, seed: number) {
  return claimAttempt(ledger, slot, { seed, promptHash: `hash-${slot}-${seed}` });
}

describe('image budget ledger', () => {
  it('starts empty and reports the full budget', () => {
    const ledger = fresh();
    expect(usedImages(ledger)).toBe(0);
    expect(remainingImages(ledger)).toBe(20);
    expect(unstartedSlots(ledger)).toBe(4);
  });

  it('consumes one image per claim', () => {
    const result = claim(fresh(), 'art-01', 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(usedImages(result.ledger)).toBe(1);
    expect(result.attempt.attempt).toBe(1);
  });

  it('refuses a slot beyond the per-slot cap', () => {
    let ledger = fresh(80, 3);
    for (const seed of [1, 2, 3]) {
      const result = claim(ledger, 'art-01', seed);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      ledger = result.ledger;
    }

    const sixth = claim(ledger, 'art-01', 4);
    expect(sixth.ok).toBe(false);
    if (sixth.ok) return;
    expect(sixth.reason).toContain('attempts');
  });

  it('refuses past the lifetime ceiling', () => {
    // One slot, three images of budget, six attempts allowed per slot: the ceiling binds
    // before the per-slot cap does.
    let ledger = createLedger(['only'], 3, 6);
    for (const seed of [1, 2, 3]) {
      const result = claim(ledger, 'only', seed);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      ledger = result.ledger;
    }
    expect(usedImages(ledger)).toBe(3);

    const overflow = claim(ledger, 'only', 4);
    expect(overflow.ok).toBe(false);
    if (overflow.ok) return;
    expect(overflow.reason).toContain('exhausted');
  });

  it('refuses a retry that would starve an unstarted slot', () => {
    // 4 slots, 5 images: the first retry is allowed, the second is not, because it would
    // leave a slot that has never been tried with no budget at all.
    let ledger = createLedger(SLOTS, 5, 6);

    const first = claim(ledger, 'art-01', 1);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    ledger = first.ledger;

    const second = claim(ledger, 'art-01', 2);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    ledger = second.ledger;

    expect(usedImages(ledger)).toBe(2);
    expect(remainingImages(ledger)).toBe(3);
    expect(unstartedSlots(ledger)).toBe(3);

    const third = claim(ledger, 'art-01', 3);
    expect(third.ok).toBe(false);
    if (third.ok) return;
    expect(third.reason).toContain('never been attempted');
  });

  it('allows a first attempt even when the budget is tight', () => {
    let ledger = createLedger(SLOTS, 5, 6);
    for (const seed of [1, 2, 3]) {
      const result = claim(ledger, 'art-01', seed);
      if (result.ok) ledger = result.ledger;
    }
    const firstForNewSlot = claim(ledger, 'art-02', 4);
    expect(firstForNewSlot.ok).toBe(true);
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
    expect(remainingImages(released)).toBe(20);
    // A released slot counts as unstarted again, so it keeps its reservation.
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

  it('summarises budget state for the CLI', () => {
    const ledger = createLedger(['a', 'b'], 80, 6);
    const summary = summarize(ledger);
    expect(summary.limit).toBe(80);
    expect(summary.used).toBe(0);
    expect(summary.remaining).toBe(80);
    expect(summary.unstarted).toBe(2);
    expect(summary.approved).toBe(0);
  });
});
