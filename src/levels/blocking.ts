import { findProp } from '@/content';
import { blocksLane } from '@/systems/props';
import type { LevelEvent } from './types';

/**
 * What stops a car on the generated road.
 *
 * One definition, used by both the generator (which must not place a ramp in front of a
 * wall) and the validator (which fails a level that contains one). A prop's class comes
 * from `content/props.json`: cones are knocked aside, craters only slow the car, so only
 * an enemy or a solid prop can close a lane.
 */

/** Distance within which blocked lanes count as one row, px. */
export const BLOCK_WINDOW = 90;

/** A blocking event, narrowed to the lane it stands in. */
export type BlockingEvent = LevelEvent & { readonly lane: number };

/** True when the car cannot pass this event. */
export function isBlockingEvent(event: LevelEvent): event is BlockingEvent {
  if (event.kind === 'enemy') return true;
  if (event.kind !== 'prop') return false;

  const def = findProp(event.prop);
  // An id with no content row is treated as solid: better to over-report a wall than to
  // send a car into something the generator cannot classify.
  return def === undefined || blocksLane(def.collision);
}

/** Every blocking event in `events`, in their original order. */
export function blockingEvents(events: readonly LevelEvent[]): BlockingEvent[] {
  return events.filter(isBlockingEvent);
}

/** True when some `BLOCK_WINDOW` row inside `[from, to]` blocks every lane. */
export function blocksEveryLane(
  blockers: readonly { readonly at: number; readonly lane: number }[],
  lanes: number,
  from: number,
  to: number,
): boolean {
  for (const anchor of blockers) {
    if (anchor.at < from || anchor.at > to) continue;

    const hit = new Set<number>();
    for (const other of blockers) {
      if (other.at < anchor.at || other.at - anchor.at > BLOCK_WINDOW) continue;
      hit.add(other.lane);
    }
    if (hit.size >= lanes) return true;
  }
  return false;
}
