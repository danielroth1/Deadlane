import enemiesRaw from './enemies.json';
import civiliansRaw from './civilians.json';
import weaponsRaw from './weapons.json';
import challengesRaw from './challenges.json';
import type { PaletteKey } from '@/palette';
import { PALETTE } from '@/palette';
import type { VehicleShape } from '@/art/placeholders';

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
}

export interface WeaponDef {
  id: 'gun' | 'oil' | 'smoke';
  label: string;
  slot: 'primary' | 'rear';
  cooldown: number;
  ammo: 'infinite' | 'oil' | 'smoke';
  damage: number;
  duration?: number;
  projectileSpeed?: number;
  description: string;
}

export interface ChallengeDef {
  kind: 'reach' | 'destroy' | 'clean' | 'collect' | 'survive';
  label: string;
  description: string;
  reward: number;
}

const PALETTE_KEYS = new Set(Object.keys(PALETTE));

export const ENEMIES: readonly EnemyDef[] = (enemiesRaw.enemies as unknown as EnemyDef[]).map(
  normalizeEnemy,
);
export const CIVILIANS: readonly CivilianDef[] = civiliansRaw.civilians as CivilianDef[];
export const WEAPONS: readonly WeaponDef[] = weaponsRaw.weapons as WeaponDef[];
export const CHALLENGE_TEMPLATES: readonly ChallengeDef[] = challengesRaw.challenges as ChallengeDef[];

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

const enemyById = new Map(ENEMIES.map((e) => [e.id, e]));
const civilianById = new Map(CIVILIANS.map((c) => [c.id, c]));

export function getEnemy(id: string): EnemyDef {
  const enemy = enemyById.get(id);
  if (!enemy) throw new Error(`Unknown enemy "${id}"`);
  return enemy;
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
