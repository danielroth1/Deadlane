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
  /**
   * World pixels between road-width keyframes.
   *
   * A sector is 24 000–28 000 px long, so this gives seven or eight width changes: enough
   * for a road to read as a place that tightens and opens again, slow enough that the
   * driver is never asked to read a new width and a new wave at the same moment.
   */
  widthSpan: 3400,
  /**
   * Narrowest and widest lane a keyframe may ask for, px.
   *
   * The lane count never changes, so these bounds are what keep every lane index valid and
   * every lane wide enough to thread: 48 px is three quarters of the player's 64 px
   * footprint, and 84 px is the widest a six-lane road can be without eating the terrain.
   */
  minLaneWidth: 48,
  maxLaneWidth: 84,
  /**
   * Width a keyframe may take, as a share of the sector's nominal width.
   *
   * Deliberately discrete: a road that picks a continuous width drifts into values no
   * author chose. 0.84 is the tightest a six-lane highway gets before it stops reading as
   * a highway, and the repeats of 1 keep most stretches at their authored width.
   */
  widthSteps: [0.84, 0.9, 1, 1, 1.06] as const,
  /** Terrain that must stay visible each side of the surface, px. */
  terrainMargin: 80,
} as const;

/**
 * Driving off the road.
 *
 * The car is no longer pinned to the paint: it may cross the shoulder onto the rough
 * ground beside it, and the rough ground is what punishes the mistake — a speed penalty
 * immediately, then armour through the ordinary damage path once the grace window runs
 * out. Nothing here spends a life directly; a wreck at zero armour does that on its own.
 */
export const OFFROAD = {
  /** How far past the surface the car may travel before the clamp stops it, px. */
  apron: 24,
  /** Grace between leaving the surface and the first damage tick, ms. */
  graceMs: 800,
  /** Gap between damage ticks while the car stays off the road, ms. */
  damageIntervalMs: 500,
  /** Share of cruise speed the car is held to on rough ground. */
  speedFactor: 0.55,
} as const;

/**
 * Scenery placed outside the shoulder.
 *
 * Decor is cosmetic data: it never collides, never blocks a lane and never spawns inside
 * the safe start. These numbers only decide where the props sit relative to the road edge
 * and how far apart they are.
 */
export const DECOR = {
  /** Closest a prop may sit to the surface edge, px. Clear of the 8 px shoulder. */
  minOffset: 26,
  /** Furthest a prop may sit from the surface edge, px. Inside the aperture. */
  maxOffset: 150,
  /** World pixels between decor props, before jitter. */
  spacing: 260,
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
  /**
   * Lives the run starts with.
   *
   * Lives are a run resource of their own, separate from armour: a hit spends armour, and
   * only a wreck at zero armour spends a life. `maxLives` is what the HUD draws pips for.
   */
  startLives: 3,
  maxLives: 3,
  /** Invulnerability window after taking a hit, in ms. */
  iFrames: 1200,
  /**
   * Invulnerability window after a respawn, in ms.
   *
   * Longer than `iFrames`: the player did not steer into the wreck, and the road around the
   * respawn point may still be busy. Gives time to read the banner and move.
   */
  respawnIFrames: 2400,
  /**
   * Screen-pixel radius swept clean when the car respawns, in px.
   *
   * Hostile shells and pursuers inside it are removed without paying score, so a respawn
   * is never a second death on the same frame's worth of trouble.
   */
  respawnClearRadius: 260,
  startOil: 3,
  startSmoke: 2,
  maxOil: 6,
  maxSmoke: 4,
  /** Rockets carried at the start of a run, and the ceiling a pickup can refill to. */
  startRockets: 4,
  maxRockets: 8,
  /** Flamethrower bursts carried at the start of a run, and their ceiling. */
  startFlame: 3,
  maxFlame: 6,
  /** Steering lean threshold, px/s. */
  leanThreshold: 120,
} as const;

/**
 * Where the dropped hazards land, how long a slick spins a car, and how the special
 * weapons sit on screen.
 *
 * Weapon cadence, damage, ranges and lifetimes are *not* here: they are content, in
 * `src/content/weapons.json`. These numbers only position an effect and shape the spin.
 *
 * A dropped hazard is world-static: it keeps the `at` it was laid at and only its screen
 * `y` is re-derived each frame, so the car drives away from it. Both drop distances are
 * therefore *ahead* of the car — a hazard behind the car is behind everything that can
 * touch it, because every hostile on the road is ahead and closing.
 */
