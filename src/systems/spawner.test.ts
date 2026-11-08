import { describe, expect, it } from 'vitest';
import { GAME } from '@/config';
import { levelForSeed } from '@/levels';
import type { LevelBlueprint, LevelEvent } from '@/levels/types';
import { createSpawnerState, resetSpawner, takeDueEvents, type SpawnerState } from './spawner';

/**
 * The sector boundary is the bug these guard: a cursor that survives into the next
 * blueprint silently consumes that sector's spawns, so sector 2 arrives empty. The scene
 * passes the same state object through every frame, so the functions here must be driven
 * exactly the way `GameScene.spawnFromBlueprint()` drives them.
 */

const SEED = 4242;
/** Distance covered by the simulated opener; real sectors are ~24,000 px long. */
const SECTOR_STRETCH = 4_000;
const STEP_PX = 30;
/** Nothing in a blueprint is behind world distance 0. */
const NOTHING_PASSED = -1;

/** Mirror of one stretch of `spawnFromBlueprint()` calls. */
function playSector(
  blueprint: LevelBlueprint,
  state: SpawnerState,
  stretch = SECTOR_STRETCH,
): LevelEvent[] {
  const spawned: LevelEvent[] = [];
  for (let distance = 0; distance <= stretch; distance += STEP_PX) {
    spawned.push(
      ...takeDueEvents(state, blueprint.events, {
        horizon: distance + GAME.height + 120,
        behind: distance,
      }),
    );
  }
  return spawned;
}

describe('sector spawner', () => {
  it('consumes each event exactly once', () => {
    const blueprint = levelForSeed(SEED, 1);
    const state = createSpawnerState();
    const first = takeDueEvents(state, blueprint.events, { horizon: 2_000, behind: NOTHING_PASSED });
    const second = takeDueEvents(state, blueprint.events, { horizon: 2_000, behind: NOTHING_PASSED });

    expect(first.length).toBeGreaterThan(0);
    expect(second).toEqual([]);
  });

  it('stops at the horizon and picks up where it left off', () => {
    const blueprint = levelForSeed(SEED, 1);
    const state = createSpawnerState();

    const early = takeDueEvents(state, blueprint.events, { horizon: 1_000, behind: NOTHING_PASSED });
    expect(early.length).toBeGreaterThan(0);
    expect(state.cursor).toBeLessThan(blueprint.events.length);

    const rest = takeDueEvents(state, blueprint.events, {
      horizon: Number.MAX_SAFE_INTEGER,
      behind: NOTHING_PASSED,
    });

    expect(early.length + rest.length).toBe(blueprint.events.length);
    expect(rest.every((event) => event.at > 1_000)).toBe(true);
  });

  it('drops events the player has already passed', () => {
    const events: readonly LevelEvent[] = [
      { kind: 'enemy', at: 100, lane: 0, enemy: 'enforcer' },
      { kind: 'enemy', at: 900, lane: 0, enemy: 'enforcer' },
    ];
    const state = createSpawnerState();

    // A frozen world that resumes at 500 would otherwise drop a vehicle on the player.
    const due = takeDueEvents(state, events, { horizon: 950, behind: 500 });

    expect(due.map((event) => event.at)).toEqual([900]);
    expect(state.cursor).toBe(2);
  });

  it('starts the next sector on its own first event instead of eating its spawns', () => {
    const sectorOne = levelForSeed(SEED, 1);
    const sectorTwo = levelForSeed(SEED, 2);
    const state = createSpawnerState();

    const firstSector = playSector(sectorOne, state);
    expect(firstSector.length).toBeGreaterThan(0);
    const spentCursor = state.cursor;
    expect(spentCursor).toBeGreaterThan(0);

    // Without the reset, the cursor is already past sector two's opening events.
    const freshSectorTwo = playSector(sectorTwo, createSpawnerState());
    const withoutReset = playSector(sectorTwo, { cursor: spentCursor });
    expect(freshSectorTwo.length).toBeGreaterThan(0);
    expect(withoutReset.length).toBeLessThan(freshSectorTwo.length);

    resetSpawner(state);
    expect(state.cursor).toBe(0);

    // With the reset, sector two is indistinguishable from a sector that just started.
    expect(playSector(sectorTwo, state)).toEqual(freshSectorTwo);
  });
});
