import { DECOR, JUMP, ROAD, SPAWN, WORLD } from '@/config';
import { blockingEvents, blocksEveryLane, BLOCK_WINDOW } from './blocking';
import { LEVEL_PROFILES, decorX, laneCenterAt, roadAt, type LevelBlueprint } from './types';

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
  const { road: shape, events, challenges, length, type } = blueprint;

  if (length <= SPAWN.safeStartPixels) {
    issues.push({ code: 'too-short', message: `Level length ${length} is inside the safe start` });
  }

  if (shape.lanes < 2) {
    issues.push({ code: 'lanes', message: `Only ${shape.lanes} lane(s); road is impassable` });
  }

  // The road is a shape now, not one cross-section, so the geometry is sampled across the
  // whole sector as well as at every keyframe: a keyframe can fall between two samples
  // and is the one place the width can be at its most extreme.
  const samples = new Set<number>([0, length]);
  for (const key of shape.keyframes) samples.add(key.at);
  for (let at = 0; at <= length; at += 256) samples.add(at);

  for (const at of [...samples].sort((a, b) => a - b)) {
    const profile = roadAt(shape, at);
    const right = profile.left + profile.width;

    if (profile.left < 0 || right > WORLD.width) {
      issues.push({
        code: 'road-bounds',
        message: `Road spans ${profile.left.toFixed(1)}..${right.toFixed(1)} at ${at}, outside the ${WORLD.width.toFixed(0)}px aperture`,
        at,
      });
    }

    if (profile.laneWidth < ROAD.minLaneWidth) {
      issues.push({
        code: 'lane-width',
        message: `Lane width ${profile.laneWidth.toFixed(1)} at ${at} is below the ${ROAD.minLaneWidth}px minimum`,
        at,
      });
    }

    if (issues.some((issue) => issue.code === 'road-bounds' || issue.code === 'lane-width')) break;
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

    // Decor is the one event with no lane: it stands outside the road by construction, so
    // the questions are whether it is far enough out to clear the shoulder and still
    // inside the aperture.
    if (event.kind === 'decor') {
      if (event.offset < DECOR.minOffset) {
        issues.push({
          code: 'decor-offset',
          message: `Decor ${event.prop} sits ${event.offset}px outside the edge, inside the ${DECOR.minOffset}px clearance`,
          at: event.at,
        });
      }

      const x = decorX(shape, event.at, event.side, event.offset);
      if (x < 0 || x > WORLD.width) {
        issues.push({
          code: 'decor-bounds',
          message: `Decor ${event.prop} sits at x ${x.toFixed(1)}, outside the aperture`,
          at: event.at,
        });
      }
      continue;
    }

    if (event.lane < 0 || event.lane >= shape.lanes) {
      issues.push({
        code: 'lane-out-of-range',
        message: `${event.kind} in lane ${event.lane} of ${shape.lanes}`,
        at: event.at,
      });
    }

    const profile = roadAt(shape, event.at);
    const lane = Math.max(0, Math.min(shape.lanes - 1, event.lane));
    const center = laneCenterAt(shape, event.at, lane);
    if (center < profile.left || center > profile.left + profile.width) {
      issues.push({ code: 'lane-center', message: `Lane ${event.lane} centre is off-road`, at: event.at });
    }
  }

  // Hostile and neutral content must not appear during the safe start. Decor cannot block
  // anything, but a prop popping in beside the car at spawn still reads as a glitch.
  for (const event of events) {
    if (event.kind !== 'traffic' && event.kind !== 'enemy' && event.kind !== 'decor') continue;
    if (event.at < SPAWN.safeStartPixels - 1) {
      issues.push({
        code: 'safe-start-violation',
        message: `${event.kind} at ${event.at} is inside the safe start (${SPAWN.safeStartPixels})`,
        at: event.at,
      });
    }
  }

  // A wave that blocks every lane simultaneously is an unavoidable death. Only events the
  // car cannot pass count: a cone is knocked aside and a crater only slows it, so neither
  // closes a lane. The blocking rule lives in `blocking.ts`, shared with the generator.
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const blockers = blockingEvents(sorted);
  for (const anchor of blockers) {
    if (blocksEveryLane(blockers, shape.lanes, anchor.at, anchor.at)) {
      issues.push({
        code: 'full-block',
        message: `All ${shape.lanes} lanes blocked within ${BLOCK_WINDOW}px at ${anchor.at}`,
        at: anchor.at,
      });
      break;
    }
  }

  // Ramps: the car has to be able to reach one, and the jump has to land on road rather
  // than in the middle of a wall. Both windows come from the same jump contract that the
  // scene and `systems/jump.ts` use, so tuning the jump cannot silently invalidate a level.
  for (const ramp of sorted) {
    if (ramp.kind !== 'ramp') continue;

    const crowding = blockers.find(
      (blocker) =>
        blocker.lane === ramp.lane &&
        blocker.at >= ramp.at - JUMP.guardBehind &&
        blocker.at <= ramp.at + JUMP.gapAhead,
    );
    if (crowding) {
      issues.push({
        code: 'ramp-crowded',
        message: `Ramp in lane ${ramp.lane} at ${ramp.at} is blocked by a ${crowding.kind} at ${crowding.at}`,
        at: ramp.at,
      });
    }

    if (
      blocksEveryLane(
        blockers,
        shape.lanes,
        ramp.at - JUMP.guardBehind,
        ramp.at + JUMP.clearancePixels,
      )
    ) {
      issues.push({
        code: 'ramp-wall',
        message: `Ramp at ${ramp.at} launches into a row that blocks all ${shape.lanes} lanes`,
        at: ramp.at,
      });
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
