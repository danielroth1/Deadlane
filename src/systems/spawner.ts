import type { LevelEvent } from '@/levels/types';

/**
 * The blueprint event stream.
 *
 * A sector's spawns are a sorted list of events, and the spawner's whole memory is a
 * cursor into that list. Keeping that cursor in a plain object behind pure functions is
 * what makes the sector boundary testable without a Phaser scene: the bug this guards
 * against is a cursor that survives into the next sector's blueprint and eats every spawn.
 */

export interface SpawnerState {
  /** Index of the next blueprint event that has not been consumed yet. */
  cursor: number;
}

export function createSpawnerState(): SpawnerState {
  return { cursor: 0 };
}

/** Drop the cursor back to the start so a sector begins on its own first event. */
export function resetSpawner(state: SpawnerState): void {
  state.cursor = 0;
}

export interface SpawnWindow {
  /** Nothing past this world distance is spawned yet. */
  readonly horizon: number;
  /** Events at or below this distance are already behind the player and are dropped. */
  readonly behind: number;
}

/**
 * Consume every event that has entered the spawn window.
 *
 * Returns events in blueprint order and leaves the cursor after the last one considered, so
 * a second call cannot replay them. Events that slipped behind the player while the world
 * was frozen are consumed but not returned: spawning them would drop a vehicle on top of
 * the player.
 */
export function takeDueEvents(
  state: SpawnerState,
  events: readonly LevelEvent[],
  window: SpawnWindow,
): LevelEvent[] {
  const due: LevelEvent[] = [];

  while (state.cursor < events.length) {
    const event = events[state.cursor];
    if (!event) break;
    if (event.at > window.horizon) break;

    state.cursor += 1;
    if (event.at <= window.behind) continue;

    due.push(event);
  }

  return due;
}
