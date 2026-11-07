/**
 * Every tuning number in DEADLANE lives here.
 *
 * Gameplay code must not contain magic numbers: balance passes are supposed to be a diff
 * against this file, and the reviewer checks that.
 */

export const GAME = {
  /** Internal render resolution. Everything is authored against this. */
  width: 640,
  height: 360,
  /** localStorage namespace. */
  storagePrefix: 'deadlane.',
  /** Phaser background colour, matches palette index 0. */
  background: 0x0b0d10,
} as const;

export const ROAD = {
  /** X of the left road edge. */
  left: 128,
  width: 384,
  laneWidth: 64,
  lanes: 6,
} as const;

export const PLAYER = {
  /** Pixels per second of lateral movement at full tilt. */
  lateralSpeed: 260,
  /**
   * On-screen footprint of the player car, in pixels.
   *
   * Deliberately independent of the art sheet's `finalSize`: the sheet may be 128 px per
   * cell for detail, but the car must still occupy one lane (64 px) on the road.
   */
  spriteSize: 64,
  /** Forward bias: the player sits above the bottom edge to see oncoming traffic. */
  y: GAME.height - 72,
  startArmor: 3,
  maxArmor: 5,
  /** Invulnerability window after taking a hit, in ms. */
  iFrames: 1200,
  /** Fire rate for the forward gun, ms. */
  gunCooldown: 180,
  startOil: 3,
  startSmoke: 2,
  maxOil: 6,
  maxSmoke: 4,
  /** Steering lean threshold, px/s. */
  leanThreshold: 120,
} as const;

export const SPEED = {
  /** World scroll speed at intensity 0. */
  baseScroll: 220,
  /** Additional scroll speed at intensity 1. */
  maxScrollBonus: 260,
  /** Player-forward bias added when holding accelerate. */
  boost: 1.35,
  /** Multiplier when braking. */
  brake: 0.55,
} as const;

export const SPAWN = {
  /** Distance in world pixels between director ticks. */
  directorInterval: 90,
  maxEnemiesOnScreen: 9,
  maxTrafficOnScreen: 14,
  /** Nothing spawns in the first stretch, so the player is never ambushed at spawn. */
  safeStartPixels: 900,
  despawnMargin: 120,
} as const;

export const SCORE = {
  civilianHit: -250,
  civilianDestroyed: -500,
  enemyDestroyed: 150,
  distancePerPoint: 12,
  oilKill: 300,
} as const;

export const DIFFICULTY = {
  /** Seconds of play to reach full intensity. */
  rampSeconds: 150,
  /** Intensity is smoothed so a bad run does not spike instantly. */
  smoothing: 0.0025,
} as const;

export const LEVEL = {
  /** World pixels per level before the next type is chosen. */
  lengthPixels: 24_000,
  /** Metadata distance unit shown to the player. */
  metresPerPixel: 0.04,
} as const;

export const AUDIO = {
  masterVolume: 0.35,
  engineBaseHz: 62,
  engineMaxHz: 168,
} as const;
