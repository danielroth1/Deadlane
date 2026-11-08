import enemiesRaw from './enemies.json';
import civiliansRaw from './civilians.json';
import weaponsRaw from './weapons.json';
import challengesRaw from './challenges.json';
import bossesRaw from './bosses.json';
import propsRaw from './props.json';
import type { PaletteKey } from '@/palette';
import { PALETTE } from '@/palette';
import type { VehicleShape } from '@/art/placeholders';
import type { LevelType } from '@/levels/types';

/**
 * Content tables.
 *
 * Everything here is data, validated at test time rather than at runtime: shipping a
 * validator into the bundle would cost bytes to catch bugs that CI catches for free.
 */

export type BehaviorId = 'weave' | 'charge' | 'ram' | 'hold' | 'turret';

export const BEHAVIORS: readonly BehaviorId[] = ['weave', 'charge', 'ram', 'hold', 'turret'];

export interface EnemyDef {
  id: string;
  label: string;
  behavior: BehaviorId;
  speed: number;
  hp: number;
  shape: VehicleShape;
  color: PaletteKey;
  accent: PaletteKey;
  size: number;
  /**
   * Full manifest sprite id of the form `<sheet-code>/<cell-slug>`, as keyed in
   * `public/assets/assets.json` → `.sprites`. This is **not** an enemy id: sheet cells are
   * labelled by hand and rarely match an enemy id verbatim. Omit it and the enemy draws
   * the procedural placeholder.
   */
  readonly art?: string;
  weaveAmplitude?: number;
  weavePeriod?: number;
  chargeSpeed?: number;
  ramRange?: number;
  fireRate?: number;
  projectileSpeed?: number;
}

export interface CivilianDef {
  id: string;
  label: string;
  shape: VehicleShape;
  size: number;
  speed: number;
  weight: number;
  /**
   * Full manifest sprite id of the form `<sheet-code>/<cell-slug>`, as keyed in
   * `public/assets/assets.json` → `.sprites`. This is **not** a civilian id: sheet cells
   * are labelled by hand and rarely match an id verbatim. Omit it and the civilian draws
   * the procedural placeholder.
   */
  readonly art?: string;
}

export interface WeaponDef {
  id: 'gun' | 'oil' | 'smoke' | 'rocket' | 'flame';
  label: string;
  /** `forward` weapons fire up the road; `rear` weapons drop a hazard on it. */
  slot: 'primary' | 'rear' | 'forward';
  cooldown: number;
  ammo: 'infinite' | 'oil' | 'smoke' | 'rocket' | 'flame';
  damage: number;
  duration?: number;
  projectileSpeed?: number;
  /** Projectile travel limit, px. The rocket detonates when it runs out. */
  range?: number;
  /** Radius around a rocket burst that takes the blast, px. */
  splashRadius?: number;
  /** Half-width of the flame cone at its far edge, px. */
  coneHalfWidth?: number;
  /** Interval between two flame damage ticks, ms. */
  tickMs?: number;
  description: string;
}

export interface ChallengeDef {
  kind: 'reach' | 'destroy' | 'clean' | 'collect' | 'survive';
  label: string;
  description: string;
  reward: number;
}

/**
 * What a road prop does when the car reaches it.
 *
 * - `solid` stops the car: it parts the car, spends armour through the ordinary damage
 *   path and knocks the prop out of the road;
 * - `soft` is knocked aside: a cone or reed bed costs nothing but is visibly displaced;
 * - `hazard` slows the car without spending armour: a crater or an open manhole.
 *
 * The class is data, so a prop added to a level pool gets its behaviour from this table
 * rather than from a branch in the scene.
 */
export type PropCollision = 'solid' | 'soft' | 'hazard';

/** One row of `props.json`: a road prop and the box it collides with. */
export interface PropDef {
  id: string;
  label: string;
  collision: PropCollision;
  /** Collision half-width, px, about the prop's lane centre. */
  halfWidth: number;
  /** Collision half-height, px, about the prop's own world station. */
  halfHeight: number;
}

export const PROP_COLLISIONS: readonly PropCollision[] = ['solid', 'soft', 'hazard'];

/**
 * What an act boss is: a closed set of machines, not a class per boss.
 *
 * `kind` picks the placeholder silhouette the entity draws when no art frame exists; the
 * behaviour itself comes from the attack pattern rows the content table names.
 */
export type BossKind = 'carrier' | 'gunship' | 'dreadnought' | 'borer';

export const BOSS_KINDS: readonly BossKind[] = ['carrier', 'gunship', 'dreadnought', 'borer'];

/** The attack patterns `src/systems/boss.ts` implements. */
export type BossAttackPatternId =
  | 'turret-burst'
  | 'track-sweep'
  | 'rocket-fan'
  | 'strafe-burst'
  | 'broadside'
  | 'depth-charge'
  | 'drill-punch'
  | 'rubble-burst';

export const BOSS_ATTACK_PATTERN_IDS: readonly BossAttackPatternId[] = [
  'turret-burst',
  'track-sweep',
  'rocket-fan',
  'strafe-burst',
  'broadside',
  'depth-charge',
  'drill-punch',
  'rubble-burst',
];

