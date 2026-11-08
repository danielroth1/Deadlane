import { SCORE } from '@/config';

/**
 * Scoring rules, with no Phaser in sight.
 *
 * Every score event defined by the content data resolves through this table, so the four
 * ways score can move are testable in isolation and cannot drift from `config.ts`.
 */

/**
 * One scoring event.
 *
 * Armour is a resource of its own: a hit that armour absorbs costs no score, which is why
 * `armourHit` has a rule that returns zero.
 */
export type ScoreEventKind =
  | 'enemyDestroyed'
  | 'civilianDestroyed'
  | 'civilianContact'
  | 'armourHit';

/** Points for one event. Negative values are penalties. */
export function scoreDelta(kind: ScoreEventKind): number {
  switch (kind) {
    case 'enemyDestroyed':
      return SCORE.enemyDestroyed;
    case 'civilianDestroyed':
      return SCORE.civilianDestroyed;
    case 'civilianContact':
      return SCORE.civilianHit;
    case 'armourHit':
      return 0;
    default:
      return unexpected(kind);
  }
}

/** Exhaustiveness guard: a new event kind must add a rule above. */
function unexpected(kind: never): never {
  throw new Error(`Unhandled score event: ${String(kind)}`);
}