export const WEAPON_FX = {
  /** World distance ahead of the car a slick is laid, px. */
  oilDropAhead: 200,
  /** World distance ahead of the car a smoke cloud is laid, px. */
  smokeDropAhead: 240,
  /** Oil catch window around a slick's centre, px. */
  oilCatchHalfWidth: 34,
  oilCatchHalfHeight: 30,
  /** Half-length of the smoke band along the road, px. */
  smokeCover: 40,
  /** How long a car caught by a slick keeps spinning, ms. */
  oilSpinMs: 1500,
  /** Peak lateral drift of a spinning car, px/s. */
  oilSpinDrift: 90,
  /** Revolutions per second the sprite turns through while it spins. */
  oilSpinTurns: 2,
  /** Frequency of the spin's lateral drift, Hz. Clock-derived, never random. */
  oilSpinHz: 0.9,
  /** Screen offset above the car's centre the rocket and the flame leave from, px. */
  muzzleOffset: 26,
  /** Fallbacks for the rocket when `weapons.json` omits a number. */
  rocketProjectileSpeed: 520,
  rocketRange: 640,
  rocketSplashRadius: 56,
  /** Cone half-width at the nose and at the far edge, px. */
  flameConeNearWidth: 10,
  /** Flame ticks when the content row omits `tickMs`, ms. */
  flameTickMs: 150,
  /** Distance between the stream sprites drawn up the flame cone, px. */
  flameStreamSpacing: 38,
  /** How many stream sprites the flame draws, and how long one flicker beat lasts, ms. */
  flameStreamSprites: 3,
  flameFlickerMs: 60,
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
 * Vehicle-versus-vehicle contact.
 *
 * A contact separates both cars and hands each an impulse; damage is what a *hard* contact
 * costs, not what a contact is. The maths lives in `systems/collision.ts` and is closed-form,
 * so these numbers are the whole of the feel and a seeded run resolves every contact the same
 * way twice.
 */
export const COLLISION = {
  /** Penetration left behind after separation, px, so neither box re-touches next frame. */
  slop: 0.5,
  /** Share of the closing speed a contact gives back as a bounce. */
  restitution: 0.35,
  /**
   * Kick every contact imparts, px/s, before the closing speed is folded in.
   *
   * Without it two cars that merely end up overlapping would part with no motion at all,
   * and a held steering key would grind along the other car instead of bouncing off it.
   */
  minPush: 70,
  /** Ceiling on that kick, px/s, so a closing speed cannot throw a car across the road. */
  maxPush: 320,
  /**
   * Closing speed along the contact normal that turns a contact into a hard one, px/s.
   *
   * Below it the cars scrape and part; at or above it the hit costs armour. A full-lock
   * steer is 260 px/s, so steering into another car is always hard, while rear-ending a
   * slower car from cruise is a scrape and needs the throttle to hurt.
   */
  hardImpactSpeed: 130,
  /** How fast an impact impulse bleeds off, px/s². */
  impulseDrag: 320,
  /** Damage a hard contact does to the other car. */
  impactDamage: 2,
  /** Steering wobble after a hard hit: peak additive steer (−1–1), length, rate. */
  wobbleSteer: 0.55,
  wobbleMs: 340,
  wobbleHz: 6,
  /**
   * Camera kick on a hit: scroll travel in world px, length, rate.
   *
   * Written as a decaying sine on the camera scroll rather than through Phaser's
   * `Camera.shake()`, which offsets the frame with `Math.random()`.
   */
  shakeOffset: 5,
  shakeMs: 220,
  shakeHz: 11,
  /** Depth, px, the debug collision stage leaves the staged car overlapping by. */
  stageOverlap: 12,
} as const;

/**
 * Ramp jumps.
 *
 * A ramp is a ground event, not a prop: crossing it starts a jump arc that makes the car
 * ignore ground obstacles and vehicles without making it immune to shells or the act boss.
 * The arc is a pure function of the scene clock (`systems/jump.ts`), so a seeded run jumps
 * identically every replay.
 */
export const JUMP = {
  /** How long the car stays off the ground after a ramp, ms. */
  durationMs: 1000,
  /** Height of the arc's apex above the road, px. Only the drawing uses this. */
  apexHeight: 34,
  /** Ground footprint of the shadow under an airborne car, px. */
  shadowWidth: 38,
  shadowHeight: 13,
  /** Screen offset of that shadow below the car's station, px. */
  shadowOffsetY: 10,
  /** Collision half-extents of a ramp's trigger box, px. */
  rampHalfWidth: 20,
  rampHalfHeight: 10,
  /**
   * How much road a jump has to cover, px.
   *
   * One duration at `MOTION.maxSpeed` is 420 px, so a blocking row placed inside this
   * window after a ramp can be cleared at full throttle.
   */
  clearancePixels: 420,
  /** A blocking prop this close behind a ramp makes the ramp unreachable, px. */
  guardBehind: 90,
  /** Clear road a ramp needs immediately ahead of its trigger, px. */
  gapAhead: 120,
  /** Floor on the gap between two ramps, px. */
  minSpacing: 1800,
} as const;

/**
 * What a ground prop costs when the car reaches it.
 *
 * The class comes from `content/props.json`; these numbers are the feel. Every damage tick
 * goes through `damagePlayer()`, so a solid obstacle spends armour on the same path a shell
 * does and a soft one spends nothing at all.
 */
export const PROP_IMPACT = {
  /** Speed cap after clipping a solid obstacle, as a share of cruise. */
  solidSpeedFactor: 0.35,
  /** Speed cap after crossing a hazard prop, as a share of cruise. */
  hazardSpeedFactor: 0.6,
  /** How far a knocked prop is thrown aside, px. Visual only. */
  knockAside: 30,
  /** How long that knock-aside fade runs for, ms. Visual only. */
  knockFadeMs: 220,
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
    /** Left gutter: movement and the dropped weapons. */
    boost: { x: 8, y: 236, width: 112, height: 92 },
    brake: { x: 8, y: 138, width: 112, height: 92 },
    oil: { x: 6, y: 36, width: 58, height: 52 },
    smoke: { x: 66, y: 36, width: 58, height: 52 },
    /** A second row between the dropped weapons and the brake: the forward specials. */
    rocket: { x: 6, y: 92, width: 58, height: 44 },
    flame: { x: 66, y: 92, width: 58, height: 44 },
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
  /** A car caught by a slick loses control; the slick is spent, the car is not. */
  oilSpin: 250,
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