export interface BossDef {
  id: string;
  label: string;
  kind: BossKind;
  /**
   * The level types this boss closes. `'any'` makes the row a wildcard: it is eligible
   * everywhere and is what carries a level type that has no dedicated machine.
   */
  levelTypes: readonly (LevelType | 'any')[];
  /** The lowest act this row can appear in. The highest eligible row wins. */
  minAct: number;
  /**
   * How often this row can field, in acts, counting from `minAct`. Omitted means every act.
   *
   * This is what makes the gunship a variant rather than a replacement: `minAct: 2` with
   * `variantEvery: 2` fields it in acts 2, 4 and 6, and the level type's own machine takes
   * the acts between.
   */
  variantEvery?: number;
  hp: number;
  /** Lateral chase speed, a share of `BOSS.lateralSpeed` in `config.ts`. */
  speed: number;
  /** The two (or more) telegraphed attacks the boss alternates between. */
  attacks: readonly BossAttackPatternId[];
  /** Points paid on defeat. Lives here, not in `scoring.ts`: it is content. */
  reward: number;
  /** On-screen footprint in pixels. Bigger than any enemy. */
  size: number;
  color: PaletteKey;
  accent: PaletteKey;
  /**
   * Full manifest sprite id of the form `<sheet-code>/<cell-slug>`, as keyed in
   * `public/assets/assets.json` → `.sprites`. The entity always asks for `boss/<id>` first,
   * so a dedicated art-07-boss cell takes over automatically once it ships; this donor is
   * the fallback until then. Omit it only when `boss/<id>` exists or a placeholder is fine.
   */
  readonly art?: string;
}

const PALETTE_KEYS = new Set(Object.keys(PALETTE));

export const ENEMIES: readonly EnemyDef[] = (enemiesRaw.enemies as unknown as EnemyDef[]).map(
  normalizeEnemy,
);
export const CIVILIANS: readonly CivilianDef[] = civiliansRaw.civilians as CivilianDef[];
export const WEAPONS: readonly WeaponDef[] = weaponsRaw.weapons as WeaponDef[];
export const CHALLENGE_TEMPLATES: readonly ChallengeDef[] = challengesRaw.challenges as ChallengeDef[];
export const BOSSES: readonly BossDef[] = (bossesRaw.bosses as unknown as BossDef[]).map(
  normalizeBoss,
);
export const PROPS: readonly PropDef[] = propsRaw.props as PropDef[];

/**
 * Content JSON uses kebab-case colour names (`signal-red`) because they read better in a
 * data file; the renderer uses camelCase keys. Normalising here means the JSON can stay
 * human-friendly without the runtime ever seeing a dash.
 */
function normalizePaletteKey(value: string): PaletteKey {
  const camel = value.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  if (!PALETTE_KEYS.has(camel)) {
    throw new Error(`Unknown palette colour "${value}" in content table`);
  }
  return camel as PaletteKey;
}

function normalizeEnemy(raw: EnemyDef): EnemyDef {
  return {
    ...raw,
    color: normalizePaletteKey(raw.color),
    accent: normalizePaletteKey(raw.accent),
  };
}

function normalizeBoss(raw: BossDef): BossDef {
  return {
    ...raw,
    color: normalizePaletteKey(raw.color),
    accent: normalizePaletteKey(raw.accent),
  };
}

const enemyById = new Map(ENEMIES.map((e) => [e.id, e]));
const civilianById = new Map(CIVILIANS.map((c) => [c.id, c]));
const bossById = new Map(BOSSES.map((b) => [b.id, b]));
const propById = new Map(PROPS.map((p) => [p.id, p]));

export function getEnemy(id: string): EnemyDef {
  const enemy = enemyById.get(id);
  if (!enemy) throw new Error(`Unknown enemy "${id}"`);
  return enemy;
}

export function getBoss(id: string): BossDef {
  const boss = bossById.get(id);
  if (!boss) throw new Error(`Unknown boss "${id}"`);
  return boss;
}

export function getCivilian(id: string): CivilianDef {
  const civilian = civilianById.get(id);
  if (!civilian) throw new Error(`Unknown civilian vehicle "${id}"`);
  return civilian;
}

/** Weighted civilian pick from the definition table, using a supplied 0–1 roll. */
export function pickCivilianFor(role: string): CivilianDef {
  // Deterministic by role so the same event always resolves to the same vehicle.
  let h = 0;
  for (let i = 0; i < role.length; i += 1) h = (h * 31 + role.charCodeAt(i)) >>> 0;
  const total = CIVILIANS.reduce((sum, c) => sum + c.weight, 0);
  let roll = (h % 1000) / 1000 * total;
  for (const c of CIVILIANS) {
    roll -= c.weight;
    if (roll <= 0) return c;
  }
  return CIVILIANS[0]!;
}

export function getWeapon(id: WeaponDef['id']): WeaponDef {
  const weapon = WEAPONS.find((w) => w.id === id);
  if (!weapon) throw new Error(`Unknown weapon "${id}"`);
  return weapon;
}

/**
 * The prop row for `id`, or undefined.
 *
 * Deliberately non-throwing: a validator and a generator both have to answer "is this id
 * solid?" for data they did not author, and an unknown id must not crash a run.
 */
export function findProp(id: string): PropDef | undefined {
  return propById.get(id);
}

export function getProp(id: string): PropDef {
  const prop = propById.get(id);
  if (!prop) throw new Error(`Unknown prop "${id}"`);
  return prop;
}
