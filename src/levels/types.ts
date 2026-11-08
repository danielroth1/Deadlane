import { ROAD } from '@/config';

/**
 * Level data model.
 *
 * A blueprint is pure data with no Phaser objects in it. Generators produce blueprints,
 * the scene streams them into sprites, and the test suite validates them over thousands of
 * seeds. Keeping Phaser out of this layer is what makes the generator testable and makes a
 * seeded run reproducible.
 */

export const LEVEL_TYPES = ['highway', 'canyon', 'river', 'city', 'tunnel'] as const;
export type LevelType = (typeof LEVEL_TYPES)[number];

export interface RoadProfile {
  /** X of the left edge of drivable surface. */
  readonly left: number;
  readonly width: number;
  readonly lanes: number;
  readonly laneWidth: number;
  /** Lane indices that are periodically obstructed in this level type. */
  readonly obstructableLanes: readonly number[];
}

export type LevelEvent =
  | { readonly kind: 'traffic'; readonly at: number; readonly lane: number; readonly vehicle: string; readonly speed: number }
  | { readonly kind: 'enemy'; readonly at: number; readonly lane: number; readonly enemy: string }
  | { readonly kind: 'prop'; readonly at: number; readonly lane: number; readonly prop: string }
  | { readonly kind: 'pickup'; readonly at: number; readonly lane: number; readonly pickup: string };

export type ChallengeKind = 'survive' | 'destroy' | 'collect' | 'clean' | 'reach';

export interface ChallengePlan {
  readonly id: string;
  readonly kind: ChallengeKind;
  readonly from: number;
  readonly to: number;
  readonly target: number;
  readonly label: string;
  /** Points paid on completion, straight from the template in `challenges.json`. */
  readonly reward: number;
}

export interface LevelBlueprint {
  readonly seed: number;
  readonly type: LevelType;
  readonly index: number;
  /** Length in world pixels. */
  readonly length: number;
  readonly road: RoadProfile;
  /** Sorted ascending by `at`. */
  readonly events: readonly LevelEvent[];
  readonly challenges: readonly ChallengePlan[];
  /** Multiplies world scroll speed. Tunnels are fast and claustrophobic. */
  readonly scrollMultiplier: number;
  /** 0–1. Lower means darker, used for the tunnel light mask. */
  readonly visibility: number;
}

/** Per-type personality. Everything the generators need to differ lives in this table. */
export interface LevelProfile {
  readonly type: LevelType;
  readonly label: string;
  readonly lanes: number;
  readonly scrollMultiplier: number;
  readonly visibility: number;
  readonly trafficDensity: number;
  readonly enemyDensity: number;
  readonly propDensity: number;
  readonly pickupDensity: number;
  readonly enemyWeights: Readonly<Record<string, number>>;
  readonly vehiclePool: readonly string[];
  readonly propPool: readonly string[];
}

export const LEVEL_PROFILES: Readonly<Record<LevelType, LevelProfile>> = {
  highway: {
    type: 'highway',
    label: 'INTERSTATE 9',
    lanes: 6,
    scrollMultiplier: 1,
    visibility: 1,
    trafficDensity: 1,
    enemyDensity: 1,
    propDensity: 0.5,
    pickupDensity: 1,
    enemyWeights: {
      enforcer: 4,
      switchblade: 3,
      roadlord: 1.2,
      hauler: 0.8,
      helicopter: 1,
      drone: 0.8,
    },
    vehiclePool: ['sedan', 'wagon', 'van', 'pickup', 'taxi', 'coupe', 'box-truck', 'bus'],
    propPool: ['cone', 'barrier', 'tyre-stack', 'sign'],
  },
  canyon: {
    type: 'canyon',
    label: 'REDLINE CANYON',
    lanes: 5,
    scrollMultiplier: 1.1,
    visibility: 0.92,
    trafficDensity: 0.6,
    enemyDensity: 1.1,
    propDensity: 1.6,
    pickupDensity: 0.7,
    enemyWeights: { enforcer: 3, switchblade: 3, roadlord: 2, hauler: 0.6 },
    vehiclePool: ['pickup', 'wagon', 'lorry', 'sedan'],
    propPool: ['boulder', 'rock-pile', 'cactus', 'dry-bush', 'crater'],
  },
  river: {
    type: 'river',
    label: 'DELTA RUN',
    lanes: 5,
    scrollMultiplier: 0.95,
    visibility: 1,
    trafficDensity: 0.4,
    enemyDensity: 1.2,
    propDensity: 1,
    pickupDensity: 0.9,
    enemyWeights: { gunboat: 4, speedboat: 3, jetski: 2, dredger: 0.7 },
    vehiclePool: ['skiff', 'barge', 'boat'],
    propPool: ['buoy', 'reed-bed', 'pier', 'rock-pile'],
  },
  city: {
    type: 'city',
    label: 'DOWNTOWN BLOCK',
    lanes: 6,
    scrollMultiplier: 1.05,
    visibility: 0.96,
    trafficDensity: 1.8,
    enemyDensity: 1.0,
    propDensity: 0.9,
    pickupDensity: 1.1,
    enemyWeights: {
      enforcer: 3,
      switchblade: 4,
      turret: 1.4,
      roadlord: 1,
      helicopter: 0.6,
      drone: 1.2,
    },
    vehiclePool: ['taxi', 'sedan', 'bus', 'van', 'hatchback', 'limo'],
    propPool: ['barrier', 'cone', 'roadblock', 'dumpster', 'manhole'],
  },
  tunnel: {
    type: 'tunnel',
    label: 'SERVICE TUNNEL 4',
    lanes: 4,
    scrollMultiplier: 1.25,
    visibility: 0.45,
    trafficDensity: 0.8,
    enemyDensity: 1.4,
    propDensity: 0.7,
    pickupDensity: 0.8,
    enemyWeights: { enforcer: 4, switchblade: 4, turret: 1.6 },
    vehiclePool: ['sedan', 'van', 'box-truck'],
    propPool: ['pillar', 'rubble', 'hazard-stripe'],
  },
};

/** The human-readable name of a level type, as shown on the sector card. */
export function levelLabelFor(type: LevelType): string {
  return LEVEL_PROFILES[type].label;
}

export function roadProfileFor(type: LevelType): RoadProfile {
  const profile = LEVEL_PROFILES[type];
  const laneWidth = profile.type === 'tunnel' || profile.type === 'river' ? 76 : ROAD.laneWidth;
  const width = profile.lanes * laneWidth;
  const left = Math.round((640 - width) / 2);

  const middle = Math.floor(profile.lanes / 2);
  const obstructable = [middle - 1, middle].filter((l) => l >= 0 && l < profile.lanes);

  return { left, width, lanes: profile.lanes, laneWidth, obstructableLanes: obstructable };
}

/** Centre X of a lane, in world coordinates. */
export function laneCenter(road: RoadProfile, lane: number): number {
  return road.left + road.laneWidth * (lane + 0.5);
}

/** Clamp a lane index into a road profile's range. */
export function clampLane(road: RoadProfile, lane: number): number {
  return Math.max(0, Math.min(road.lanes - 1, Math.round(lane)));
}
