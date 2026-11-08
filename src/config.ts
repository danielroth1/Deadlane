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

/**
 * The world camera's zoom.
 *
 * Below 1 the camera shows more world than the 640×360 canvas holds, which is the point:
 * the road, its terrain and the stretch of highway ahead read as a place rather than a
 * corridor. Only the world camera is zoomed — the HUD and the touch pad live in their own
 * scene at 1:1, so screen-space UI never moves.
 */
export const CAMERA = {
  zoom: 0.75,
} as const;

/**
 * The authored world aperture, in world pixels.
 *
 * A camera zoomed to `z` sees `1 / z` screens of world, so the world is authored that big.
 * Every world-space drawing and bound — road bands, terrain, the darkness overlay, the
 * spawn horizon, the despawn edges — uses these numbers, which is what keeps the zoomed
 * frame filled with road instead of showing black past the edge of the drawing.
 *
 * `scale` converts an authored *screen* pixel into world pixels: anything measured in the
 * HUD's 640×360 space and applied in the world (a touch deadzone, a UI offset) multiplies
 * by it.
 */
export const WORLD = {
  width: GAME.width / CAMERA.zoom,
  height: GAME.height / CAMERA.zoom,
  scale: 1 / CAMERA.zoom,
} as const;

/** Drivable surface width, in world pixels: six lanes of 64 px. */
const ROAD_WIDTH = 384;

export const ROAD = {
  /**
   * X of the left road edge, in world pixels.
   *
   * Derived from the aperture so the road — and therefore the car starting in its centre —
   * sits in the middle of the zoomed frame. A level profile may centre its own narrower or
   * wider road the same way; see `roadProfileFor`.
   */
  left: (WORLD.width - ROAD_WIDTH) / 2,
  width: ROAD_WIDTH,
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
  /**
   * Vertical world position of the car's centre.
   *
   * The centre of the aperture, not the bottom edge: the camera is centred on the world, so
   * the car sits dead centre on screen and the road ahead and behind it are symmetric.
   */
  y: WORLD.height / 2,
  startArmor: 3,
  maxArmor: 5,
  /** Invulnerability window after taking a hit, in ms. */
  iFrames: 1200,
  startOil: 3,
  startSmoke: 2,
  maxOil: 6,
  maxSmoke: 4,
  /** Steering lean threshold, px/s. */
  leanThreshold: 120,
} as const;

/**
 * Where the rear weapons put their effects, and how big the catch windows are.
 *
 * Weapon cadence, damage and lifetimes are *not* here: they are content, in
 * `src/content/weapons.json`. These numbers only position an effect on screen.
 */
export const WEAPON_FX = {
  /** Screen offset of a dropped slick from the car's centre, px. Positive is behind. */
  oilOffset: 30,
  /** Screen offset of the smoke cloud from the car's centre, px. Negative is ahead. */
  smokeOffset: -34,
  /** Oil catch window around a slick's centre, px. */
  oilCatchHalfWidth: 34,
  oilCatchHalfHeight: 30,
  /** Half-length of the smoke band along the road, px. */
  smokeCover: 40,
  /** Shell speed for a hostile whose content row omits `projectileSpeed`. */
  enemyProjectileSpeed: 220,
  /** Shell speed if `weapons.json` ever omits the gun's. */
  gunProjectileSpeed: 640,
  /** Ceiling on a hostile shell's lateral lead, px/s. Point-blank shots must not snap. */
  maxShotDrift: 900,
} as const;

/**
 * The car's motion model.
 *
 * Speed is one number in world px/s, advanced by `systems/motion.ts` every frame. The road,
 * the engine note, the spawn horizon, the despawn edges and the distance score all read that
 * same number, so nothing can be at one speed visually and another physically.
 *
 * There are deliberately no instant multipliers here: the old `SPEED` table snapped the
 * scroll between three fixed values, which is why the car could not be driven smoothly and
 * could never stop.
 */
