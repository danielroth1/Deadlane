import { DECOR, LEVEL, MOTION, ROAD, SPAWN, WORLD } from '@/config';
import { CHALLENGE_TEMPLATES, type ChallengeDef } from '@/content';
import { createRng, type Rng } from '@/rng';
import {
  LEVEL_PROFILES,
  roadShapeFor,
  type ChallengePlan,
  type DecorSide,
  type LevelBlueprint,
  type LevelEvent,
  type LevelType,
  type RoadShape,
  type RoadWidthKey,
  type ScenerySurface,
} from '../types';

/**
 * The one generator, parameterised by level type.
 *
 * Level types differ through `LEVEL_PROFILES` plus a small number of hooks. Writing five
 * near-identical generators would have produced five places to fix the same bug; a single
 * staged pass with a data table keeps the invariants — sorted events, lanes in range,
 * nothing near the spawn point — enforced once, in one place.
 *
 * Stages: layout → traffic → encounters → props → pickups → challenges → sort.
 */
export interface GenerateOptions {
  readonly type: LevelType;
  readonly seed: number;
  /** 1-based level number; raises density and enemy variety. */
  readonly index: number;
}

/**
 * Every pickup kind the generator can place.
 *
 * Exported so the art seam can prove that each one has a sprite id: a kind placed here but
 * missing from `src/art/ids.ts` would spend a run drawing the procedural diamond.
 */
export const PICKUP_POOL: readonly string[] = ['oil', 'smoke', 'armour', 'shield', 'nitro'];

export function generateLevel({ type, seed, index }: GenerateOptions): LevelBlueprint {
  const profile = LEVEL_PROFILES[type];

  // Separate streams: tuning traffic must not shift enemy placement.
  const layoutRng = createRng(seed);
  const trafficRng = createRng((seed ^ 0x1f123bb5) >>> 0);
  const enemyRng = createRng((seed ^ 0x5bd1e995) >>> 0);
  const propRng = createRng((seed ^ 0x27d4eb2f) >>> 0);
  const pickupRng = createRng((seed ^ 0x165667b1) >>> 0);
  const challengeRng = createRng((seed ^ 0x9e3779b9) >>> 0);

  const length = LEVEL.lengthPixels + layoutRng.int(0, 4000);
  const difficulty = 1 + (index - 1) * 0.12;

  // The road's shape has its own stream too: adding width variation must not move a
  // single car, and a change to traffic density must not change the road.
  const roadRng = createRng((seed ^ 0x85ebca6b) >>> 0);
  const decorRng = createRng((seed ^ 0xc2b2ae35) >>> 0);
  const road = buildRoadShape(type, roadRng, length);

  const events: LevelEvent[] = [];

  events.push(...placeTraffic(trafficRng, road, length, profile.trafficDensity * difficulty, profile.vehiclePool));
  events.push(...placeEnemies(enemyRng, road, length, profile.enemyDensity * difficulty, profile.enemyWeights));
  events.push(...placeProps(propRng, road, length, profile.propDensity, profile.propPool));
  events.push(...placePickups(pickupRng, road, length, profile.pickupDensity));
  events.push(...placeDecor(decorRng, length, profile.scenerySurface, profile.sceneryPool));

  // Clamp: the placement loops deliberately overshoot the end so the last stretch is not
  // empty, but an event beyond `length` can never be reached and breaks the streamer.
  const inRange = events.filter((event) => event.at <= length);
  inRange.sort((a, b) => a.at - b.at);

  const challenges = buildChallenges(challengeRng, type, length, index);

  return {
    seed,
    type,
    index,
    length,
    road,
    events: inRange,
    challenges,
    scrollMultiplier: profile.scrollMultiplier,
    visibility: profile.visibility,
  };
}

/* --------------------------------- stages ---------------------------------- */

/**
 * The sector's width plan.
 *
 * The first keyframe is the level type's nominal width, so a sector always opens on the
 * road its profile declares; after that each span picks one step from `ROAD.widthSteps`.
 * The bounds are lane-based rather than width-based: no keyframe may make a lane narrower
 * than `ROAD.minLaneWidth` or wider than `ROAD.maxLaneWidth`, which is what keeps a wave
 * placed against a lane index solvable at every distance in the sector.
 */
