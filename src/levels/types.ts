import { ROAD, WORLD } from '@/config';
import type { ScenerySurface } from '@/art/ids';

export type { ScenerySurface };

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

/** One width keyframe: from `at` the drivable surface is `width` px wide. */
export interface RoadWidthKey {
  readonly at: number;
  readonly width: number;
}

/**
 * A sector's road as a shape, not one cross-section.
 *
 * The lane count is fixed for the whole sector, so a lane index stays valid at every `at`;
 * what changes is how wide the surface is. Width is interpolated between keyframes and the
 * road re-centres itself on the world aperture at every sample, which is what lets a sector
 * tighten and open again without ever leaving the viewport or moving a lane boundary the
 * collision code disagrees with.
 *
 * `RoadShape` is the data the blueprint carries; `roadAt()` is the only sanctioned way to
 * read geometry out of it, so no subsystem can hold a stale profile.
 */
export interface RoadShape {
  readonly lanes: number;
  /** Lane width at the sector's nominal width, px. */
  readonly laneWidth: number;
  readonly obstructableLanes: readonly number[];
  /** Sorted ascending by `at`; the first key is at 0 and covers everything before it. */
  readonly keyframes: readonly RoadWidthKey[];
  readonly minWidth: number;
  readonly maxWidth: number;
}

/** Which scenery sheet a decor prop is drawn from. */
export type DecorSide = 'left' | 'right';

export type LevelEvent =
  | { readonly kind: 'traffic'; readonly at: number; readonly lane: number; readonly vehicle: string; readonly speed: number }
  | { readonly kind: 'enemy'; readonly at: number; readonly lane: number; readonly enemy: string }
  | { readonly kind: 'prop'; readonly at: number; readonly lane: number; readonly prop: string }
  | { readonly kind: 'pickup'; readonly at: number; readonly lane: number; readonly pickup: string }
  | {
      readonly kind: 'decor';
      readonly at: number;
      readonly side: DecorSide;
      /** Distance outside the surface edge at `at`, px. Always at least `DECOR.minOffset`. */
      readonly offset: number;
      /** Scenery prop id, resolved through `SCENERY_ART`. */
      readonly prop: string;
      readonly surface: ScenerySurface;
    };

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
  readonly road: RoadShape;
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
  /** Which scenery sheet this level type lines its road with. */
  readonly scenerySurface: ScenerySurface;
  /** Scenery prop ids placed outside the shoulder. Empty when there is nowhere to put them. */
  readonly sceneryPool: readonly string[];
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
    scenerySurface: 'roadside',
    sceneryPool: [
      'tree',
      'tree',
      'dead-tree',
      'bush',
      'dry-hedge',
      'fence',
      'warning-sign',
      'billboard',
      'wrecked-car',
      'pylon',
    ],
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
    scenerySurface: 'roadside',
    sceneryPool: [
      'dead-tree',
      'dead-tree',
      'bush',
      'dry-hedge',
      'dry-hedge',
      'fence',
      'warning-sign',
      'burnt-car',
      'pylon',
      'billboard',
    ],
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
    scenerySurface: 'water',
    sceneryPool: [
      'reeds',
      'reeds',
      'dock',
      'buoy',
      'buoy',
      'boat',
      'water-rock',
      'jetty',
      'bridge-pier',
      'tire-fender',
      'mooring-post',
      'pontoon',
    ],
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
    scenerySurface: 'urban',
    sceneryPool: [
      'apartment-roof',
      'house-roof',
      'skylight',
      'hatch',
      'neon-sign',
      'billboard',
      'ac-unit',
      'dumpster',
      'streetlight',
      'streetlight',
      'planter',
      'water-tank',
      'satellite-dish',
    ],
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
    scenerySurface: 'roadside',
    // A tunnel is wall on both sides: there is no verge to stand a prop on.
    sceneryPool: [],
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
  // Centred on the world aperture, not on the canvas: the world camera is zoomed out, so a
  // road centred on 640 would sit off-centre in the frame. Deliberately not rounded — the
  // centring is exact in world units, and `(GAME.width - width * zoom) / 2`, which is the
  // number of screen pixels it comes out as, is a whole number for every profile, so the
  // road lands on whole screen pixels without a rounding step here.
  const left = (WORLD.width - width) / 2;

  const middle = Math.floor(profile.lanes / 2);
  const obstructable = [middle - 1, middle].filter((l) => l >= 0 && l < profile.lanes);

  return { left, width, lanes: profile.lanes, laneWidth, obstructableLanes: obstructable };
}

/** Centre X of a lane, in world coordinates. */
export function laneCenter(road: RoadProfile, lane: number): number {
  return road.left + road.laneWidth * (lane + 0.5);
}

/** Centre X of a lane at one world distance, in world coordinates. */
export function laneCenterAt(shape: RoadShape, at: number, lane: number): number {
  return laneCenter(roadAt(shape, at), lane);
}

/**
 * A sector's road with a single keyframe: the nominal width for its level type.
 *
 * The generator widens this into a width plan; everything that only needs a valid shape —
 * tests, fixtures, a level with no width variation — can start here.
 */
export function roadShapeFor(type: LevelType): RoadShape {
  const profile = roadProfileFor(type);
  return {
    lanes: profile.lanes,
    laneWidth: profile.laneWidth,
    obstructableLanes: profile.obstructableLanes,
    keyframes: [{ at: 0, width: profile.width }],
    minWidth: profile.width,
    maxWidth: profile.width,
  };
}

/**
 * Width of the drivable surface at `at`, px.
 *
 * Linear between keyframes, constant before the first and after the last. A keyframe's own
 * `at` reports that keyframe's width exactly, which is what makes a width plan testable
 * without floating-point tolerance.
 */
export function roadWidthAt(shape: RoadShape, at: number): number {
  const keys = shape.keyframes;
  const first = keys[0];
  if (!first) return shape.minWidth;
  if (at <= first.at) return first.width;

  for (let i = 1; i < keys.length; i += 1) {
    const next = keys[i];
    const prev = keys[i - 1];
    if (!next || !prev) break;
    if (at > next.at) continue;

    const span = next.at - prev.at;
    if (span <= 0) return next.width;
    const t = (at - prev.at) / span;
    return prev.width + (next.width - prev.width) * t;
  }

  return keys[keys.length - 1]?.width ?? first.width;
}

/**
 * The road cross-section at one world distance.
 *
 * The surface is always centred on the world aperture, so widening and narrowing moves both
 * edges symmetrically and the car's start position stays the middle of the road. `laneWidth`
 * is derived, never stored: the lane count is fixed for a sector, so dividing the width by
 * it keeps every lane index valid at every `at`.
 */
export function roadAt(shape: RoadShape, at: number): RoadProfile {
  const width = roadWidthAt(shape, at);
  const lanes = Math.max(1, shape.lanes);
  return {
    left: (WORLD.width - width) / 2,
    width,
    lanes: shape.lanes,
    laneWidth: width / lanes,
    obstructableLanes: shape.obstructableLanes,
  };
}

/** World x of a decor prop standing `offset` px outside one edge of the road at `at`. */
export function decorX(
  shape: RoadShape,
  at: number,
  side: DecorSide,
  offset: number,
): number {
  const profile = roadAt(shape, at);
  return side === 'left' ? profile.left - offset : profile.left + profile.width + offset;
}

/** Clamp a lane index into a road profile's range. */
export function clampLane(road: RoadProfile, lane: number): number {
  return Math.max(0, Math.min(road.lanes - 1, Math.round(lane)));
}
