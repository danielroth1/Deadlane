import { hashSeed } from '@/rng';
import { generateLevel } from './generators/shared';
import { LEVEL_TYPES, type LevelBlueprint, type LevelType } from './types';

/**
 * Level generator registry.
 *
 * Adding a level type means adding it to `LEVEL_TYPES` and giving it a row in
 * `LEVEL_PROFILES`; the generator, the validation suite and the test matrix all pick it up
 * automatically. That is the whole point of keeping types data-driven.
 */
export { generateLevel };

/** Cycle through level types so a run never repeats the same road twice in a row. */
export function typeForIndex(index: number): LevelType {
  return LEVEL_TYPES[(index - 1) % LEVEL_TYPES.length]!;
}

/** Deterministic blueprint for (seed, level number). */
export function levelForSeed(seed: number, index: number): LevelBlueprint {
  const type = typeForIndex(index);
  const levelSeed = (hashSeed(`${seed}:${index}:${type}`) ^ index) >>> 0;
  return generateLevel({ type, seed: levelSeed, index });
}

export * from './types';