function buildRoadShape(type: LevelType, rng: Rng, length: number): RoadShape {
  const base = roadShapeFor(type);
  const nominal = base.keyframes[0]?.width ?? base.minWidth;
  const minWidth = base.lanes * ROAD.minLaneWidth;
  // Never widen the surface past the point where the terrain band leaves the aperture.
  const maxWidth = Math.min(base.lanes * ROAD.maxLaneWidth, WORLD.width - 2 * ROAD.terrainMargin);

  const keyframes: RoadWidthKey[] = [{ at: 0, width: nominal }];

  for (let at = ROAD.widthSpan; at < length; at += ROAD.widthSpan) {
    const step = rng.pick(ROAD.widthSteps);
    const width = Math.round(Math.max(minWidth, Math.min(maxWidth, nominal * step)));
    // Jitter, so two sectors of one run do not change width on the same beat.
    keyframes.push({ at: Math.round(at + rng.range(-500, 500)), width });
  }

  keyframes.sort((a, b) => a.at - b.at);

  const widths = keyframes.map((key) => key.width);
  return {
    ...base,
    keyframes,
    minWidth: Math.min(...widths),
    maxWidth: Math.max(...widths),
  };
}

/**
 * Scenery outside the shoulder.
 *
 * Deterministic data, like every other event: a side, a distance outside the surface edge
 * and a prop id from the level type's own scenery pool. The generator never has to know
 * how wide the road is — the event carries the offset, and whoever draws it samples the
 * road at that `at`.
 */
function placeDecor(
  rng: Rng,
  length: number,
  surface: ScenerySurface,
  pool: readonly string[],
): LevelEvent[] {
  const out: LevelEvent[] = [];
  if (pool.length === 0) return out;

  let at = SPAWN.safeStartPixels;

  while (at < length) {
    const side: DecorSide = rng.chance(0.5) ? 'left' : 'right';
    out.push({
      kind: 'decor',
      at: Math.round(at),
      side,
      offset: Math.round(rng.range(DECOR.minOffset, DECOR.maxOffset)),
      prop: rng.pick(pool),
      surface,
    });
    at += DECOR.spacing * rng.range(0.6, 1.6);
  }

  return out;
}

function laneRange(rng: Rng, road: { lanes: number }): number {
  return rng.int(0, road.lanes - 1);
}

function placeTraffic(
  rng: Rng,
  road: RoadShape,
  length: number,
  density: number,
  pool: readonly string[],
): LevelEvent[] {
  const out: LevelEvent[] = [];
  // A 640x360 view shows a 360px slice of world. To read as traffic rather than scenery,
  // a row has to pass about every 110px at density 1.
  const spacing = Math.max(90, Math.round(150 / Math.max(0.2, density)));
  let at = SPAWN.safeStartPixels + rng.int(0, spacing);

  while (at < length) {
    // Two cars can share a row in different lanes; that is what makes traffic feel dense.
    const carsThisRow = rng.chance(0.5) ? 2 : 1;
    const usedLanes = new Set<number>();

    for (let i = 0; i < carsThisRow; i += 1) {
      const lane = laneRange(rng, road);
      if (usedLanes.has(lane)) continue;
      usedLanes.add(lane);

      out.push({
        kind: 'traffic',
        at: Math.max(SPAWN.safeStartPixels, Math.round(at + rng.range(-40, 40))),
        lane,
        vehicle: rng.pick(pool),
        // Absolute world speed in px/s, not a share of the player's scroll: traffic drives at
        // its own pace whether the player is flat out or stopped. The band is the old
        // 0.18–0.42 share of cruise, so a lane of traffic still slides past the car rather
        // than racing it.
        speed: Math.round(rng.range(0.18, 0.42) * MOTION.cruiseSpeed),
      });
    }

    at += spacing * rng.range(0.75, 1.35);
  }

  return out;
}

function placeEnemies(
  rng: Rng,
  road: RoadShape,
  length: number,
  density: number,
  weights: Readonly<Record<string, number>>,
): LevelEvent[] {
  const out: LevelEvent[] = [];
  const names = Object.keys(weights);
  const values = names.map((n) => weights[n] ?? 1);
  const spacing = Math.max(240, Math.round(420 / Math.max(0.2, density)));
  let at = SPAWN.safeStartPixels + 600;

  while (at < length) {
    const wave = rng.chance(0.25) ? 2 : 1;
    for (let i = 0; i < wave; i += 1) {
      out.push({
        kind: 'enemy',
        at: Math.round(at + i * 120),
        lane: laneRange(rng, road),
        enemy: rng.weighted(names, values),
      });
    }
    at += spacing * rng.range(0.8, 1.5);
  }

  return out;
}

