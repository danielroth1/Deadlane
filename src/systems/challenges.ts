import type { ChallengePlan, LevelBlueprint } from '@/levels/types';

/**
 * Challenge tracking.
 *
 * Challenges are windows over the level, not scripts. Each one has a predicate evaluated
 * against counters that the scene feeds in. Keeping them declarative means the generator
 * can compose them freely and the validator can reason about them.
 */

export interface ChallengeState {
  readonly id: string;
  readonly label: string;
  readonly active: boolean;
  readonly complete: boolean;
  readonly failed: boolean;
  readonly progress: number;
  readonly target: number;
}

export interface ChallengeCounters {
  kills: number;
  civilianHits: number;
  pickups: number;
}

export class ChallengeSystem {
  private readonly plans: readonly ChallengePlan[];
  private index = 0;
  private counters: ChallengeCounters = { kills: 0, civilianHits: 0, pickups: 0 };
  private readonly completed = new Set<string>();
  private readonly failed = new Set<string>();

  constructor(
    blueprint: LevelBlueprint,
    private readonly onComplete: (plan: ChallengePlan) => void,
    private readonly onFail: (plan: ChallengePlan) => void,
  ) {
    this.plans = blueprint.challenges;
  }

  /** Advance windows; returns the state of the challenge covering `distance`. */
  update(distance: number): ChallengeState | null {
    while (this.index < this.plans.length && distance > this.plans[this.index]!.to) {
      this.closeChallenge(this.plans[this.index]!);
      this.index += 1;
      this.counters = { kills: 0, civilianHits: 0, pickups: 0 };
    }

    const plan = this.plans[this.index];
    if (!plan) return null;
    if (distance < plan.from) return null;

    return {
      id: plan.id,
      label: plan.label,
      active: true,
      complete: this.completed.has(plan.id),
      failed: this.failed.has(plan.id),
      progress: this.progressFor(plan),
      target: plan.target,
    };
  }

  notifyKill(): void {
    this.counters.kills += 1;
  }

  notifyCivilianHit(): void {
    this.counters.civilianHits += 1;
  }

  notifyPickup(): void {
    this.counters.pickups += 1;
  }

  get allCompleted(): number {
    return this.completed.size;
  }

  get allFailed(): number {
    return this.failed.size;
  }

  get total(): number {
    return this.plans.length;
  }

  private progressFor(plan: ChallengePlan): number {
    switch (plan.kind) {
      case 'destroy':
        return Math.min(plan.target, this.counters.kills);
      case 'collect':
        return Math.min(plan.target, this.counters.pickups);
      case 'clean':
        return Math.min(1, this.counters.civilianHits);
      case 'reach':
      case 'survive':
      default:
        return 0;
    }
  }

  private closeChallenge(plan: ChallengePlan): void {
    const success = this.evaluate(plan);
    if (success) {
      this.completed.add(plan.id);
      this.onComplete(plan);
    } else {
      this.failed.add(plan.id);
      this.onFail(plan);
    }
  }

  private evaluate(plan: ChallengePlan): boolean {
    switch (plan.kind) {
      case 'destroy':
        return this.counters.kills >= plan.target;
      case 'collect':
        return this.counters.pickups >= plan.target;
      case 'clean':
        return this.counters.civilianHits === 0;
      case 'reach':
      case 'survive':
        // Surviving the window is the objective; reaching here means the player did.
        return true;
      default:
        return true;
    }
  }
}
