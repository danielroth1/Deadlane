import { BOSS } from '@/config';
import { BOSSES, type BossAttackPatternId, type BossDef } from '@/content';
import type { LevelType } from '@/levels/types';

/**
 * The boss fight, with no Phaser in sight.
 *
 * Two things live here because both have to be true on every frame of every run and both
 * are cheap to test in isolation:
 *
 *   1. **Selection** — which machine closes an act is a pure function of the level type and
 *      the act index. The content table decides; this module only applies the rule.
 *   2. **The fight state machine** — hp, defeat, and the telegraph → fire → recover cycle
 *      that makes an attack readable before it lands. Adding a boss variant is a row in
 *      `bosses.json`, never a new class.
 */

/** One telegraphed attack. Cadence and spread are code; the id is content. */
export interface BossAttackPattern {
  /** How long the boss winds up before the shells leave, in ms. */
  readonly telegraphMs: number;
  /** How long it holds fire after a volley, in ms. */
  readonly recoverMs: number;
  /** Shells in one volley. */
  readonly shots: number;
  /** Centre-to-centre spacing of the volley, px. */
  readonly spreadPx: number;
  /** Shell speed toward the car, px/s. */
  readonly projectileSpeed: number;
}

/**
 * Every pattern the content table can name.
 *
 * The record type is the exhaustiveness guard: a new `BossAttackPatternId` in
 * `src/content/index.ts` fails to compile until it has a row here.
 */
export const BOSS_ATTACKS: Readonly<Record<BossAttackPatternId, BossAttackPattern>> = {
  // Carrier: a tight aimed burst from the dorsal turret.
  'turret-burst': { telegraphMs: 520, recoverMs: 1100, shots: 3, spreadPx: 26, projectileSpeed: 250 },
  // Carrier: a wider sweep that closes lanes one after another.
  'track-sweep': { telegraphMs: 700, recoverMs: 900, shots: 5, spreadPx: 40, projectileSpeed: 210 },
  // Gunship: a fan from the rocket pods.
  'rocket-fan': { telegraphMs: 460, recoverMs: 1000, shots: 5, spreadPx: 46, projectileSpeed: 230 },
  // Gunship: a fast, short burst while it weaves.
  'strafe-burst': { telegraphMs: 380, recoverMs: 800, shots: 4, spreadPx: 30, projectileSpeed: 280 },
  // Dreadnought: a full broadside across the river.
  broadside: { telegraphMs: 640, recoverMs: 1000, shots: 7, spreadPx: 52, projectileSpeed: 220 },
  // Dreadnought: two slow, heavy charges dropped wide.
  'depth-charge': { telegraphMs: 820, recoverMs: 1200, shots: 2, spreadPx: 90, projectileSpeed: 170 },
  // Borer: a hard, fast punch down the middle.
  'drill-punch': { telegraphMs: 560, recoverMs: 900, shots: 3, spreadPx: 22, projectileSpeed: 320 },
  // Borer: broken rock thrown wide.
  'rubble-burst': { telegraphMs: 680, recoverMs: 1100, shots: 6, spreadPx: 44, projectileSpeed: 200 },
};

export type BossPhase = 'idle' | 'telegraph' | 'recover';

export interface BossFightState {
  readonly maxHp: number;
  hp: number;
  /** The attack ids this boss alternates between, in order. */
  readonly attacks: readonly BossAttackPatternId[];
  /** Index of the attack the boss is currently on. */
  attackIndex: number;
  phase: BossPhase;
  /** Timestamp, in the scene clock, at which the current phase ends. */
  phaseEndsAt: number;
  defeated: boolean;
}

/** What the fight asks the scene to do this frame. */
export type BossAction =
  | {
      readonly kind: 'telegraph';
      readonly attack: BossAttackPatternId;
      readonly pattern: BossAttackPattern;
    }
  | {
      readonly kind: 'fire';
      readonly attack: BossAttackPatternId;
      readonly pattern: BossAttackPattern;
    };

export type BossHitResult = 'damaged' | 'defeated';

/** Start a fight at full health, winding up for its first attack. */
export function createBossFight(def: BossDef, now: number): BossFightState {
  return {
    maxHp: def.hp,
    hp: def.hp,
    attacks: def.attacks,
    attackIndex: 0,
    phase: 'idle',
    phaseEndsAt: now + BOSS.openingMs,
    defeated: false,
  };
}

/**
 * Advance the attack cycle.
 *
 * One call per frame: the first frame past a phase boundary performs the transition and
 * reports it, every frame in between reports nothing. The cycle is telegraph → fire →
 * recover → telegraph, alternating the boss's attacks, so every volley is telegraphed and
 * a player can read it.
 */