function placeProps(
  rng: Rng,
  road: RoadShape,
  length: number,
  density: number,
  pool: readonly string[],
): LevelEvent[] {
  const out: LevelEvent[] = [];
  const spacing = Math.max(120, Math.round(340 / Math.max(0.2, density)));
  let at = SPAWN.safeStartPixels;

  while (at < length) {
    // Props skew to the outside lanes so the middle stays drivable.
    const edgeLanes = [0, road.lanes - 1];
    const lane = rng.chance(0.7) ? rng.pick(edgeLanes) : laneRange(rng, road);

    out.push({
      kind: 'prop',
      at: Math.round(at),
      lane: Math.max(0, Math.min(road.lanes - 1, lane)),
      prop: rng.pick(pool),
    });

    at += spacing * rng.range(0.7, 1.6);
  }

  return out;
}

function placePickups(
  rng: Rng,
  road: RoadShape,
  length: number,
  density: number,
): LevelEvent[] {
  const out: LevelEvent[] = [];
  const pool = PICKUP_POOL;
  const spacing = Math.max(500, Math.round(1400 / Math.max(0.2, density)));
  let at = SPAWN.safeStartPixels + 1500;

  while (at < length) {
    out.push({
      kind: 'pickup',
      at: Math.round(at),
      lane: laneRange(rng, road),
      pickup: rng.pick(pool),
    });
    at += spacing * rng.range(0.8, 1.4);
  }

  return out;
}

function buildChallenges(rng: Rng, type: LevelType, length: number, index: number): ChallengePlan[] {
  const windows = 3;
  const windowSize = length / windows;
  const out: ChallengePlan[] = [];

  // Kinds come from the content table, so a template can never be orphaned by a generator
  // that forgot one existed.
  const offset = (index - 1) % CHALLENGE_TEMPLATES.length;
  const scrollMultiplier = LEVEL_PROFILES[type].scrollMultiplier;

  const destroyTargets = ['enforcer', 'switchblade', 'roadlord'] as const;
  const enemy =
    destroyTargets[Math.min(destroyTargets.length - 1, Math.floor((index - 1) / 2))] ??
    destroyTargets[0];

  for (let i = 0; i < windows; i += 1) {
    const from = Math.round(i * windowSize);
    const to = Math.round((i + 1) * windowSize);
    // Rotating the starting kind per sector is what lets a three-window level still show
    // all five kinds over a run instead of opening on `reach` every time.
    const template = challengeTemplateAt(offset + i);
    const kind = template.kind;
    const target = challengeTarget(kind, rng, to - from, scrollMultiplier);

    const label = fillTemplate(template.label, {
      metres: String(Math.round(to * LEVEL.metresPerPixel)),
      count: String(target),
      target: `${enemy.toUpperCase()}S`,
      seconds: String(target),
    });

    out.push({ id: `c${i}-${kind}`, kind, from, to, target, label, reward: template.reward });
  }

  return out;
}

function challengeTemplateAt(index: number): ChallengeDef {
  const template = CHALLENGE_TEMPLATES[index % CHALLENGE_TEMPLATES.length];
  if (!template) {
    throw new Error('challenges.json must define at least one challenge template');
  }
  return template;
}

/** Kinds with a counter target; `reach` and `clean` are pass/fail windows. */
function challengeTarget(
  kind: ChallengeDef['kind'],
  rng: Rng,
  windowPixels: number,
  scrollMultiplier: number,
): number {
  switch (kind) {
    case 'destroy':
      return rng.int(2, 4);
    case 'collect':
      return rng.int(2, 3);
    case 'survive':
      // Nominal seconds for the window at base scroll; the HUD fills against the same
      // number, so the gauge closes exactly as the window ends.
      return Math.max(1, Math.round(windowPixels / (MOTION.cruiseSpeed * scrollMultiplier)));
    case 'reach':
    case 'clean':
    default:
      return 0;
  }
}

function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
