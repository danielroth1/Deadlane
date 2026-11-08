import { SPAWN, WORLD } from '@/config';
import { LEVEL_PROFILES, laneCenter, type LevelBlueprint } from './types';

/**
 * Playability invariants for a generated level.
 *
 * These are the things that make a level *unplayable* rather than merely uninteresting:
 * an event outside the road, content in the safe start, a wave that occupies every lane at
 * once, or a challenge that can never complete. Aesthetic variety is not checked here.
 */
export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly at?: number;
}

export function validateBlueprint(blueprint: LevelBlueprint): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { road, events, challenges, length, type } = blueprint;

  if (length <= SPAWN.safeStartPixels) {
    issues.push({ code: 'too-short', message: `Level length ${length} is inside the safe start` });
  }

  if (road.lanes < 2) {
    issues.push({ code: 'lanes', message: `Only ${road.lanes} lane(s); road is impassable` });
  }

  if (road.left < 0 || road.left + road.width > WORLD.width) {
    issues.push({
      code: 'road-bounds',
      message: `Road spans ${road.left}..${road.left + road.width}, outside the ${WORLD.width}px aperture`,
    });
  }

  for (const event of events) {
    if (!Number.isFinite(event.at) || event.at < 0) {
      issues.push({ code: 'event-position', message: `Event at ${event.at}`, at: event.at });
    }
    if (event.at > length + 1) {
      issues.push({
        code: 'event-out-of-range',
        message: `${event.kind} placed past the end of the level`,
        at: event.at,
      });
    }
    if (event.lane < 0 || event.lane >= road.lanes) {
      issues.push({
        code: 'lane-out-of-range',
        message: `${event.kind} in lane ${event.lane} of ${road.lanes}`,
        at: event.at,
      });
    }

    const center = laneCenter(road, Math.max(0, Math.min(road.lanes - 1, event.lane)));
    if (center < road.left || center > road.left + road.width) {
      issues.push({ code: 'lane-center', message: `Lane ${event.lane} centre is off-road`, at: event.at });
    }
  }

  // Hostile and neutral content must not appear during the safe start.
  for (const event of events) {
    if (event.kind === 'traffic' || event.kind === 'enemy') {
      if (event.at < SPAWN.safeStartPixels - 1) {
        issues.push({
          code: 'safe-start-violation',
          message: `${event.kind} at ${event.at} is inside the safe start (${SPAWN.safeStartPixels})`,
          at: event.at,
        });
      }
    }
  }

  // A wave that blocks every lane simultaneously is an unavoidable death.
  const window = 90;
  const sorted = [...events].sort((a, b) => a.at - b.at);
  for (let i = 0; i < sorted.length; i += 1) {
    const start = sorted[i]!.at;
    const lanes = new Set<number>();
    for (let j = i; j < sorted.length && sorted[j]!.at - start <= window; j += 1) {
      const e = sorted[j]!;
      if (e.kind === 'enemy' || e.kind === 'prop') lanes.add(e.lane);
    }
    // Every lane blocked leaves no line through.
    if (lanes.size >= road.lanes) {
      issues.push({
        code: 'full-block',
        message: `All ${road.lanes} lanes blocked within ${window}px at ${start}`,
        at: start,
      });
      break;
    }
  }

  // Events must be sorted so the streamer can walk them with a single cursor.
  for (let i = 1; i < events.length; i += 1) {
    if (events[i]!.at < events[i - 1]!.at) {
      issues.push({
        code: 'unsorted',
        message: `Event ${i} at ${events[i]!.at} precedes ${events[i - 1]!.at}`,
        at: events[i]!.at,
      });
      break;
    }
  }

  if (challenges.length === 0) {
    issues.push({ code: 'no-challenges', message: 'Level has no challenges' });
  }

  for (const challenge of challenges) {
    if (challenge.from >= challenge.to) {
      issues.push({
        code: 'challenge-window',
        message: `Challenge ${challenge.id} has an empty window`,
      });
    }
    if (challenge.to > length) {
      issues.push({
        code: 'challenge-bounds',
        message: `Challenge ${challenge.id} ends past the level`,
      });
    }
    if (
      (challenge.kind === 'destroy' ||
        challenge.kind === 'collect' ||
        challenge.kind === 'survive') &&
      challenge.target <= 0
    ) {
      issues.push({
        code: 'challenge-target',
        message: `Challenge ${challenge.id} (${challenge.kind}) has no target`,
      });
    }
  }

  const profile = LEVEL_PROFILES[type];
  if (profile.enemyDensity <= 0) {
    issues.push({ code: 'no-enemies', message: `Level type "${type}" has no enemies configured` });
  }

  return issues;
}