export function bossAction(state: BossFightState, now: number): BossAction | null {
  if (state.defeated || state.attacks.length === 0) return null;

  const attack = state.attacks[state.attackIndex % state.attacks.length];
  if (!attack) return null;
  const pattern = BOSS_ATTACKS[attack];

  switch (state.phase) {
    case 'idle':
      if (now < state.phaseEndsAt) return null;
      state.phase = 'telegraph';
      state.phaseEndsAt = now + pattern.telegraphMs;
      return { kind: 'telegraph', attack, pattern };

    case 'telegraph':
      if (now < state.phaseEndsAt) return null;
      state.phase = 'recover';
      state.phaseEndsAt = now + pattern.recoverMs;
      state.attackIndex = (state.attackIndex + 1) % state.attacks.length;
      return { kind: 'fire', attack, pattern };

    case 'recover':
    default:
      if (now < state.phaseEndsAt) return null;
      state.phase = 'idle';
      state.phaseEndsAt = now;
      return null;
  }
}

/**
 * Apply damage. Defeat is terminal and hp never goes below zero, so a late shell hitting
 * the wreck cannot pay the reward twice or push the bar negative.
 */
export function damageBoss(state: BossFightState, amount: number): BossHitResult {
  if (state.defeated) return 'defeated';
  state.hp = Math.max(0, state.hp - Math.max(0, amount));
  if (state.hp === 0) {
    state.defeated = true;
    return 'defeated';
  }
  return 'damaged';
}

/** 0–1 for the HUD bar. */
export function bossHealthRatio(state: BossFightState): number {
  if (state.maxHp <= 0) return 0;
  return Math.max(0, Math.min(1, state.hp / state.maxHp));
}

/**
 * Which boss closes `levelType`'s act.
 *
 * Eligible rows list the level type (or the `any` wildcard) and have unlocked by
 * `actIndex`, honouring their own `variantEvery` cadence. The highest `minAct` wins, so a
 * variant introduced at act 2 takes over the acts it fields; a tie goes to table order, so
 * the type-specific row wins its debut. When nothing is eligible yet — canyon in act 1,
 * whose only boss is the act-2 gunship — the earliest wildcard row carries the act, so
 * every level type has a boss in every act.
 */
export function bossForLevel(levelType: LevelType, actIndex: number): BossDef {
  const matching = BOSSES.filter((boss) =>
    boss.levelTypes.some((type) => type === 'any' || type === levelType),
  );
  const fallback = matching[0];
  if (!fallback) throw new Error(`No boss can appear in "${levelType}"`);

  const eligible = matching.filter((boss) => isEligible(boss, actIndex));
  if (eligible.length > 0) return highestUnlock(eligible, matching);

  // Nothing unlocked: the earliest wildcard row is the type's only candidate today.
  const wildcard = matching.filter((boss) => boss.levelTypes.includes('any'));
  if (wildcard.length > 0) return earliestUnlock(wildcard, matching);

  // No wildcard either: the debut row still closes the act rather than leaving it bare.
  return fallback;
}

/** Has this row unlocked by `actIndex`, and is `actIndex` one of the acts it can field? */
function isEligible(boss: BossDef, actIndex: number): boolean {
  if (actIndex < boss.minAct) return false;
  const every = Math.max(1, Math.floor(boss.variantEvery ?? 1));
  return (actIndex - boss.minAct) % every === 0;
}

/** Highest `minAct`; ties resolved by the order the rows appear in the content table. */
function highestUnlock(rows: readonly BossDef[], order: readonly BossDef[]): BossDef {
  let best = rows[0];
  if (!best) throw new Error('highestUnlock called with no rows');
  for (const row of rows) {
    if (row.minAct > best.minAct) best = row;
  }
  const tied = rows.filter((row) => row.minAct === best.minAct);
  return earliestUnlock(tied, order);
}

/** Lowest `minAct`; ties resolved by content-table order. */
function earliestUnlock(rows: readonly BossDef[], order: readonly BossDef[]): BossDef {
  let best = rows[0];
  if (!best) throw new Error('earliestUnlock called with no rows');
  for (const row of rows) {
    if (row.minAct < best.minAct) best = row;
  }
  const tied = rows.filter((row) => row.minAct === best.minAct);
  const earliest = tied.reduce((winner, row) =>
    order.indexOf(row) < order.indexOf(winner) ? row : winner,
  );
  return earliest;
}
