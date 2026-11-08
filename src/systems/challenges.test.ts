import { describe, expect, it } from 'vitest';
import { CHALLENGE_TEMPLATES } from '@/content';
import { roadShapeFor, type ChallengePlan, type LevelBlueprint } from '@/levels/types';
import { ChallengeSystem } from './challenges';

/**
 * The challenge system's contract with the scene: it forwards the plan it closed, so the
 * reward the scene pays is always the one `challenges.json` declared — and it exposes
 * progress for the counter kinds the HUD renders.
 */

function blueprintWith(challenges: readonly ChallengePlan[]): LevelBlueprint {
  return {
    seed: 1,
    type: 'highway',
    index: 1,
    length: 10_000,
    road: roadShapeFor('highway'),
    events: [],
    challenges,
    scrollMultiplier: 1,
    visibility: 1,
  };
}

function plan(
  id: string,
  templateIndex: number,
  from: number,
  to: number,
  target: number,
): ChallengePlan {
  const template = CHALLENGE_TEMPLATES[templateIndex];
  if (!template) throw new Error(`challenges.json has no template at index ${templateIndex}`);
  return { id, kind: template.kind, from, to, target, label: template.kind, reward: template.reward };
}

describe('ChallengeSystem', () => {
  it('hands every completed plan to the callback with its template reward', () => {
    // One window per template, each played on its own so the counters feeding it are the
    // ones that window raised. Every kind must be completable and pay its JSON reward.
    for (const [i, template] of CHALLENGE_TEMPLATES.entries()) {
      const paid: ChallengePlan[] = [];
      const system = new ChallengeSystem(
        blueprintWith([plan(template.kind, i, 0, 100, 1)]),
        (closed) => paid.push(closed),
        () => {},
      );

      system.notifyKill();
      system.notifyPickup();
      system.update(200);

      expect(paid).toHaveLength(1);
      expect(paid[0]?.kind).toBe(template.kind);
      expect(paid[0]?.reward).toBe(template.reward);
    }
  });

  it('holds each window to the counters raised inside it', () => {
    // Two destroy windows with different targets; kills must be counted per window.
    const plans = [plan('first', 1, 0, 100, 2), plan('second', 1, 100, 200, 1)];
    const outcomes: string[] = [];
    const system = new ChallengeSystem(
      blueprintWith(plans),
      (closed) => outcomes.push(`pass:${closed.id}`),
      (closed) => outcomes.push(`fail:${closed.id}`),
    );

    system.notifyKill();
    system.notifyKill();
    system.update(150); // first window closes with its two kills
    system.update(250); // second window closes with none

    expect(outcomes).toEqual(['pass:first', 'fail:second']);
  });

  it('reports collect and survive progress against their target', () => {
    const system = new ChallengeSystem(
      blueprintWith([plan('collect', 3, 0, 100, 3), plan('survive', 4, 100, 300, 10)]),
      () => {},
      () => {},
    );

    system.notifyPickup();
    system.notifyPickup();
    const collect = system.update(50);
    expect(collect).toMatchObject({ id: 'collect', progress: 2, target: 3 });

    // The survive gauge fills with the window, so the HUD can draw the time remaining.
    system.update(150);
    const survive = system.update(200);
    expect(survive).toMatchObject({ id: 'survive', progress: 5, target: 10 });
  });
});
