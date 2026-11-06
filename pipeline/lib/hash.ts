import { createHash } from 'node:crypto';

/** Stable short hash, used for prompt identity in the ledger. */
export function hashText(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Deterministic seed per (slot, attempt).
 *
 * Determinism matters more than randomness here: a reviewer must be able to reproduce an
 * exact attempt from the ledger alone, and a retry must provably differ from the previous
 * one (ledger rule R4).
 */
export function deriveSeed(slotId: string, attempt: number): number {
  const digest = createHash('sha256').update(`${slotId}::attempt-${attempt}`).digest();
  // 31-bit positive integer, safely inside the range every image model accepts.
  return (digest.readUInt32BE(0) % 2_147_483_647) + 1;
}