export const MOTION = {
  /** Speed the car settles at with no pedal held, px/s. The road is never frozen. */
  cruiseSpeed: 220,
  /** Ceiling with the throttle held, px/s. */
  maxSpeed: 420,
  /** Throttle acceleration, px/s². */
  acceleration: 240,
  /** Brake deceleration, px/s². Beats `coastDrag`, so a brake always wins the frame. */
  brakeDeceleration: 640,
  /** How fast the speed returns to cruise with no pedal held, px/s². */
  coastDrag: 150,
  /**
   * Extra cruise speed at full intensity, px/s.
   *
   * The old model got its difficulty ramp from a scroll multiplier; with a real velocity the
   * ramp belongs on the speed the car eases back to, so a late act still opens quick and the
   * player's pedals keep working either way.
   */
  cruiseBonus: 120,
} as const;

/**
 * Touch pad geometry and feel.
 *
 * The pad is drawn inside the letterboxed 640×360 canvas, so its numbers are authored in
 * the same pixels as everything else. Every button sits in one of the two 128 px gutters
 * beside the road, clear of the 28 px HUD strip at the top and the 24 px strip at the foot:
 * the play field stays unobstructed and no readout is covered.
 */
export const TOUCH = {
  /** Pointer travel, px, before a drag steers. Below this the car holds its line. */
  steerDeadzone: 12,
  /** How long a tapped button stays lit, ms. Purely feedback; the action fires on press. */
  tapFlashMs: 140,
  pad: {
    /** Right gutter: the thumb that holds the trigger. */
    fire: { x: 524, y: 236, width: 104, height: 92 },
    pause: { x: 576, y: 32, width: 56, height: 44 },
    /** Left gutter: movement and the two rear weapons. */
    boost: { x: 8, y: 236, width: 112, height: 92 },
    brake: { x: 8, y: 138, width: 112, height: 92 },
    oil: { x: 6, y: 36, width: 58, height: 52 },
    smoke: { x: 66, y: 36, width: 58, height: 52 },
  },
} as const;

export const SPAWN = {
  maxEnemiesOnScreen: 9,
  maxTrafficOnScreen: 14,
  /** Nothing spawns in the first stretch, so the player is never ambushed at spawn. */
  safeStartPixels: 900,
  /**
   * How far past the play aperture a unit travels before it is culled, in pixels.
   *
   * Applied on both edges: a unit that falls this far behind the player and one that
   * escapes this far below the screen are both gone.
   */
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

/**
 * How the act boss holds the road.
 *
 * The boss's hp, speed, attacks and reward are content, in `bosses.json`; these numbers only
 * decide where it sits and how it moves once it is on screen.
 */
export const BOSS = {
  /** Delay between the boss arriving and its first telegraph, in ms. */
  openingMs: 900,
  /** How far ahead of the car the boss holds station, in px of screen. */
  stationAhead: 132,
  /** Descent onto station, px/s, scaled by the row's `speed`. */
  approachSpeed: 260,
  /** Lateral travel across the road, px/s, scaled by the row's `speed`. */
  lateralSpeed: 150,
  /** Half the widest weave from the road centre, px, clamped to the road. */
  weaveAmplitude: 110,
  /** Seconds for one full weave. */
  weavePeriod: 5.6,
  /** Damage one boss shell does to the car. */
  shotDamage: 1,
  /** HUD health bar, px. */
  healthBarWidth: 220,
  healthBarHeight: 6,
} as const;

export const LEVEL = {
  /** World pixels per level before the next type is chosen. */
  lengthPixels: 24_000,
  /** Metadata distance unit shown to the player. */
  metresPerPixel: 0.04,
  /** How long the sector card stays up before play resumes, in ms. */
  introMs: 1600,
  /** Fade-in for that card, in ms. */
  introFadeMs: 180,
  /** The victory beat between a boss going down and the next sector's card, in ms. */
  bossVictoryMs: 1200,
} as const;

export const AUDIO = {
  masterVolume: 0.35,
  engineBaseHz: 62,
  engineMaxHz: 168,
} as const;
