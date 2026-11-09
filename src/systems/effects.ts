import { FX } from '@/config';
import { EFFECT_ART } from '@/art/ids';
import { clamp } from '@/systems/motion';

/**
 * The deterministic effect table.
 *
 * Explosions are the only effect with a variant table, and the choice is the event's own
 * ordinal rather than a random draw: `explosionPackageFor(n)` is a pure function of `n`, so
 * the same kill in the same seed always wears the same package and two consecutive kills
 * never wear the same one. The scene keeps the ordinal and draws the layers; this module
 * owns the table and the arithmetic, which is why it can be unit-tested without Phaser.
 */

/** The four explosion packages the combat layer cycles through. */
export type ExplosionVariant = 'fireball' | 'smoke' | 'debris' | 'shockwave';

/** One sprite of an explosion package, in the units the scene draws with. */
export interface EffectLayer {
  /** Candidate frame ids, most specific first. */
  readonly ids: readonly string[];
  /** On-screen footprint the frame is scaled to, px. */
  readonly footprint: number;
  /** Multiple the layer grows to over its life. */
  readonly grow: number;
  /** How long the layer lives, ms. */
  readonly durationMs: number;
  /** Starting opacity. Defaults to fully opaque. */
  readonly alpha?: number;
  /** Static offset from the blast centre, px. */
  readonly offsetX?: number;
  readonly offsetY?: number;
}

/** One named package: every layer a single explosion draws. */
export interface ExplosionPackage {
  readonly variant: ExplosionVariant;
  readonly layers: readonly EffectLayer[];
}

const FIREBALL: ExplosionPackage = {
  variant: 'fireball',
  layers: [
    // The fireball itself, then the flame it leaves, then the ring it pushes out.
    { ids: EFFECT_ART.explosion, footprint: 56, grow: 2.2, durationMs: 360 },
    { ids: EFFECT_ART.fire, footprint: 40, grow: 1.6, durationMs: 420 },
    { ids: EFFECT_ART.shockwave, footprint: 48, grow: 2, durationMs: 300, alpha: 0.7 },
  ],
};

const SMOKE: ExplosionPackage = {
  variant: 'smoke',
  layers: [
    // A rising cloud pair with a short flame inside it, so the kill still reads as hot.
    { ids: EFFECT_ART.smoke, footprint: 56, grow: 2.4, durationMs: 620, alpha: 0.85 },
    {
      ids: EFFECT_ART.smoke,
      footprint: 40,
      grow: 1.8,
      durationMs: 520,
      alpha: 0.7,
      offsetX: -14,
      offsetY: -10,
    },
    { ids: EFFECT_ART.fire, footprint: 28, grow: 1.4, durationMs: 240, alpha: 0.8 },
  ],
};

const DEBRIS: ExplosionPackage = {
  variant: 'debris',
  layers: [
    // Chunks thrown out, a second smaller burst and the dust they left behind.
    { ids: EFFECT_ART.debris, footprint: 56, grow: 1.9, durationMs: 480 },
    {
      ids: EFFECT_ART.debris,
      footprint: 36,
      grow: 1.4,
      durationMs: 420,
      offsetX: 16,
      offsetY: -12,
    },
    { ids: EFFECT_ART.smoke, footprint: 36, grow: 1.7, durationMs: 460, alpha: 0.6 },
  ],
};

const SHOCKWAVE: ExplosionPackage = {
  variant: 'shockwave',
  layers: [
    // A wide ring first, then sparks off it and the debris it lifts.
    { ids: EFFECT_ART.shockwave, footprint: 64, grow: 2.6, durationMs: 340, alpha: 0.9 },
    { ids: EFFECT_ART.sparks, footprint: 32, grow: 1.8, durationMs: 220 },
    { ids: EFFECT_ART.debris, footprint: 32, grow: 1.5, durationMs: 360, alpha: 0.8 },
  ],
};

/** The packages in table order. */
export const EXPLOSION_PACKAGES: readonly ExplosionPackage[] = [
  FIREBALL,
  SMOKE,
  DEBRIS,
  SHOCKWAVE,
];

/**
 * The act boss's blast.
 *
 * Deliberately not one of the four: every layer of the table at once, at roughly twice the
 * footprint and half again the life, so the act-ending explosion cannot be mistaken for an
 * ordinary kill even in a single frame.
 */
export const BOSS_EXPLOSION_LAYERS: readonly EffectLayer[] = [
  { ids: EFFECT_ART.explosion, footprint: 96, grow: 3.2, durationMs: 620 },
  { ids: EFFECT_ART.fire, footprint: 72, grow: 2.4, durationMs: 700 },
  { ids: EFFECT_ART.shockwave, footprint: 96, grow: 3.6, durationMs: 520, alpha: 0.9 },
  { ids: EFFECT_ART.debris, footprint: 72, grow: 2.2, durationMs: 640 },
  {
    ids: EFFECT_ART.debris,
    footprint: 56,
    grow: 1.8,
    durationMs: 560,
    offsetX: 24,
    offsetY: -18,
  },
  { ids: EFFECT_ART.smoke, footprint: 80, grow: 2.6, durationMs: 820, alpha: 0.8 },
];

/**
 * The package an explosion with this ordinal wears.
 *
 * Pure and total: any integer wraps into the table, and a negative ordinal counts backwards
 * rather than reading past the front of the array.
 */
export function explosionPackageFor(ordinal: number): ExplosionPackage {
  const count = EXPLOSION_PACKAGES.length;
  const wrapped = ((Math.trunc(ordinal) % count) + count) % count;
  return EXPLOSION_PACKAGES[wrapped] ?? FIREBALL;
}

/**
 * Are the tyres lit this frame?
 *
 * Two events, not a per-frame tween: a hard steering input (high lateral velocity) or a hard
 * brake while the car is still carrying real speed. A drift at cruise with the wheel
 * straight leaves nothing, which is what keeps the road clean during ordinary driving.
 */
export function skidTriggered(
  lateralPxPerSecond: number,
  speedPxPerSecond: number,
  braking: boolean,
): boolean {
  if (Math.abs(lateralPxPerSecond) >= FX.skidMinLateral) return true;
  return braking && speedPxPerSecond >= FX.skidBrakeSpeed;
}

/** Opacity of a mark `ageMs` into a `lifeMs` life: full when fresh, zero once spent. */
export function skidFade(ageMs: number, lifeMs: number = FX.skidMarkLifeMs): number {
  if (lifeMs <= 0) return 0;
  return clamp(1 - ageMs / lifeMs, 0, 1);
}

/** The quarter turn a rotor is on at `timeMs`: 0–3, one step per `FX.rotorStepMs`. */
export function rotorQuarter(timeMs: number): number {
  const step = Math.max(1, FX.rotorStepMs);
  return Math.floor(Math.max(0, timeMs) / step) % 4;
}
