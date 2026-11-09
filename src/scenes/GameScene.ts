import Phaser from 'phaser';
import {
  BOSS,
  CAMERA,
  COLLISION,
  DIFFICULTY,
  FX,
  GAME,
  JUMP,
  LEVEL,
  MOTION,
  OFFROAD,
  PLAYER,
  PROP_IMPACT,
  SCORE,
  SPAWN,
  TOUCH,
  WEAPON_FX,
  WORLD,
} from '@/config';
import { PALETTE } from '@/palette';
import { Art } from '@/art';
import {
  EFFECT_ART,
  FLAME_STREAM_ART,
  ROCKET_ART,
  pickSceneryVariant,
  pickupArtIds,
  propArtIds,
  rampArtIds,
  sceneryArtIds,
} from '@/art/ids';
import { flatTexture, pickupTexture, propTexture } from '@/art/placeholders';
import { PlayerVehicle, displayScale } from '@/entities/player';
import { EnemyVehicle } from '@/entities/enemy';
import { CivilianVehicle } from '@/entities/civilian';
import { BossVehicle } from '@/entities/boss';
import { findProp, getCivilian, getEnemy, getWeapon, type EnemyDef, type PropCollision } from '@/content';
import { bossForLevel, bossVolley, type BossAttackPattern } from '@/systems/boss';
import { contactWeaponFor } from '@/systems/contact-weapons';
import {
  flameCatches,
  forwardShot,
  oilCatches,
  projectHazard,
  returnShot,
  screenYFromWorldAt,
  smokeBlocksFire,
  withinBlast,
  worldAtFromScreenY,
} from '@/systems/weapons';
import { levelForSeed, levelLabelFor, type LevelBlueprint } from '@/levels';
import { decorX, laneCenter, laneCenterAt, roadAt, type LevelEvent, type RoadProfile } from '@/levels/types';
import { RoadSystem } from '@/systems/road';
import { acquireAudio, disposeAudio } from '@/systems/audio-registry';
import { weaponCue, bossCue, type AudioSystem } from '@/systems/audio';
import { speedRatio, stepSpeed } from '@/systems/motion';
import {
  BOSS_EXPLOSION_LAYERS,
  explosionPackageFor,
  rotorQuarter,
  skidFade,
  skidTriggered,
  type EffectLayer,
  type ExplosionVariant,
} from '@/systems/effects';
import {
  contactBetween,
  contactCost,
  contactImpactDamage,
  resolveContact,
  type CollisionBox,
} from '@/systems/collision';
import { propContactOutcome } from '@/systems/props';
import { ChallengeSystem } from '@/systems/challenges';
import { scoreDelta, type ScoreEventKind } from '@/systems/scoring';
import { TouchInput, buttonAt } from '@/systems/touch-input';
import {
  createSpawnerState,
  resetSpawner,
  takeDueEvents,
  type SpawnerState,
} from '@/systems/spawner';
import { PixelText, measureText } from '@/ui/pixel-text';
import { seedFromLocation } from '@/rng';
import { SECTOR_INTRO_DONE_EVENT } from './LevelIntroScene';

/** Emitted by this scene whenever the run is paused or resumed. The HUD owns the key. */
export const RUN_PAUSED_EVENT = 'run:paused';

/**
 * Top of the run banner, in authored *screen* pixels.
 *
 * The scene draws in world pixels because its camera is zoomed, so this number is converted
 * with `WORLD.scale` where it is used.
 */
const BANNER_Y = 58;

interface Bullet {
  readonly sprite: Phaser.GameObjects.Image;
  at: number;
  readonly speed: number;
  /** Lateral drift, px/s, so a hostile shell can arrive in the player's lane. */
  readonly driftX: number;
  readonly from: 'player' | 'enemy';
  readonly damage: number;
}

interface Hazard {
  readonly sprite: Phaser.GameObjects.Image;
  /**
   * The world station the hazard was laid at. Fixed for its whole life: the car drives away
   * from it, so a slick or cloud is never glued to the bumper.
   */
  readonly at: number;
  readonly kind: 'oil' | 'smoke';
  /** Mutable so a slick that has caught a car can be spent on the spot. */
  expiresAt: number;
}

/** One rocket in flight: a world station, a fuse and the blast it leaves behind. */
interface Rocket {
  readonly sprite: Phaser.GameObjects.Image;
  at: number;
  readonly speed: number;
  readonly damage: number;
  readonly splashRadius: number;
  /** Travel limit in world px. The rocket detonates when it runs out. */
  readonly range: number;
  travelled: number;
}

interface Pickup {
  readonly sprite: Phaser.GameObjects.Image;
  at: number;
  readonly x: number;
  readonly kind: string;
}

/** One ground prop on the road, with the box and class its content row declares. */
interface PropInstance {
  readonly sprite: Phaser.GameObjects.Image;
  at: number;
  readonly lane: number;
  readonly kind: string;
  readonly collision: PropCollision;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/** One ramp on the road. Crossing it starts a jump; it is not a prop and never collides. */
interface RampInstance {
  readonly sprite: Phaser.GameObjects.Image;
  readonly at: number;
  readonly lane: number;
}

/** One tyre line on the road. World-static: it is laid at an `at` and never moves again. */
interface SkidMark {
  readonly x: number;
  readonly at: number;
  readonly bornAt: number;
}

/** One rotor overlay tracking an aircraft sprite. */
interface Rotor {
  readonly sprite: Phaser.GameObjects.Image;
  readonly gfx: Phaser.GameObjects.Graphics;
  /** The last quarter turn applied, so the debug counter can step once per quarter. */
  quarter: number;
}

/** What the car landed on: dust on a road, a splash on the river. */
export type LandingKind = 'dust' | 'splash';

/** Which special weapon landed the most recent kill. Observation for the debug surface. */
export type WeaponKillKind = 'rocket' | 'flame';

/**
 * The last explosion package this run played.
 *
 * Explosions are the only effect with a variant table, so this is the one label a spec can
 * compare across two kills to prove the table is cycling. `boss` is the act-ending blast,
 * which is deliberately outside the four ordinary packages.
 */
export type FxVariant = ExplosionVariant | 'boss';

export interface HudState {
  score: number;
  armor: number;
  maxArmor: number;
  /** Lives left in the run. Separate from armour: armour refills on every respawn. */
  lives: number;
  maxLives: number;
  oil: number;
  smoke: number;
  rockets: number;
  flame: number;
  speed: number;
  distance: number;
  level: number;
  levelLabel: string;
  challenge: string;
  challengeProgress: number;
  challengeTarget: number;
  muted: boolean;
  /** True while the car is off the drivable surface. Drives the HUD's off-road warning. */
  offRoad: boolean;
  /** The live boss, while one is on the road. Drives the name plate and the health bar. */
  boss: BossHudState | null;
}

/** What the HUD needs to draw the boss bar. */
export interface BossHudState {
  readonly label: string;
  readonly hp: number;
  readonly maxHp: number;
}

/** What the sector card is currently saying. */
export interface SectorCardState {
  readonly level: number;
  readonly label: string;
}

/**
 * The input state the run resolved this frame.
 *
 * Observation only: the debug surface reports it so a spec can prove that a pointer
 * sequence reached gameplay, without having to infer intent from the score or the car's
 * position a second later.
 */
export interface InputDebugState {
  readonly steer: number;
  readonly boost: boolean;
  readonly brake: boolean;
  readonly fire: boolean;
}

/**
 * One scoring event resolved this run, as the debug surface reports it.
 *
 * `bossDestroyed` is reported here but is deliberately not a `scoreDelta` rule: the reward
 * is content, from `bosses.json`, so the delta cannot come from a fixed table.
 */
export interface ScoreEventRecord {
  readonly kind: ScoreEventKind | 'bossDestroyed';
  readonly delta: number;
}

/**
 * One car as the contact pass sees it.
 *
 * Deliberately the collision box rather than the sprite: a spec that proves two cars were
 * parted has to measure the box the resolver measured, not the artwork's bounds.
 */
export interface VehicleDebugState {
  readonly kind: 'player' | 'enemy' | 'civilian';
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  /** Lateral velocity, world px/s. */
  readonly vx: number;
  /** Velocity down-screen, world px/s. Zero for the car, which holds its station. */
  readonly vy: number;
  /**
   * Shots (or armour, for the car) left before this vehicle is wrecked.
   *
   * Exposed so a spec can prove durability on the real collision path instead of counting
   * explosions: one volley must reduce it, and it must not reach zero in that volley.
   */
  readonly hp: number;
  /** True while a contact weapon holds this vehicle's wheel. Always false but on the car. */
  readonly steerLocked: boolean;
  readonly wrecked: boolean;
  /** True while the car is off the ground after a ramp. Always false for other cars. */
  readonly airborne: boolean;
  /** True while a slick has this car spinning and out of control. Always false for the car. */
  readonly spinning: boolean;
}

/** One contact the resolver finished this run, as the debug surface reports it. */
export interface ContactDebugState {
  /** 1-based order of resolution, so a spec can tell a new contact from the last one. */
  readonly index: number;
  readonly other: 'enemy' | 'civilian';
  /** Penetration the contact started with, px. */
  readonly depth: number;
  readonly nx: number;
  readonly ny: number;
  /** Closing speed along the normal, px/s. */
  readonly approach: number;
  /** True when the contact was hard enough to cost armour. */
  readonly hard: boolean;
  /** Lateral velocity the contact gave the car, world px/s. */
  readonly playerVx: number;
  /** Lateral velocity it gave the other car, world px/s. Opposite in sign. */
  readonly otherVx: number;
  /** The hostile's signature side weapon, or null for neutral traffic. */
  readonly weapon: string | null;
}

/** One ground-prop contact the run resolved, as the debug surface reports it. */
export interface PropContactDebugState {
  readonly index: number;
  readonly kind: string;
  readonly collision: PropCollision;
  /** True when the contact spent armour through the ordinary damage path. */
  readonly damage: boolean;
}

/** Read-only run view served to Playwright through `window.__deadlane` at `?debug=1`. */
export interface RunDebugState {
  readonly paused: boolean;
  readonly muted: boolean;
  readonly enemies: number;
  readonly civilians: number;
  /**
   * The unrounded scroll cursor in pixels — the exact value `RoadSystem.render` receives.
   *
   * `hud.distance` is metres rounded to a whole metre (25 px), which is right for the HUD
   * and useless for a spec that has to relate two rendered frames to how far the world
   * moved. Read-only, like the rest of this surface.
   */
  readonly worldDistance: number;
  /** The card on screen right now, or null once play has resumed. */
  readonly sectorCard: SectorCardState | null;
  /** The most recent card this run has presented, whether or not it is still up. */
  readonly lastSectorCard: SectorCardState | null;
  /** The most recent scoring event, or null before the first. */
  readonly lastScoreEvent: ScoreEventRecord | null;
  /** Text of the most recent banner, or null before the first. */
  readonly lastBanner: string | null;
  /** The live act boss, or null between encounters. */
  readonly boss: { readonly id: string; readonly hp: number; readonly maxHp: number } | null;
  /** What the run read from the keyboard and the touch pad this frame. */
  readonly input: InputDebugState;
  /** True while the car is off the drivable surface. */
  readonly offRoad: boolean;
  /** The player car as the contact pass sees it. */
  readonly car: VehicleDebugState;
  /** Every other car on the road, in the order the contact pass walks them. */
  readonly vehicles: readonly VehicleDebugState[];
  /** The most recent resolved contact this run, or null before the first. */
  readonly lastContact: ContactDebugState | null;
  /** The most recent ground-prop contact this run, or null before the first. */
  readonly lastPropContact: PropContactDebugState | null;
  /** What the last landing kicked up, or null before the first jump has ended. */
  readonly lastLanding: LandingKind | null;
  /** Which special weapon landed the last kill, or null before one has. */
  readonly lastWeaponKill: WeaponKillKind | null;
  /** The last explosion package played, or null before the first blast. */
  readonly lastFx: FxVariant | null;
  /** Live tyre lines on the road; zero once they have all faded. */
  readonly skidMarks: number;
  /** Quarter turns the aircraft rotors have stepped through this run. */
  readonly rotorTicks: number;
  /**
   * The road cross-section at the car's own `at`, in world pixels.
   *
   * Exposed because the surface width is no longer a constant per level type: a spec that
   * measures the drawn road has to know which width it is looking at, and the width
   * keyframes are what let it jump to the narrow and the wide stretch deliberately.
   */
  readonly road: RoadDebugState;
  readonly hud: HudState;
}

/** The live road geometry, plus the sector's width plan. */
export interface RoadDebugState {
  readonly left: number;
  readonly width: number;
  readonly lanes: number;
  readonly laneWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly keyframes: readonly { readonly at: number; readonly width: number }[];
}

/**
 * The run.
 *
 * World model: everything lives at a monotonically increasing world distance `at`, and the
 * player sits at `distance`. Screen Y is `PLAYER.y + distance - at`, so a single number
 * drives scrolling, spawning and collision without any physics body bookkeeping.
 *
 * That single number is the car's velocity: `speed` is advanced by the motion controller and
 * `distance` by `worldSpeed`, so the road, the traffic, the spawn horizon and the distance
 * score all agree about how fast the world is going.
 *
 * The world is authored in the camera's aperture (`WORLD`), which is larger than the canvas
 * because the camera is zoomed out; anything that used to assume a 640×360 drawing surface
 * now reads `WORLD`.
 */
export class GameScene extends Phaser.Scene {
  private art!: Art;
  private audio!: AudioSystem;
  private road!: RoadSystem;
  private player!: PlayerVehicle;
  private challenges!: ChallengeSystem;

  /** The three player weapons, straight out of `weapons.json`. */
  private readonly gun = getWeapon('gun');
  private readonly oilWeapon = getWeapon('oil');
  private readonly smokeWeapon = getWeapon('smoke');
  private readonly rocketWeapon = getWeapon('rocket');
  private readonly flameWeapon = getWeapon('flame');

  private blueprint!: LevelBlueprint;
  private seed = 0;
  private levelIndex = 1;
  private distance = 0;
  private intensity = 0;
  private score = 0;
  /** Lives left. A run resource of its own; armour is what a hit spends. */
  private lives: number = PLAYER.startLives;
  /** True once `endRun()` has run, so the end-of-run hand-off can never fire twice. */
  private runEnded = false;
  private spawner: SpawnerState = createSpawnerState();
  /**
   * The car's own forward speed, world px/s.
   *
   * Sector-neutral: `worldSpeed` applies the level's multiplier. Everything that moves with
   * the road reads that one number, so a tunnel is faster for the traffic too.
   */
  private speed: number = MOTION.cruiseSpeed;
  /** Play time since the run started, across sectors. Drives the difficulty ramp. */
  private runSeconds = 0;
  private introActive = false;
  private sectorCard: SectorCardState | null = null;
  private lastSectorCard: SectorCardState | null = null;
  private darkness!: Phaser.GameObjects.Graphics;

  private enemies: EnemyVehicle[] = [];
  private civilians: CivilianVehicle[] = [];
  private bullets: Bullet[] = [];
  private hazards: Hazard[] = [];
  private rockets: Rocket[] = [];
  /** Scene-clock time the live flame stream ends, and when its next damage tick is due. */
  private flameUntil = 0;
  private nextFlameTickAt = 0;
  /** Scene-clock time the stream was lit, so the ignition cue is not repeated by tick one. */
  private flameFrom = 0;
  /** The sprites drawn up the flame cone while it burns. */
  private flameSprites: Phaser.GameObjects.Image[] = [];
  private pickups: Pickup[] = [];
  private props: PropInstance[] = [];
  /** Ramps. Kept apart from `props`: a ramp starts a jump rather than a contact. */
  private ramps: RampInstance[] = [];
  /** The ellipse under an airborne car. Hidden on the ground. */
  private shadow!: Phaser.GameObjects.Ellipse;
  /** What the most recent landing kicked up. Observation for the debug surface. */
  private lastLanding: LandingKind | null = null;
  /** Which special weapon landed the most recent kill. Observation for the debug surface. */
  private lastWeaponKill: WeaponKillKind | null = null;
  /** How many ground-prop contacts the run has resolved, and the most recent one. */
  private propContactCount = 0;
  private lastPropContact: PropContactDebugState | null = null;
  /**
   * Scenery outside the shoulder.
   *
   * Deliberately its own list: decor never collides, never blocks a lane and never appears
   * in the enemy, prop or pickup passes, so nothing can accidentally give it physics.
   */
  private decor: { readonly sprite: Phaser.GameObjects.Image; readonly at: number }[] = [];
  /** True while the car's centre is outside the surface. Read by the HUD. */
  private offRoad = false;
  /** Scene-clock time the car first went off the road this spell, or null when it is on it. */
  private offRoadSince: number | null = null;
  /** Scene-clock time the next rough-terrain damage tick is due. */
  private nextOffRoadHitAt = 0;
  /**
   * The act boss, while one is on the road.
   *
   * Deliberately not part of `enemies`: a boss is an encounter, and `clearWorld()` must not
   * sweep it away the way it sweeps chaff. It is destroyed only by losing the fight.
   */
  private boss: BossVehicle | null = null;
  /** Scene-clock time the victory beat ends and the sector transition runs, or null. */
  private victoryAt: number | null = null;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  /** Touch pad state. Fed by pointer events, read by `readInput()` like the keyboard. */
  readonly touchInput = new TouchInput();
  /** True while the pad is on screen, so a field tap on a button is not treated as a shot. */
  private touchPadActive = false;
  private steer = 0;
  private boostHeld = false;
  private brakeHeld = false;
  private fireHeld = false;
  private challengeLabel = '';
  private challengeProgress = 0;
  private challengeTarget = 0;
  private paused = false;
  /** Observation for the debug surface; never read by gameplay. */
  private lastScoreEvent: ScoreEventRecord | null = null;
  private lastBanner: string | null = null;
  /** How many contacts the resolver has finished this run, and the most recent one. */
  private contactCount = 0;
  private lastContact: ContactDebugState | null = null;
  /**
   * The deterministic camera kick's window, and the scroll it returns to.
   *
   * Phaser's own `Camera.shake()` offsets the frame with `Math.random()`, which would make a
   * seeded run irreproducible; the collision hit is written as a decaying sine on the scroll
   * instead, so a replay of the same run shakes identically.
   */
  private shakeFrom = 0;
  private shakeUntil = 0;
  private cameraHome: { readonly x: number; readonly y: number } | null = null;

  /**
   * The decal layer: tyre lines drawn into one graphics object.
   *
   * Marks are world-static and capped (`FX.skidMarkMax`), and the object is cleared and
   * redrawn from the list every frame, so a long drift costs rectangles rather than game
   * objects and the layer can never grow without bound.
   */
  private skidGraphics!: Phaser.GameObjects.Graphics;
  private skidMarks: SkidMark[] = [];
  /** Scene-clock time the last mark and the last drift puff were laid, ms. */
  private lastSkidAt = Number.NEGATIVE_INFINITY;
  private lastDriftSmokeAt = Number.NEGATIVE_INFINITY;
  /** Rotors drawn over every aircraft on the road. */
  private rotors: Rotor[] = [];
  /** Quarter turns the rotors have stepped, and explosions the table has played. */
  private rotorTicks = 0;
  private fxCount = 0;
  /** The last explosion package played. Observation for the debug surface. */
  private lastFx: FxVariant | null = null;

  constructor() {
    super('Game');
  }

  init(data: { levelIndex?: number }): void {
    this.levelIndex = data.levelIndex ?? 1;
    this.seed = seedFromLocation(window.location.search, () => Date.now() % 0x7fffffff);
    this.distance = 0;
    this.intensity = 0;
    this.score = 0;
    this.lives = PLAYER.startLives;
    this.runEnded = false;
    this.spawner = createSpawnerState();
    this.runSeconds = 0;
    this.introActive = false;
    this.sectorCard = null;
    this.lastSectorCard = null;
    this.enemies = [];
    this.civilians = [];
    this.bullets = [];
    this.hazards = [];
    this.rockets = [];
    this.flameUntil = 0;
    this.flameFrom = 0;
    this.nextFlameTickAt = 0;
    this.flameSprites = [];
    this.pickups = [];
    this.props = [];
    this.ramps = [];
    this.decor = [];
    this.offRoad = false;
    this.offRoadSince = null;
    this.nextOffRoadHitAt = 0;
    this.boss = null;
    this.victoryAt = null;
    this.paused = false;
    this.speed = MOTION.cruiseSpeed;
    this.steer = 0;
    this.boostHeld = false;
    this.brakeHeld = false;
    this.fireHeld = false;
    this.touchPadActive = false;
    this.touchInput.reset();
    this.lastScoreEvent = null;
    this.lastBanner = null;
    this.contactCount = 0;
    this.lastContact = null;
    this.lastLanding = null;
    this.lastWeaponKill = null;
    this.propContactCount = 0;
    this.lastPropContact = null;
    this.shakeFrom = 0;
    this.shakeUntil = 0;
    this.cameraHome = null;
    this.skidMarks = [];
    this.lastSkidAt = Number.NEGATIVE_INFINITY;
    this.lastDriftSmokeAt = Number.NEGATIVE_INFINITY;
    this.rotors = [];
    this.rotorTicks = 0;
    this.fxCount = 0;
    this.lastFx = null;
  }

  create(): void {
    this.art = new Art(this);
    this.audio = acquireAudio(this.registry);

    this.blueprint = levelForSeed(this.seed, this.levelIndex);

    this.road = new RoadSystem(this, this.blueprint.road, this.blueprint.type, this.art);
    this.player = new PlayerVehicle(this, this.art);
    // The height cue: a flat ellipse on the road under an airborne car. Owned by the scene
    // rather than the vehicle, so the car entity never has to build Phaser objects.
    this.shadow = this.add
      .ellipse(
        WORLD.width / 2,
        PLAYER.y + JUMP.shadowOffsetY,
        JUMP.shadowWidth,
        JUMP.shadowHeight,
        PALETTE.void,
        0.4,
      )
      .setDepth(40)
      .setVisible(false);

    // The decal layer sits just above the road and under every prop. One object, redrawn
    // from the capped mark list each frame.
    this.skidGraphics = this.add.graphics().setDepth(14);

    this.challenges = this.createChallengeSystem();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,SPACE,SHIFT,X,Z,C') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    // Darkness for the run, drawn above the world but below this scene's cards and banners.
    this.darkness = this.add.graphics().setDepth(90);
    this.applyVisibility();

    const onIntroDone = (): void => {
      this.introActive = false;
      this.sectorCard = null;
    };
    this.events.on(SECTOR_INTRO_DONE_EVENT, onIntroDone);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(SECTOR_INTRO_DONE_EVENT, onIntroDone);
      // Without this the engine oscillator holds its last gain through game over and the
      // title screen, and the next run would stack a second voice on top of it.
      disposeAudio(this.registry);
    });

    // A context built outside a gesture starts suspended, so the first key press resumes
    // it, the same way the first tap does.
    this.input.keyboard?.once('keydown', () => this.audio.unlock());

    // Esc is owned by the HUD, which keeps running while this scene is paused.
    this.scene.launch('Hud', { game: this });

    // A click on the play field fires, on the same path as the Space key; a drag steers,
    // and the touch pad's buttons set the same input state the keys do.
    this.installPointerControls();

    this.cameras.main.setBackgroundColor(GAME.background);
    // The world camera is the only zoomed one: the HUD and the touch pad live in their own
    // scene, so their pixels never scale and a pad button is always where it is drawn.
    this.cameras.main.setZoom(CAMERA.zoom);
    this.cameras.main.centerOn(WORLD.width / 2, WORLD.height / 2);
    this.cameras.main.fadeIn(300, 0, 0, 0);

    this.presentSector();
  }

  /* ------------------------------- public API ------------------------------ */

  /** Pure pull: challenge windows are advanced by `updateChallenge()`, never by a read. */
  get hudState(): HudState {
    return {
      score: Math.max(0, Math.round(this.score)),
      armor: this.player?.armor ?? 0,
      maxArmor: PLAYER.maxArmor,
      lives: this.lives,
      maxLives: PLAYER.maxLives,
      oil: this.player?.oil ?? 0,
      smoke: this.player?.smoke ?? 0,
      rockets: this.player?.rockets ?? 0,
      flame: this.player?.flame ?? 0,
      speed: Math.round(this.worldSpeed),
      distance: Math.round(this.distance * LEVEL.metresPerPixel),
      level: this.levelIndex,
      levelLabel: this.blueprint ? levelLabelFor(this.blueprint.type) : '',
      challenge: this.challengeLabel,
      challengeProgress: this.challengeProgress,
      challengeTarget: this.challengeTarget,
      muted: this.audio?.isMuted ?? false,
      offRoad: this.offRoad,
      boss: this.boss
        ? { label: this.boss.def.label, hp: Math.max(0, this.boss.hp), maxHp: this.boss.maxHp }
        : null,
    };
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Read-only snapshot for the debug surface. Must never mutate gameplay. */
  get debugState(): RunDebugState {
    return {
      paused: this.paused,
      muted: this.audio?.isMuted ?? false,
      enemies: this.enemies.length,
      civilians: this.civilians.length,
      worldDistance: this.distance,
      sectorCard: this.sectorCard,
      lastSectorCard: this.lastSectorCard,
      lastScoreEvent: this.lastScoreEvent,
      lastBanner: this.lastBanner,
      boss: this.boss
        ? { id: this.boss.def.id, hp: Math.max(0, this.boss.hp), maxHp: this.boss.maxHp }
        : null,
      input: {
        steer: this.steer,
        boost: this.boostHeld,
        brake: this.brakeHeld,
        fire: this.fireHeld,
      },
      offRoad: this.offRoad,
      car: {
        kind: 'player',
        id: 'player',
        x: this.player.x,
        y: this.player.y,
        halfWidth: this.player.halfWidth,
        halfHeight: this.player.halfHeight,
        vx: this.player.vx,
        vy: this.player.vy,
        hp: this.player.armor,
        steerLocked: this.player.isSteerLocked,
        wrecked: this.player.isDestroyed,
        airborne: this.player.isAirborne,
        spinning: false,
      },
      vehicles: [
        ...this.enemies.map((enemy) => ({
          kind: 'enemy' as const,
          id: enemy.def.id,
          x: enemy.sprite.x,
          y: enemy.sprite.y,
          halfWidth: enemy.halfWidth,
          halfHeight: enemy.halfHeight,
          vx: enemy.vx,
          vy: enemy.vy,
          hp: enemy.hp,
          steerLocked: false,
          wrecked: false,
          airborne: false,
          spinning: enemy.isSpinning,
        })),
        ...this.civilians.map((civilian) => ({
          kind: 'civilian' as const,
          id: civilian.def.id,
          x: civilian.sprite.x,
          y: civilian.sprite.y,
          halfWidth: civilian.halfWidth,
          halfHeight: civilian.halfHeight,
          vx: civilian.vx,
          vy: civilian.vy,
          hp: civilian.hp,
          steerLocked: false,
          wrecked: civilian.wrecked,
          airborne: false,
          spinning: false,
        })),
      ],
      lastContact: this.lastContact,
      lastPropContact: this.lastPropContact,
      lastLanding: this.lastLanding,
      lastWeaponKill: this.lastWeaponKill,
      lastFx: this.lastFx,
      skidMarks: this.skidMarks.length,
      rotorTicks: this.rotorTicks,
      road: this.roadDebugState(),
      hud: this.hudState,
    };
  }

  /** The live road geometry and the width plan behind it. Observation only. */
  private roadDebugState(): RoadDebugState {
    const profile = roadAt(this.blueprint.road, this.distance);
    return {
      left: profile.left,
      width: profile.width,
      lanes: profile.lanes,
      laneWidth: profile.laneWidth,
      minWidth: this.blueprint.road.minWidth,
      maxWidth: this.blueprint.road.maxWidth,
      keyframes: this.blueprint.road.keyframes.map((key) => ({ at: key.at, width: key.width })),
    };
  }

  /**
   * Debug-only: clear the firing line and stage one civilian in it.
   *
   * Playwright reaches this through `window.__deadlaneControl` at `?debug=1`, so the
   * bullet-versus-civilian rule is exercised on the real collision path. Nothing in the
   * run calls it, and the civilian is pinned to the car's own x so a shot cannot miss.
   */
  debugStageCivilianAhead(): void {
    for (const enemy of this.enemies) enemy.destroy();
    this.enemies = [];
    for (const civilian of this.civilians) civilian.destroy();
    this.civilians = [];
    for (const bullet of this.bullets) {
      if (bullet.from !== 'enemy') continue;
      bullet.sprite.destroy();
      bullet.at = Number.NEGATIVE_INFINITY;
    }
    this.bullets = this.bullets.filter((bullet) => bullet.from === 'player');

    const civilian = new CivilianVehicle(
      this,
      this.art,
      getCivilian('sedan'),
      this.distance + 60,
      0,
      roadAt(this.blueprint.road, this.distance),
      MOTION.cruiseSpeed * 0.3,
    );
    // Pin it into the gun line: the car follows the lane centre as the road changes width,
    // so the offset has to be held by the vehicle, not by one assignment to `x`.
    civilian.pinTo(this.player.x, roadAt(this.blueprint.road, civilian.at));
    civilian.sprite.y = PLAYER.y + this.distance - civilian.at;
    this.civilians.push(civilian);
  }

  /**
   * Debug-only: move the run forward by `pixels` of world distance.
   *
   * A sector is 24 000 px and the base scroll is 220 px/s, so waiting out a boundary in
   * real time would make the E2E spec an 80-second test. This moves only the same
   * `distance` cursor `update()` moves, so the sector change, the spawner horizon and the
   * challenge windows all resolve normally on the next frame. Playwright reaches it through
   * `window.__deadlaneControl` at `?debug=1`; nothing in the run calls it.
   */
  debugFastForward(pixels: number): void {
    if (!Number.isFinite(pixels) || pixels <= 0) return;
    this.distance += pixels;
  }

  /**
   * Debug-only: stage a hostile on the car's flank, already overlapping it.
   *
   * The point is the contact pass, so the road is cleared first and the staged car is placed
   * on the car's own screen station, one `COLLISION.stageOverlap` deep. It holds its lane,
   * which means nothing of its own steering can be mistaken for the impulse the resolver
   * gives it — the only motion after the call is the resolver's.
   *
   * `approachSpeed` is the closing speed the staged car is given toward the player, px/s.
   * Zero stages a sideswipe; a value at or above `COLLISION.hardImpactSpeed` stages a hard
   * hit. Playwright reaches this through `window.__deadlaneControl` at `?debug=1`; nothing in
   * the run calls it.
   */
  debugStageCollision(approachSpeed = 0): void {
    if (!this.player || this.paused || this.introActive || this.runEnded) return;

    for (const enemy of this.enemies) enemy.destroy();
    this.enemies = [];
    for (const civilian of this.civilians) civilian.destroy();
    this.civilians = [];
    for (const bullet of this.bullets) {
      if (bullet.from !== 'enemy') continue;
      bullet.sprite.destroy();
      bullet.at = Number.NEGATIVE_INFINITY;
    }
    this.bullets = this.bullets.filter((bullet) => Number.isFinite(bullet.at));

    // `hauler` holds its lane: a weaving hostile would drag the staged car out of the
    // contact before the resolver ever saw it.
    const def = safeEnemy('hauler');
    if (!def) return;

    const road = roadAt(this.blueprint.road, this.distance);
    const hostile = new EnemyVehicle(this, this.art, def, this.distance, 0, road, 0);
    const x =
      this.player.x + this.player.halfWidth + hostile.halfWidth - COLLISION.stageOverlap;
    hostile.pinTo(x, this.distance, this.distance, road);
    if (Number.isFinite(approachSpeed) && approachSpeed > 0) {
      // Placed on the right, so closing on the car means moving left.
      hostile.applyImpulse(-approachSpeed, 0);
    }
    this.enemies.push(hostile);
  }

  /**
   * Debug-only: stage one solid barrier in the car's lane, just ahead of it.
   *
   * Proves the solid prop path on the real collision code: the barrier must part the car
   * and spend armour, not be driven through. Playwright reaches this through
   * `window.__deadlaneControl` at `?debug=1`; nothing in the run calls it.
   */
  debugStageBarrier(): void {
    if (!this.player || this.paused || this.introActive || this.runEnded) return;
    this.clearStagedGround();
    this.stageGroundProp('barrier', this.distance + 80);
  }

  /**
   * Debug-only: stage a ramp with a solid barrier beyond it, both in the car's lane.
   *
   * The car takes the ramp, goes airborne, clears the barrier and lands with a dust puff —
   * the jump contract end to end. Playwright reaches this through `window.__deadlaneControl`
   * at `?debug=1`; nothing in the run calls it.
   */
  debugStageRampBarrier(): void {
    if (!this.player || this.paused || this.introActive || this.runEnded) return;
    this.clearStagedGround();

    // Ramp first, barrier far enough past it that take-off has happened, close enough that
    // a cruise-speed jump is still airborne when the barrier arrives.
    this.stageGroundRamp(this.distance + 140);
    this.stageGroundProp('barrier', this.distance + 260);
  }

  /** Clear everything that could touch the car, then drop the staged ground props. */
  private clearStagedGround(): void {
    for (const enemy of this.enemies) enemy.destroy();
    this.enemies = [];
    for (const civilian of this.civilians) civilian.destroy();
    this.civilians = [];
    for (const bullet of this.bullets) {
      if (bullet.from !== 'enemy') continue;
      bullet.sprite.destroy();
      bullet.at = Number.NEGATIVE_INFINITY;
    }
    this.bullets = this.bullets.filter((bullet) => Number.isFinite(bullet.at));
    for (const rocket of this.rockets) rocket.sprite.destroy();
    this.rockets = [];
    this.stopFlame();
    for (const hazard of this.hazards) hazard.sprite.destroy();
    this.hazards = [];
    for (const prop of this.props) prop.sprite.destroy();
    this.props = [];
    for (const ramp of this.ramps) ramp.sprite.destroy();
    this.ramps = [];
  }

  /**
   * Debug-only: stage a pursuer just short of a freshly laid slick.
   *
   * The hostile holds the car's lane and is placed a little behind the drop point, so the
   * next few frames are a real world-space crossing: the slick spins it, the slick is
   * spent, and the car is still on the road. Playwright reaches this through
   * `window.__deadlaneControl` at `?debug=1`; nothing in the run calls it.
   */
  debugStageOilPursuer(): void {
    if (!this.player || this.paused || this.introActive || this.runEnded) return;
    this.clearStagedGround();

    this.stageHostile(this.distance + WEAPON_FX.oilDropAhead - 60);
    if (this.player.oil <= 0) this.player.addOil(1);
    this.dropOil(this.time.now);
  }

  /**
   * Debug-only: put a pursuer in the rocket's path and launch one.
   *
   * Proves the whole rocket path on the shipped code: launch, flight, detonation and the
   * blast that takes the target out. Playwright reaches this through
   * `window.__deadlaneControl` at `?debug=1`; nothing in the run calls it.
   */
  debugStageRocketTarget(): void {
    if (!this.player || this.paused || this.introActive || this.runEnded) return;
    this.clearStagedGround();

    this.stageHostile(this.distance + 180);
    if (this.player.rockets <= 0) this.player.addRockets(1);
    this.fireRocket(this.time.now);
  }

  /**
   * Debug-only: put a pursuer inside the flame cone and pull the trigger.
   *
   * The target is close enough that it stays in the cone long enough for the burn ticks to
   * finish it, which is what makes the flamethrower's short range part of the proof.
   * Playwright reaches this through `window.__deadlaneControl` at `?debug=1`; nothing in
   * the run calls it.
   */
  debugStageFlameTarget(): void {
    if (!this.player || this.paused || this.introActive || this.runEnded) return;
    this.clearStagedGround();

    this.stageHostile(this.distance + 100);
    if (this.player.flame <= 0) this.player.addFlame(1);
    this.fireFlame(this.time.now);
  }

  /**
   * Put one lane-holding hostile at `at`, pinned to the car's own lateral position.
   *
   * Pinned on x so the staged car is exactly where the test's weapon geometry expects it,
   * whatever lane the player happens to be in.
   */
  private stageHostile(at: number): void {
    // `gunboat` holds its lane and is light enough for one rocket (4 damage) or one flame
    // burst (six ticks of 1) to finish, which is what the special-weapon stages prove.
    const def = safeEnemy('gunboat');
    if (!def) return;
    this.stageEnemyAt(def, at);
  }

  /** Build one hostile of `def` at `at`, pinned to the car's lateral position. */
  private stageEnemyAt(def: EnemyDef, at: number): void {
    const road = roadAt(this.blueprint.road, this.distance);
    const hostile = new EnemyVehicle(this, this.art, def, at, 0, road, 0);
    hostile.pinTo(this.player.x, at, this.distance, road);
    this.enemies.push(hostile);
  }

  /**
   * Debug-only: clear the road and stage a single hostile of `id` in the gun line.
   *
   * The durability contract — one volley cannot kill an ordinary enemy — is proved against
   * this stage on the shipped collision path. Playwright reaches it through
   * `window.__deadlaneControl` at `?debug=1`; nothing in the run calls it.
   */
  debugStageEnemy(id = 'turret'): void {
    if (!this.player || this.paused || this.introActive || this.runEnded) return;
    const def = safeEnemy(id);
    if (!def) return;
    this.clearStagedGround();
    this.stageEnemyAt(def, this.distance + 180);
  }

  /** The lane index the car is standing in right now. */
  private laneUnderCar(): number {
    const road = roadAt(this.blueprint.road, this.distance);
    const lane = Math.floor((this.player.x - road.left) / road.laneWidth);
    return Math.max(0, Math.min(road.lanes - 1, lane));
  }

  private stageGroundProp(kind: string, at: number): void {
    const def = safeProp(kind);
    this.props.push({
      sprite: this.art
        .imageFrom(propArtIds(kind), 0, -60, () => propTexture(this, kind, 'rust'))
        .setDepth(20),
      at,
      lane: this.laneUnderCar(),
      kind,
      collision: def.collision,
      halfWidth: def.halfWidth,
      halfHeight: def.halfHeight,
    });
  }

  private stageGroundRamp(at: number): void {
    this.ramps.push({
      sprite: this.art
        .imageFrom(rampArtIds(), 0, -60, () => propTexture(this, 'ramp', 'amber'))
        .setDepth(19),
      at,
      lane: this.laneUnderCar(),
    });
  }

  /**
   * Debug-only: spend one life through the real wreck path.
   *
   * The car is put on its last armour point with the i-frame window dropped, then
   * `damagePlayer()` runs exactly as an incoming shell would: armour to zero, one life
   * spent, either a respawn or the end of the run. Playwright reaches it through
   * `window.__deadlaneControl` at `?debug=1`; nothing in the run calls it. Refused while the
   * sector card is up, because the HUD that owns the snapshot is not what is being tested
   * there, and once the run has ended, because no life is left to spend.
   */
  debugLoseLife(): void {
    if (!this.player || this.paused || this.introActive || this.runEnded) return;
    this.player.debugArmLastHit();
    this.damagePlayer(this.time.now);
  }

  /**
   * Debug-only: end the run by destroying the player.
   *
   * Now that a wreck costs a life before it ends anything, ending the run means losing the
   * last one; the spec that proves the result screen spends all three through `debugLoseLife()`.
   * Kept as an alias so a stale spec still hits a real path instead of a no-op.
   */
  debugDestroyPlayer(): void {
    this.debugLoseLife();
  }

  /**
   * Debug-only: kill the live boss through the normal damage path.
   *
   * Playwright reaches this through `window.__deadlaneControl` at `?debug=1`, so the
   * defeat, the reward and the victory beat all run for real instead of a spec spending
   * sixty seconds shooting. Nothing in the run calls it.
   */
  debugDestroyBoss(): void {
    const boss = this.boss;
    if (!boss || this.paused || this.introActive) return;
    if (boss.hit(boss.hp)) this.defeatBoss(this.time.now);
  }

  /**
   * Report whether the touch pad is on screen.
   *
   * The HUD owns that decision (it is the scene that knows about the pointer type and the
   * first touch), but the hit test has to happen here, where a field tap is turned into a
   * shot instead of a button.
   */
  setTouchPadActive(active: boolean): void {
    this.touchPadActive = active;
  }

  /**
   * Pause/resume the run.
   *
   * Phaser refuses keyboard input to a scene that is not RUNNING, so the pause key lives in
   * the HUD; this scene only owns the state and the scene lifecycle.
   */
  togglePause(): void {
    // The world is already frozen behind the sector card; pausing it would only hide it.
    if (this.introActive) return;
    if (this.paused) this.resumeRun();
    else this.pauseRun();
  }

  pauseRun(): void {
    if (this.paused) return;
    this.paused = true;
    // A frozen scene stops receiving pointer events, so any finger still held on a pad
    // button would otherwise resume as a stuck control.
    this.touchInput.reset();
    this.events.emit(RUN_PAUSED_EVENT, true);
    this.scene.pause();
  }

  resumeRun(): void {
    if (!this.paused) return;
    this.paused = false;
    this.scene.resume();
    this.events.emit(RUN_PAUSED_EVENT, false);
  }

  /* --------------------------------- update -------------------------------- */

  override update(time: number, delta: number): void {
    if (this.paused || this.introActive || !this.player) return;

    const dt = Math.min(delta, 50) / 1000;

    this.runSeconds += dt;
    this.readInput(time);
    this.intensity = this.computeIntensity(dt);

    // One velocity for the whole frame: the pedals move it, and the road, the traffic, the
    // engine note, the spawn horizon and the distance score all advance off it.
    this.speed = stepSpeed(
      this.speed,
      { throttle: this.boostHeld, brake: this.brakeHeld },
      dt,
      this.cruiseSpeed,
    );
    // Rough ground: the car is held to a share of its own cruise while it is off the paint,
    // so leaving the road costs time before it costs armour.
    if (this.offRoad) this.speed = Math.min(this.speed, this.cruiseSpeed * OFFROAD.speedFactor);

    const speed = this.worldSpeed;
    this.distance += speed * dt;

    const road = roadAt(this.blueprint.road, this.distance);
    const landed = this.player.update(dt, this.steer, time, road);
    if (landed) this.handleLanding();
    this.updateShadow();
    // Rough ground is a ground rule: an airborne car is not on it.
    if (!this.player.isAirborne) this.updateOffRoad(time, road);
    this.road.render(this.distance);
    this.audio.updateEngine(speedRatio(this.speed));

    this.spawnFromBlueprint();
    this.updateEnemies(dt, time);
    this.updateBoss(dt, time);
    this.updateCivilians(dt);
    this.updateBullets(dt);
    this.updateRockets(dt, time);
    this.updateFlame(time);
    this.updateHazards(time);
    this.updatePickups(dt);
    this.updateProps();
    this.updateDecor();
    this.updateSkids(time);
    this.updateRotors(time);

    this.resolveCollisions(time);
    this.updateChallenge();
    // The sector transition is owned by the boss now: while one is alive the run holds,
    // and only a destroyed boss releases the boundary.
    this.updateActBoundary(time);

    // Last, so a kick taken this frame is the offset that is drawn this frame.
    this.updateCameraKick(time);

    this.score += dt * (speed / SCORE.distancePerPoint) * 0.15;
  }

  /* --------------------------------- input --------------------------------- */

  /**
   * Route pointer input into the same state the keyboard sets.
   *
   * Points that land on a pad button travel through `TouchInput`, one owning pointer per
   * button and at most one owner for the steer drag, so a thumb holding the trigger cannot
   * take the car away from the thumb steering it. Pause is the exception: it is handled by
   * the HUD, which keeps running while this scene is frozen.
   *
   * A mouse click on the play field still fires, on the same path as Space: desktop has no
   * pad to press. A touch drag only steers, because firing on every touch would make the
   * pad's own trigger pointless.
   */
  private installPointerControls(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.audio.unlock();
      if (this.introActive || this.paused) return;

      // The pad is drawn by the HUD at 1:1, so a hit test happens in screen space; the steer
      // drag is a world gesture and converts, because the world camera is zoomed.
      const button = this.touchPadActive ? buttonAt(pointer.x, pointer.y) : null;
      if (button) {
        // Pause belongs to the HUD: it must work while this scene cannot see input at all.
        if (button.action !== 'pause') {
          this.touchInput.press(pointer.id, button, this.time.now);
        }
        return;
      }

      this.touchInput.beginSteer(pointer.id, pointer.worldX);
      if (!pointer.wasTouch) this.fireGun();
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.touchInput.move(pointer.id, pointer.worldX);
    });

    const release = (pointer: Phaser.Input.Pointer): void => this.touchInput.release(pointer.id);
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
  }

  private readInput(time: number): void {
    let steer = 0;
    if (this.cursors.left?.isDown || this.keys['A']?.isDown) steer -= 1;
    if (this.cursors.right?.isDown || this.keys['D']?.isDown) steer += 1;
    // A drag steers toward a world point, and the deadzone is authored in screen pixels.
    steer += this.touchInput.steerFor(this.player.x, TOUCH.steerDeadzone * WORLD.scale);

    this.steer = Math.max(-1, Math.min(1, steer));
    this.boostHeld = Boolean(
      this.cursors.up?.isDown || this.keys['W']?.isDown || this.touchInput.isHeld('boost'),
    );
    this.brakeHeld = Boolean(
      this.cursors.down?.isDown || this.keys['S']?.isDown || this.touchInput.isHeld('brake'),
    );

    this.fireHeld = Boolean(this.keys['SPACE']?.isDown || this.touchInput.isHeld('fire'));
    if (this.fireHeld) {
      this.fireGun(time);
    }

    const smokeKey = this.keys['SHIFT'];
    if ((smokeKey && Phaser.Input.Keyboard.JustDown(smokeKey)) || this.touchInput.takeTap('smoke')) {
      this.dropSmoke(time);
    }

    const oilKey = this.keys['X'];
    if ((oilKey && Phaser.Input.Keyboard.JustDown(oilKey)) || this.touchInput.takeTap('oil')) {
      this.dropOil(time);
    }

    const rocketKey = this.keys['Z'];
    if (
      (rocketKey && Phaser.Input.Keyboard.JustDown(rocketKey)) ||
      this.touchInput.takeTap('rocket')
    ) {
      this.fireRocket(time);
    }

    const flameKey = this.keys['C'];
    if (
      (flameKey && Phaser.Input.Keyboard.JustDown(flameKey)) ||
      this.touchInput.takeTap('flame')
    ) {
      this.fireFlame(time);
    }
  }

  /**
   * World px/s this frame.
   *
   * The car's own speed scaled by the sector's personality: a tunnel is quick and
   * claustrophobic, the delta is slow. Everything that scrolls reads this, and nothing else.
   */
  private get worldSpeed(): number {
    return this.speed * (this.blueprint?.scrollMultiplier ?? 1);
  }

  /** The speed the car eases back to with no pedal, which the difficulty ramp raises. */
  private get cruiseSpeed(): number {
    return MOTION.cruiseSpeed + MOTION.cruiseBonus * this.intensity;
  }

  private computeIntensity(dt: number): number {
    // Full intensity after `rampSeconds` of play, with a per-sector floor so a late sector
    // never opens as gently as the first one.
    const ramp = Math.min(1, this.runSeconds / DIFFICULTY.rampSeconds);
    const target = Math.min(1, ramp * 0.8 + (this.levelIndex - 1) * 0.1);
    return this.intensity + (target - this.intensity) * Math.min(1, dt / DIFFICULTY.smoothing / 1000 + dt * 0.4);
  }

  /* -------------------------------- spawning ------------------------------- */

  private spawnFromBlueprint(): void {
    const due = takeDueEvents(this.spawner, this.blueprint.events, {
      horizon: this.distance + WORLD.height + 120,
      behind: this.distance,
    });

    for (const event of due) this.spawnEvent(event);
  }

  private spawnEvent(event: LevelEvent): void {
    const shape = this.blueprint.road;
    const road = roadAt(shape, event.at);

    switch (event.kind) {
      case 'enemy': {
        if (this.enemies.length >= SPAWN.maxEnemiesOnScreen) return;
        const def = safeEnemy(event.enemy);
        if (!def) return;
        this.enemies.push(
          new EnemyVehicle(this, this.art, def, event.at, event.lane, road, event.at * 0.01),
        );
        break;
      }
      case 'traffic': {
        if (this.civilians.length >= SPAWN.maxTrafficOnScreen) return;
        const def = getCivilian(safeCivilianId(event.vehicle));
        this.civilians.push(
          new CivilianVehicle(this, this.art, def, event.at, event.lane, road, event.speed),
        );
        break;
      }
      case 'pickup': {
        // The generated cell wins; the diamond is only drawn when the sheet has no frame
        // for this kind, so a failed art slot never blocks a run.
        const sprite = this.art
          .imageFrom(pickupArtIds(event.pickup), laneCenter(road, event.lane), -60, () =>
            pickupTexture(this, event.pickup, pickupColor(event.pickup)),
          )
          .setDepth(25);
        this.pickups.push({ sprite, at: event.at, x: sprite.x, kind: event.pickup });
        break;
      }
      case 'prop': {
        // The generated cell wins; the cone is only drawn when neither prop sheet has a
        // frame for this id, so a failed art slot never blocks a run.
        const def = safeProp(event.prop);
        const sprite = this.art
          .imageFrom(propArtIds(event.prop), laneCenter(road, event.lane), -60, () =>
            propTexture(this, event.prop, 'rust'),
          )
          .setDepth(20);
        this.props.push({
          sprite,
          at: event.at,
          lane: event.lane,
          kind: event.prop,
          collision: def.collision,
          halfWidth: def.halfWidth,
          halfHeight: def.halfHeight,
        });
        break;
      }
      case 'ramp': {
        // The shipped art-09 ramp cell; the procedural triangle is the fallback, so a
        // missing frame still draws something the player can read as a ramp.
        const sprite = this.art
          .imageFrom(rampArtIds(), laneCenter(road, event.lane), -60, () =>
            propTexture(this, 'ramp', 'amber'),
          )
          .setDepth(19);
        this.ramps.push({ sprite, at: event.at, lane: event.lane });
        break;
      }
      case 'decor': {
        // Scenery stands outside the surface edge at its own `at`, so it follows the road as
        // the road widens. The variant is picked from the prop's own position rather than
        // from a runtime RNG: a seeded run stays reproducible and a prop cannot flicker
        // between two cells while it scrolls.
        const sprite = this.art
          .imageFrom(
            pickSceneryVariant(sceneryArtIds(event.surface, event.prop), event.at),
            decorX(shape, event.at, event.side, event.offset),
            PLAYER.y + this.distance - event.at,
            () => propTexture(this, event.prop, 'olive'),
          )
          .setDepth(12);
        this.decor.push({ sprite, at: event.at });
        break;
      }
      default:
        break;
    }
  }

  /* ------------------------------- entities -------------------------------- */

  private updateEnemies(dt: number, time: number): void {
    const ctx = {
      now: time,
      dt,
      distance: this.distance,
      playerX: this.player.x,
    };

    for (const enemy of this.enemies) {
      // The hostile is drawn, clamped and steered against the cross-section at its own `at`,
      // not the one the car is on: the road changes width under both of them.
      const wantsToFire = enemy.update(ctx, roadAt(this.blueprint.road, enemy.at));
      // `hostiles behind the cloud stop firing` — the cloud eats the shot, not the turn.
      if (wantsToFire && !this.isBlindedBySmoke(enemy)) this.enemyFire(enemy);
    }

    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.isOffscreen(this.distance)) {
        enemy.destroy();
        return false;
      }
      return true;
    });
  }

  /* ---------------------------------- boss --------------------------------- */

  private updateBoss(dt: number, time: number): void {
    const boss = this.boss;
    if (!boss) return;

    const action = boss.update(
      {
        now: time,
        dt,
        distance: this.distance,
        playerX: this.player.x,
      },
      roadAt(this.blueprint.road, this.distance),
    );

    if (action?.kind === 'telegraph') this.audio.play(bossCue('bossTelegraph'));
    if (action?.kind === 'fire') this.bossFire(boss, action.pattern);
  }

  /** Spawn the machine that closes this act. Called once, when the sector runs out. */
  private spawnBoss(time: number): void {
    // One sector is one act: the level type picks the machine and the sector number is the
    // act index that unlocks the higher-act variants in the content table.
    const act = this.levelIndex;
    const def = bossForLevel(this.blueprint.type, act);
    this.boss = new BossVehicle(
      this,
      this.art,
      def,
      this.distance,
      roadAt(this.blueprint.road, this.distance),
      time,
    );
    this.showBanner(`ACT ${act} · ${def.label}`);
  }

  private bossFire(boss: BossVehicle, pattern: BossAttackPattern): void {
    // Boss shells reuse the hostile-shell path, so one `returnShot` still decides the lead
    // and the existing enemy-bullet collision still does the damage. The pattern's shape
    // decides where each shell is laid: `bossVolley()` is the only place that differs.
    const key = flatTexture(this, 'boss-bullet', 'amber', 9);
    const road = roadAt(this.blueprint.road, this.distance);
    const shots = bossVolley(pattern, {
      bossX: boss.sprite.x,
      roadLeft: road.left,
      roadWidth: road.width,
      playerX: this.player.x,
    });

    for (const shot of shots) {
      const sprite = this.add.image(shot.x, boss.sprite.y, key).setDepth(45);
      this.bullets.push({
        sprite,
        ...returnShot({
          enemyX: shot.x,
          enemyY: boss.sprite.y,
          // A wall or a mine travels straight down its own lane; an aimed shell leads the
          // car. Passing the shell's own x as the target is what makes that distinction.
          playerX: shot.aimAtPlayer ? this.player.x : shot.x,
          playerY: this.player.y,
          distance: this.distance,
          scroll: this.worldSpeed,
          projectileSpeed: pattern.projectileSpeed * shot.speedScale,
          maxDrift: WEAPON_FX.maxShotDrift,
        }),
        from: 'enemy',
        damage: BOSS.shotDamage,
      });
    }

    this.audio.play(bossCue(pattern.cue));
    // One arc on the boss for the whole volley, so a wall of shells has a single source.
    this.spawnArc(boss.sprite.x, boss.sprite.y);
  }

  private defeatBoss(time: number): void {
    const boss = this.boss;
    if (!boss) return;

    const { x, y } = boss.sprite;
    const reward = boss.def.reward;
    boss.destroy();
    this.boss = null;

    this.score += reward;
    this.lastScoreEvent = { kind: 'bossDestroyed', delta: reward };
    this.challenges.notifyKill();
    this.audio.play('explosion');
    this.cameras.main.shake(320, 0.014);

    // The act-ending blast: every layer of the explosion table at once, at boss scale. It
    // is deliberately not one of the four ordinary packages, so a kill and a boss going up
    // are different events on screen, not just different sizes.
    this.playExplosion(x, y, 'boss');

    this.showBanner(`ACT ${this.levelIndex} CLEARED · +${reward}`);
    // The victory beat: the road keeps running for a moment, then the next act's card.
    this.victoryAt = time + LEVEL.bossVictoryMs;
  }

  /**
   * The act boundary.
   *
   * Past the end of the blueprint the run does not advance — it spawns the boss. The
   * transition waits until the boss is down, then the ordinary `advanceLevel()` runs
   * unchanged. World distance keeps growing during the fight, and the boss holds station in
   * screen space, so nothing it owns goes stale as the distance climbs.
   */
  private updateActBoundary(time: number): void {
    if (this.player.isDestroyed) return;

    if (this.victoryAt !== null) {
      if (time < this.victoryAt) return;
      this.victoryAt = null;
      this.advanceLevel();
      return;
    }

    if (this.distance <= this.blueprint.length) return;
    if (this.boss) return;
    this.spawnBoss(time);
  }

  private updateCivilians(dt: number): void {
    for (const civilian of this.civilians) {
      civilian.update(dt, this.distance, roadAt(this.blueprint.road, civilian.at));
    }
    this.civilians = this.civilians.filter((c) => {
      if (c.isOffscreen(this.distance)) {
        c.destroy();
        return false;
      }
      return true;
    });
  }

  private updateBullets(dt: number): void {
    for (const bullet of this.bullets) {
      bullet.at += bullet.speed * dt;
      bullet.sprite.x += bullet.driftX * dt;
      bullet.sprite.y = screenYFromWorldAt(bullet.at, this.distance);
    }
    this.bullets = this.bullets.filter((bullet) => {
      const visible = bullet.sprite.y > -40 && bullet.sprite.y < WORLD.height + 40;
      if (!visible) bullet.sprite.destroy();
      return visible;
    });
  }

  /**
   * Scroll the dropped hazards.
   *
   * A hazard is world-static: `at` was fixed where it was laid and is never re-derived, so
   * the car drives away from it. Only the screen projection moves. This is what lets a
   * pursuer cross a slick the player has already left, and what stops a cloud glued to the
   * bumper from shielding the car it is attached to.
   */
  private updateHazards(time: number): void {
    for (const hazard of this.hazards) {
      hazard.sprite.y = projectHazard(
        { at: hazard.at, x: hazard.sprite.x },
        this.distance,
      ).y;
      hazard.sprite.setAlpha(Math.max(0, Math.min(1, (hazard.expiresAt - time) / 800)));
    }

    this.hazards = this.hazards.filter((hazard) => {
      const alive = time < hazard.expiresAt && hazard.sprite.y < WORLD.height + 120;
      if (!alive) hazard.sprite.destroy();
      return alive;
    });
  }

  private updatePickups(dt: number): void {
    for (const pickup of this.pickups) {
      pickup.at += 0;
      pickup.sprite.y = PLAYER.y + this.distance - pickup.at;
      void dt;
    }
    this.pickups = this.pickups.filter((pickup) => {
      if (pickup.sprite.y > WORLD.height + 40) {
        pickup.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  /**
   * Scroll the ground props and the ramps.
   *
   * Their x is re-derived every frame rather than pinned at spawn: the road widens and
   * narrows under a prop while it scrolls, and a prop whose artwork wanders off its lane
   * while its collision box stays put is the exact mismatch this pass prevents.
   */
  private updateProps(): void {
    const shape = this.blueprint.road;

    for (const prop of this.props) {
      prop.sprite.x = laneCenterAt(shape, prop.at, prop.lane);
      prop.sprite.y = PLAYER.y + this.distance - prop.at;
    }
    this.props = this.props.filter((prop) => {
      if (prop.sprite.y > WORLD.height + 60) {
        prop.sprite.destroy();
        return false;
      }
      return true;
    });

    for (const ramp of this.ramps) {
      ramp.sprite.x = laneCenterAt(shape, ramp.at, ramp.lane);
      ramp.sprite.y = PLAYER.y + this.distance - ramp.at;
    }
    this.ramps = this.ramps.filter((ramp) => {
      if (ramp.sprite.y > WORLD.height + 60) {
        ramp.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  /**
   * Scroll the scenery outside the shoulder.
   *
   * Position only: decor has no collision, no damage and no interaction with any gameplay
   * pass, which is what keeps a cosmetic prop from ever blocking a lane.
   */
  private updateDecor(): void {
    for (const item of this.decor) {
      item.sprite.y = PLAYER.y + this.distance - item.at;
    }
    this.decor = this.decor.filter((item) => {
      if (item.sprite.y > WORLD.height + 120) {
        item.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  /**
   * Keep the ground shadow under the car while it is airborne.
   *
   * The car itself is drawn at `PLAYER.y - airHeight` by the vehicle; the shadow stays on
   * the road and shrinks with height, which is the only cue that says "off the ground"
   * rather than "the sprite moved".
   */
  private updateShadow(): void {
    const airborne = this.player.isAirborne;
    this.shadow.setVisible(airborne);
    if (!airborne) return;

    const height = this.player.airHeight;
    const shrink = 1 - Math.min(0.6, height / (JUMP.apexHeight * 2));
    this.shadow.setPosition(this.player.x, PLAYER.y + JUMP.shadowOffsetY);
    this.shadow.setScale(shrink);
    this.shadow.setAlpha(0.35 * shrink + 0.15);
  }

  /**
   * The landing beat: dust on a road, a splash on the river.
   *
   * Purely cosmetic, but it is the event the order asks for, and it is reported on the
   * debug surface so a spec can prove the arc ended rather than infer it from height.
   */
  private handleLanding(): void {
    const splash = this.blueprint.type === 'river';
    this.lastLanding = splash ? 'splash' : 'dust';

    const cloud = this.fitEffect(
      this.art.imageFrom(
        splash ? EFFECT_ART.splash : EFFECT_ART.dust,
        this.player.x,
        PLAYER.y + JUMP.shadowOffsetY,
        () => flatTexture(this, splash ? 'land-splash' : 'land-dust', splash ? 'teal' : 'bone', 20),
      ),
      40,
    )
      .setDepth(30)
      .setAlpha(0.85);

    this.tweens.add({
      targets: cloud,
      scale: { from: 0.7, to: 1.5 },
      alpha: { from: 0.85, to: 0 },
      duration: 320,
      onComplete: () => cloud.destroy(),
    });

    // A second, smaller puff thrown to one side, so the landing is not one flat disc. The
    // side is a stable function of the landing's own road station, never a random draw.
    const side = Math.floor(this.distance) % 2 === 0 ? -1 : 1;
    this.spawnOneShot(
      splash ? EFFECT_ART.splash : EFFECT_ART.dust,
      this.player.x + side * FX.landingSpread,
      PLAYER.y + JUMP.shadowOffsetY,
      28,
      1.6,
      300,
      0.6,
      30,
    );
  }

  /* -------------------------------- effects -------------------------------- */

  /**
   * Play one explosion package.
   *
   * The ordinal is the run's own explosion counter, so the table cycles deterministically:
   * the same seed replays the same sequence of packages, and a spec can prove two kills
   * differ by reading `lastFx`. The boss gets its own larger table and is never counted as
   * one of the four.
   */
  private playExplosion(x: number, y: number, variant: FxVariant): void {
    this.lastFx = variant;
    const layers =
      variant === 'boss' ? BOSS_EXPLOSION_LAYERS : explosionPackageFor(this.fxCount).layers;
    this.spawnLayers(layers, x, y);
    this.fxCount += 1;
  }

  /** The package the next ordinary explosion will wear. */
  private nextExplosionVariant(): ExplosionVariant {
    return explosionPackageFor(this.fxCount).variant;
  }

  /** Draw every layer of a package around one blast centre. */
  private spawnLayers(layers: readonly EffectLayer[], x: number, y: number): void {
    layers.forEach((layer, index) => {
      // Offsets are a stable hash of the explosion ordinal and the layer index — the same
      // run scatters its debris the same way twice, and no two layers sit exactly on top of
      // each other.
      const jitterX = ((this.fxCount * 7 + index * 13) % 17) - 8;
      const jitterY = ((this.fxCount * 5 + index * 11) % 15) - 7;
      this.spawnOneShot(
        layer.ids,
        x + (layer.offsetX ?? 0) + jitterX,
        y + (layer.offsetY ?? 0) + jitterY,
        layer.footprint,
        layer.grow,
        layer.durationMs,
        layer.alpha ?? 1,
        58,
      );
    });
  }

  /**
   * One effect sprite that grows and fades, then destroys itself.
   *
   * `fitEffect` keeps the scale a whole multiple of the native frame, so an effect never
   * blurs; the grow multiplies that whole scale rather than replacing it.
   */
  private spawnOneShot(
    ids: readonly string[],
    x: number,
    y: number,
    footprint: number,
    grow: number,
    durationMs: number,
    alpha: number,
    depth: number,
  ): void {
    const sprite = this.fitEffect(
      this.art.imageFrom(ids, x, y, () =>
        flatTexture(this, `fx-${footprint}`, 'amber', footprint),
      ),
      footprint,
    )
      .setDepth(depth)
      .setAlpha(alpha);

    this.tweens.add({
      targets: sprite,
      scale: sprite.scale * grow,
      alpha: 0,
      duration: durationMs,
      onComplete: () => sprite.destroy(),
    });
  }

  /** A short spark spray where a shell or a bumper lands. */
  private spawnSparks(x: number, y: number): void {
    this.spawnOneShot(EFFECT_ART.sparks, x, y, 24, 1.6, FX.impactLifeMs, 1, 59);
  }

  /** Chunks thrown off a prop or a car. */
  private spawnDebris(x: number, y: number): void {
    this.spawnOneShot(EFFECT_ART.debris, x, y, 28, 1.5, 260, 0.9, 59);
  }

  /** Dust kicked up by rough ground, a landing or a drifted tyre. */
  private spawnDust(x: number, y: number): void {
    this.spawnOneShot(EFFECT_ART.dust, x, y, 20, 1.7, 320, 0.65, 30);
  }

  /** A black splat where a slick catches a car. */
  private spawnOilSplat(x: number, y: number): void {
    this.spawnOneShot(EFFECT_ART.oil, x, y, 40, 1.5, 420, 0.85, 16);
  }

  /** A short electric arc at a muzzle, so a hostile shot is announced. */
  private spawnArc(x: number, y: number): void {
    this.spawnOneShot(EFFECT_ART.arc, x, y, 18, 1.4, 140, 1, 59);
  }

  /**
   * A struck vehicle catches: flame first, smoke behind it.
   *
   * Called on a kill and on a wrecked civilian, so a car burns before it comes apart instead
   * of turning straight into a burst.
   */
  private burnVehicle(x: number, y: number): void {
    this.spawnOneShot(EFFECT_ART.fire, x, y - 6, 28, 1.5, 300, 0.95, 59);
    this.spawnOneShot(EFFECT_ART.smoke, x + 6, y, 24, 1.6, 480, 0.55, 36);
  }

  /**
   * Tyre lines and drift smoke.
   *
   * A mark is laid only on the event — a hard steer or a hard brake — once per
   * `FX.skidIntervalMs`, at the car's own world station. It never moves again, so the road
   * scrolls away from it. The list is capped at `FX.skidMarkMax`, oldest first, and the
   * graphics object is cleared and redrawn from it each frame; marks fade out and are swept
   * once `FX.skidMarkLifeMs` has passed.
   */
  private updateSkids(time: number): void {
    const lateral = Math.abs(this.player.vx);
    // An airborne car has no tyres on the road: a ramp jump must not paint lines under it.
    const lighting = !this.player.isAirborne && skidTriggered(lateral, this.speed, this.brakeHeld);

    if (lighting && time - this.lastSkidAt >= FX.skidIntervalMs) {
      this.lastSkidAt = time;
      // Two lines, one under each wheel, so a drift reads as a car and not a single smear.
      for (const side of [-1, 1]) {
        this.skidMarks.push({
          x: this.player.x + side * FX.skidTrackHalfWidth,
          at: this.distance,
          bornAt: time,
        });
      }
      while (this.skidMarks.length > FX.skidMarkMax) this.skidMarks.shift();
    }

    if (lighting && time - this.lastDriftSmokeAt >= FX.driftSmokeIntervalMs) {
      this.lastDriftSmokeAt = time;
      this.spawnDust(this.player.x, PLAYER.y + 6);
    }

    const graphics = this.skidGraphics;
    graphics.clear();
    for (const mark of this.skidMarks) {
      const fade = skidFade(time - mark.bornAt);
      const y = PLAYER.y + this.distance - mark.at;
      if (fade <= 0 || y < -32 || y > WORLD.height + 32) continue;
      graphics.fillStyle(PALETTE.void, FX.skidMarkAlpha * fade);
      graphics.fillRect(
        Math.round(mark.x - FX.skidMarkHalfWidth),
        Math.round(y),
        FX.skidMarkHalfWidth * 2,
        FX.skidMarkLength,
      );
    }
    this.skidMarks = this.skidMarks.filter(
      (mark) => time - mark.bornAt < FX.skidMarkLifeMs,
    );
  }

  /**
   * Keep a rotor over every aircraft.
   *
   * A rotor is a cross with unequal arms, drawn once at the aircraft's displayed size, so a
   * 90-degree step changes the silhouette instead of rotating a symmetric plus into itself.
   * Steps are whole quarter turns of the scene clock: every blade edge stays on the pixel
   * grid, which is what keeps it crisp instead of a blurred disc. The overlay is re-seated
   * on its sprite every frame, so a weaving helicopter never leaves its rotor behind.
   */
  private updateRotors(time: number): void {
    const aircraft: Phaser.GameObjects.Image[] = [];
    for (const enemy of this.enemies) {
      if (enemy.def.shape === 'heli' && enemy.sprite.active) aircraft.push(enemy.sprite);
    }
    if (this.boss?.def.kind === 'gunship' && this.boss.sprite.active) {
      aircraft.push(this.boss.sprite);
    }

    this.rotors = this.rotors.filter((rotor) => {
      if (aircraft.includes(rotor.sprite)) return true;
      rotor.gfx.destroy();
      return false;
    });

    const quarter = rotorQuarter(time);
    for (const sprite of aircraft) {
      let rotor = this.rotors.find((candidate) => candidate.sprite === sprite);
      if (!rotor) {
        rotor = { sprite, gfx: this.drawRotor(sprite), quarter: -1 };
        this.rotors.push(rotor);
      }
      rotor.gfx.setPosition(sprite.x, sprite.y);
      rotor.gfx.setVisible(sprite.y > -80 && sprite.y < WORLD.height + 80);
      if (rotor.quarter !== quarter) {
        rotor.quarter = quarter;
        this.rotorTicks += 1;
      }
      rotor.gfx.setRotation((quarter * Math.PI) / 2);
    }
  }

  /** Draw one rotor cross, centred on its own origin, at the aircraft's size. */
  private drawRotor(sprite: Phaser.GameObjects.Image): Phaser.GameObjects.Graphics {
    const graphics = this.add.graphics().setDepth(FX.rotorDepth);
    const span = Math.max(24, Math.round(sprite.displayWidth * FX.rotorSpanRatio));
    const thickness = FX.rotorBladeThickness;
    const short = Math.round(span * 0.45);

    // Long arm up and right, short arm down and left: rotation is visible, and the cross
    // still reads as four blades from above.
    graphics.fillStyle(PALETTE.steelLight, 0.9);
    graphics.fillRect(0, -span, thickness, span);
    graphics.fillRect(0, 0, span, thickness);
    graphics.fillRect(0, 0, thickness, short);
    graphics.fillRect(-short, 0, short, thickness);
    graphics.fillStyle(PALETTE.bone, 1);
    graphics.fillRect(-2, -2, 4, 4);
    return graphics;
  }

  /* -------------------------------- weapons -------------------------------- */

  /** Fire the twin forward guns. Public so a touch pad drives the same path as Space. */
  fireGun(time = this.time.now): boolean {
    if (!this.player.canFire(time, this.gun.cooldown)) return false;

    const key = flatTexture(this, 'bullet', 'white', 6);
    const speed = this.gun.projectileSpeed ?? WEAPON_FX.gunProjectileSpeed;

    this.showMuzzleFlash(this.player.x, this.player.y - 26);

    for (const offset of [-10, 10]) {
      const sprite = this.add
        .image(this.player.x + offset, this.player.y - 26, key)
        .setDepth(45);
      this.bullets.push({
        sprite,
        ...forwardShot(sprite.y, this.distance, speed),
        from: 'player',
        damage: this.gun.damage,
      });
    }

    this.audio.play('gun');
    return true;
  }

  private enemyFire(enemy: EnemyVehicle): void {
    const key = flatTexture(this, 'enemy-bullet', 'signalRed', 7);
    const sprite = this.add.image(enemy.sprite.x, enemy.sprite.y, key).setDepth(45);
    // The muzzle arc is the shot's warning: it sits on the hostile for one beat before the
    // shell has crossed the gap.
    this.spawnArc(enemy.sprite.x, enemy.sprite.y);

    this.bullets.push({
      sprite,
      ...returnShot({
        enemyX: enemy.sprite.x,
        enemyY: enemy.sprite.y,
        playerX: this.player.x,
        playerY: this.player.y,
        distance: this.distance,
        scroll: this.worldSpeed,
        projectileSpeed: enemy.def.projectileSpeed ?? WEAPON_FX.enemyProjectileSpeed,
        maxDrift: WEAPON_FX.maxShotDrift,
      }),
      from: 'enemy',
      damage: 1,
    });
  }

  /**
   * Draw an effect frame at the on-screen footprint its flat-block stand-in occupied.
   *
   * Generated cells are 32 px while the stand-ins were 56 px (smoke) and 40 px (oil). The
   * nearest whole multiple keeps the pixels square, per the "no fractional scaling" rule.
   */
  private fitEffect(
    sprite: Phaser.GameObjects.Image,
    footprint: number,
  ): Phaser.GameObjects.Image {
    const native = Math.max(sprite.width, sprite.height);
    return sprite.setScale(Math.max(1, Math.ceil(displayScale(native, footprint))));
  }

  /**
   * A short, purely cosmetic bloom at the nose.
   *
   * art-10 has no dedicated muzzle flash, so the bright radial burst in cell 0 stands in.
   * It never collides with anything; the shells themselves start where they always did.
   */
  private showMuzzleFlash(x: number, y: number): void {
    const flash = this.fitEffect(
      this.art.imageFrom(EFFECT_ART.muzzle, x, y, () =>
        flatTexture(this, 'muzzle-flash', 'white', 12),
      ),
      24,
    ).setDepth(55);
    this.tweens.add({
      targets: flash,
      alpha: { from: 1, to: 0 },
      duration: 80,
      onComplete: () => flash.destroy(),
    });
  }

  /** Release the smoke cloud. Public so a touch pad drives the same path as Shift. */
  dropSmoke(time = this.time.now): void {
    if (!this.player.useSmoke(time, this.smokeWeapon.cooldown)) return;

    // Laid up the road, not on the bumper: the cloud has to be between the car and the
    // hostiles it is hiding the car from, and every hostile on the road is ahead.
    const at = this.distance + WEAPON_FX.smokeDropAhead;
    const sprite = this.fitEffect(
      this.art.imageFrom(
        EFFECT_ART.smoke,
        this.player.x,
        screenYFromWorldAt(at, this.distance),
        () => flatTexture(this, 'smoke', 'steelLight', 56),
      ),
      56,
    )
      .setDepth(35)
      .setAlpha(0.6);
    this.hazards.push({
      sprite,
      at,
      kind: 'smoke',
      expiresAt: time + (this.smokeWeapon.duration ?? 0),
    });
    this.audio.play(weaponCue('smoke'));
  }

  /** Drop an oil slick. Public so a touch pad drives the same path as X. */
  dropOil(time = this.time.now): void {
    if (!this.player.useOil(time, this.oilWeapon.cooldown)) return;

    // World-static, and ahead: a car that crosses it is one the player is about to meet.
    const at = this.distance + WEAPON_FX.oilDropAhead;
    const sprite = this.fitEffect(
      this.art.imageFrom(
        EFFECT_ART.oil,
        this.player.x,
        screenYFromWorldAt(at, this.distance),
        () => flatTexture(this, 'oil', 'void', 40),
      ),
      40,
    )
      .setDepth(15)
      .setAlpha(0.85);
    this.hazards.push({
      sprite,
      at,
      kind: 'oil',
      expiresAt: time + (this.oilWeapon.duration ?? 0),
    });
    this.audio.play(weaponCue('oil'));
  }

  /**
   * Launch a rocket up the road. Public so a touch pad drives the same path as Z.
   *
   * The rocket is a world-station projectile like a shell, with a fuse (`range`) and a
   * blast: it detonates on the first enemy, boss or obstacle it touches, or when the fuse
   * runs out, and everything inside `splashRadius` takes the damage.
   */
  fireRocket(time = this.time.now): boolean {
    if (!this.player.useRocket(time, this.rocketWeapon.cooldown)) return false;

    const muzzleY = this.player.y - WEAPON_FX.muzzleOffset;
    const sprite = this.art
      .imageFrom(ROCKET_ART, this.player.x, muzzleY, () =>
        flatTexture(this, 'rocket', 'amber', 12),
      )
      .setDepth(46);
    sprite.setScale(displayScale(Math.max(sprite.width, sprite.height), 32));

    this.rockets.push({
      sprite,
      at: worldAtFromScreenY(muzzleY, this.distance),
      speed: this.rocketWeapon.projectileSpeed ?? WEAPON_FX.rocketProjectileSpeed,
      damage: this.rocketWeapon.damage,
      splashRadius: this.rocketWeapon.splashRadius ?? WEAPON_FX.rocketSplashRadius,
      range: this.rocketWeapon.range ?? WEAPON_FX.rocketRange,
      travelled: 0,
    });
    this.audio.play(weaponCue('rocketLaunch'));
    return true;
  }

  /** Flight, contact and fuse for every live rocket. */
  private updateRockets(dt: number, time: number): void {
    for (const rocket of [...this.rockets]) {
      const step = rocket.speed * dt;
      rocket.at += step;
      rocket.travelled += step;
      rocket.sprite.y = screenYFromWorldAt(rocket.at, this.distance);

      if (rocket.travelled >= rocket.range || this.rocketTouchesTarget(rocket)) {
        this.detonateRocket(rocket, time);
      }
    }
  }

  /** Does this rocket's nose touch an enemy, the act boss or a ground obstacle? */
  private rocketTouchesTarget(rocket: Rocket): boolean {
    const { x, y } = rocket.sprite;
    const boss = this.boss;
    if (boss && Math.abs(x - boss.sprite.x) < boss.sprite.displayWidth * 0.45 &&
        Math.abs(y - boss.sprite.y) < boss.sprite.displayHeight * 0.45) {
      return true;
    }
    const enemy = this.enemies.find(
      (unit) =>
        Math.abs(x - unit.sprite.x) < unit.sprite.displayWidth * 0.45 &&
        Math.abs(y - unit.sprite.y) < unit.sprite.displayHeight * 0.45,
    );
    if (enemy) return true;
    return this.props.some((prop) => withinBlast(rocket.sprite, prop.sprite, 18));
  }

  /**
   * Blow a rocket up and damage everything inside the blast.
   *
   * Splash is a circle around the burst, so a neighbour two lanes over is safe and one
   * under the explosion is not. Enemies, the act boss and the ground props are all inside
   * the same radius; the burst is what the player sees and the what the damage follows.
   */
  private detonateRocket(rocket: Rocket, time: number): void {
    const index = this.rockets.indexOf(rocket);
    if (index >= 0) this.rockets.splice(index, 1);

    const { x, y } = rocket.sprite;
    rocket.sprite.destroy();

    const burst = { x, y };
    this.showBurst(burst);
    this.audio.play(weaponCue('rocketImpact'));

    for (const enemy of [...this.enemies]) {
      if (!withinBlast(burst, enemy.sprite, rocket.splashRadius)) continue;
      if (!enemy.sprite.active) continue;
      if (enemy.hit(rocket.damage)) {
        this.lastWeaponKill = 'rocket';
        this.killEnemy(enemy);
      }
    }

    const boss = this.boss;
    if (boss && withinBlast(burst, boss.sprite, rocket.splashRadius) && boss.hit(rocket.damage)) {
      this.lastWeaponKill = 'rocket';
      this.defeatBoss(time);
    }
  }

  /**
   * The rocket's blast.
   *
   * Drawn from the same deterministic table as a kill, so the detonation of the round and
   * the destruction of what it hit are two distinct packages rather than one flattened
   * composite: the round goes off, then the target comes apart.
   */
  private showBurst(centre: { readonly x: number; readonly y: number }): void {
    this.playExplosion(centre.x, centre.y, this.nextExplosionVariant());
  }

  /**
   * Fire the flamethrower. Public so a touch pad drives the same path as C.
   *
   * One burst buys `duration` ms of cone: the stream is redrawn every frame and a damage
   * tick is applied every `tickMs` while it burns. The cone is short — it reaches nothing
   * past `range` — so it is a close-range weapon by construction, not by tuning.
   */
  fireFlame(time = this.time.now): boolean {
    if (!this.player.useFlame(time, this.flameWeapon.cooldown)) return false;

    // Replaces any stream still burning first: `stopFlame()` clears the window, so the new
    // one has to be opened after it.
    this.spawnFlameStream();
    this.flameFrom = time;
    this.flameUntil = time + (this.flameWeapon.duration ?? 0);
    // The first tick lands with the ignition, so a point-blank target burns immediately.
    this.nextFlameTickAt = time;
    this.audio.play(weaponCue('flame'));
    return true;
  }

  /** The stream sprites that live for one burst, one per flicker frame. */
  private spawnFlameStream(): void {
    this.stopFlame();

    for (let i = 0; i < WEAPON_FX.flameStreamSprites; i += 1) {
      const ids = FLAME_STREAM_ART[i % FLAME_STREAM_ART.length] ?? FLAME_STREAM_ART[0] ?? [];
      const sprite = this.fitEffect(
        this.art.imageFrom(
          ids,
          this.player.x,
          this.player.y - WEAPON_FX.muzzleOffset - i * WEAPON_FX.flameStreamSpacing,
          () => flatTexture(this, 'flame', 'amber', 24),
        ),
        30,
      ).setDepth(47);
      this.flameSprites.push(sprite);
    }
  }

  private stopFlame(): void {
    this.flameUntil = 0;
    this.flameFrom = 0;
    this.nextFlameTickAt = 0;
    for (const sprite of this.flameSprites) sprite.destroy();
    this.flameSprites = [];
  }

  /**
   * The live flame stream: flicker, positioning and the damage ticks.
   *
   * The flicker is a sine of the scene clock with a per-sprite phase — no random draw, so a
   * replay burns identically — and only ever moves a sprite by whole pixels.
   */
  private updateFlame(time: number): void {
    if (this.flameSprites.length === 0) return;
    if (time >= this.flameUntil) {
      this.stopFlame();
      return;
    }

    const tickMs = this.flameWeapon.tickMs ?? WEAPON_FX.flameTickMs;

    while (this.nextFlameTickAt < this.flameUntil && time >= this.nextFlameTickAt) {
      this.burnFlame(this.nextFlameTickAt);
      this.nextFlameTickAt += tickMs;
    }

    this.flameSprites.forEach((sprite, index) => {
      const phase = (time / WEAPON_FX.flameFlickerMs + index) * Math.PI;
      sprite.x = this.player.x;
      sprite.y =
        this.player.y -
        WEAPON_FX.muzzleOffset -
        index * WEAPON_FX.flameStreamSpacing +
        Math.round(Math.sin(phase) * 2);
      sprite.setAlpha(0.7 + 0.3 * Math.abs(Math.cos(phase)));
    });
  }

  /** One damage tick of the flame cone: everything inside it burns. */
  private burnFlame(time: number): void {
    // The ignition has its own cue; every tick after it is the burner's loop bed.
    if (time > this.flameFrom) this.audio.play(weaponCue('flameLoop'));

    const flame = this.flameWeapon;
    const origin = { x: this.player.x, y: this.player.groundY };
    const range = flame.range ?? 0;
    const farWidth = flame.coneHalfWidth ?? 0;

    for (const enemy of [...this.enemies]) {
      if (!enemy.sprite.active) continue;
      if (!flameCatches(origin, enemy.sprite, range, WEAPON_FX.flameConeNearWidth, farWidth)) {
        continue;
      }
      if (enemy.hit(flame.damage)) {
        this.lastWeaponKill = 'flame';
        this.killEnemy(enemy);
      }
    }

    const boss = this.boss;
    if (
      boss &&
      flameCatches(origin, boss.sprite, range, WEAPON_FX.flameConeNearWidth, farWidth) &&
      boss.hit(flame.damage)
    ) {
      this.lastWeaponKill = 'flame';
      this.defeatBoss(time);
    }
  }

  /** True while any live smoke cloud sits between this hostile and the car. */
  private isBlindedBySmoke(enemy: EnemyVehicle): boolean {
    return this.hazards.some(
      (hazard) =>
        hazard.kind === 'smoke' &&
        smokeBlocksFire(hazard.at, enemy.at, this.distance, WEAPON_FX.smokeCover),
    );
  }

  /* ------------------------------ collisions ------------------------------- */

  private resolveCollisions(time: number): void {
    // Ramps first: a ramp crossed this frame must start the jump before the prop pass
    // decides whether the obstacle just past it is still on the ground.
    this.resolveRampContacts();

    // Player bullets vs enemies.
    for (const bullet of this.bullets) {
      if (bullet.from !== 'player') continue;
      for (const enemy of this.enemies) {
        if (Math.abs(bullet.sprite.x - enemy.sprite.x) < enemy.sprite.displayWidth * 0.45 &&
            Math.abs(bullet.sprite.y - enemy.sprite.y) < enemy.sprite.displayHeight * 0.45) {
          const impactX = bullet.sprite.x;
          const impactY = bullet.sprite.y;
          bullet.sprite.destroy();
          bullet.at = Number.NEGATIVE_INFINITY;

          if (enemy.hit(bullet.damage)) {
            this.killEnemy(enemy);
          } else {
            // A round that lands but does not finish the car still sparks off it.
            this.spawnSparks(impactX, impactY);
          }
          break;
        }
      }
    }

    // Player bullets vs the act boss. A boss is the widest thing on the road, so its hit
    // box tracks its real silhouette, and a defeat runs the same state machine the debug
    // control drives.
    const boss = this.boss;
    if (boss) {
      for (const bullet of this.bullets) {
        if (bullet.from !== 'player' || !Number.isFinite(bullet.at)) continue;
        if (
          Math.abs(bullet.sprite.x - boss.sprite.x) < boss.sprite.displayWidth * 0.45 &&
          Math.abs(bullet.sprite.y - boss.sprite.y) < boss.sprite.displayHeight * 0.45
        ) {
          const impactX = bullet.sprite.x;
          const impactY = bullet.sprite.y;
          bullet.sprite.destroy();
          bullet.at = Number.NEGATIVE_INFINITY;
          if (boss.hit(bullet.damage)) {
            this.defeatBoss(time);
            break;
          }
          this.spawnSparks(impactX, impactY);
        }
      }
    }

    // Player bullets vs civilian traffic. Shooting a civilian is a deliberate act, so it
    // costs more than clipping one: the road punishes careless gunnery, not just
    // careless driving. A wrecked civilian hit again in the same frame is skipped.
    for (const bullet of this.bullets) {
      if (bullet.from !== 'player' || !Number.isFinite(bullet.at)) continue;
      const civilian = this.civilians.find(
        (c) =>
          !c.wrecked &&
          Math.abs(bullet.sprite.x - c.sprite.x) < c.sprite.displayWidth * 0.45 &&
          Math.abs(bullet.sprite.y - c.sprite.y) < c.sprite.displayHeight * 0.45,
      );
      if (!civilian) continue;

      this.spawnSparks(bullet.sprite.x, bullet.sprite.y);
      bullet.sprite.destroy();
      bullet.at = Number.NEGATIVE_INFINITY;
      // Traffic is durable now: a stray round marks the car, and only the round that takes
      // its last hit wrecks it and pays the penalty.
      if (!civilian.hit(bullet.damage)) continue;
      this.applyScore('civilianDestroyed');
      this.wreckCivilian(civilian, 'CIVILIAN DOWN');
    }
    this.bullets = this.bullets.filter((b) => Number.isFinite(b.at));

    // Enemy bullets vs player. A respawn sweeps the shells around the car mid-loop, so the
    // ones already removed are skipped instead of hitting twice.
    for (const bullet of this.bullets) {
      if (bullet.from !== 'enemy') continue;
      if (!bullet.sprite.active || !Number.isFinite(bullet.at)) continue;
      if (this.overlapsPlayer(bullet.sprite.x, bullet.sprite.y, 6, 6)) {
        this.spawnSparks(bullet.sprite.x, bullet.sprite.y);
        bullet.sprite.destroy();
        bullet.at = Number.NEGATIVE_INFINITY;
        this.damagePlayer(time);
      }
    }
    this.bullets = this.bullets.filter((b) => Number.isFinite(b.at));

    // Enemies and traffic against the car. Every contact goes through the resolver, which
    // parts the two cars and gives each an impulse before anything is decided; what a
    // contact then costs is a separate question. A respawn clears the threats around the
    // car, which replaces the array this loop holds, so iterate a copy and skip whatever
    // the sweep already destroyed.
    //
    // Ground contact only: a jump carries the car over vehicles. Shells and the act boss
    // are deliberately outside this gate — an airborne car is above the road, not out of
    // the fight.
    if (!this.player.isAirborne) {
      for (const enemy of [...this.enemies]) {
        if (!enemy.sprite.active) continue;
        this.resolveVehicleContact(time, enemy);
      }

      // Traffic never costs armour: the road is dense, and losing armour to unseen neutral
      // cars reads as unfair rather than hard.
      for (const civilian of [...this.civilians]) {
        if (civilian.wrecked || !civilian.sprite.active) continue;
        this.resolveVehicleContact(time, civilian);
      }

      this.resolvePropContacts(time);
    }

    // Player vs pickups.
    for (const pickup of this.pickups) {
      if (this.overlapsPlayer(pickup.sprite.x, pickup.sprite.y, 14, 14)) {
        pickup.sprite.destroy();
        pickup.at = Number.NEGATIVE_INFINITY;
        this.applyPickup(pickup.kind);
      }
    }
    this.pickups = this.pickups.filter((p) => Number.isFinite(p.at));

    // A slick spins the first car that crosses it and is spent on that car. It does not
    // kill: the car loses control, drifts sideways and cannot aim, and is still shootable
    // while it flails. Both the slick and the car are drawn from the same world projection,
    // so this is a world-space crossing, not a screen-space coincidence.
    for (const hazard of this.hazards) {
      if (hazard.kind !== 'oil') continue;

      const target = this.enemies.find(
        (enemy) =>
          !enemy.isSpinning &&
          oilCatches(
            { x: hazard.sprite.x, y: hazard.sprite.y },
            enemy.sprite,
            WEAPON_FX.oilCatchHalfWidth,
            WEAPON_FX.oilCatchHalfHeight,
          ),
      );
      if (!target) continue;

      hazard.expiresAt = time;
      target.applySpin(time, WEAPON_FX.oilSpinMs);
      // The slick is spent on the car that crossed it: a black splat on the tarmac is the
      // visible end of the hazard, not an unannounced disappearance.
      this.spawnOilSplat(target.sprite.x, target.sprite.y);
      this.score += SCORE.oilSpin;
    }
  }

  /**
   * Cross a ramp.
   *
   * The trigger is the car's collision box against the ramp's box in its own lane. A ramp
   * never damages, never blocks and never produces a contact: it starts the jump and that
   * is all.
   */
  private resolveRampContacts(): void {
    if (this.player.isAirborne) return;

    const shape = this.blueprint.road;

    for (const ramp of this.ramps) {
      const box = {
        x: laneCenterAt(shape, ramp.at, ramp.lane),
        y: PLAYER.y + this.distance - ramp.at,
        halfWidth: JUMP.rampHalfWidth,
        halfHeight: JUMP.rampHalfHeight,
      };
      if (!contactBetween(this.playerBox(), box)) continue;

      this.player.jump(JUMP.durationMs);
      this.audio.play('pickup');
      return;
    }
  }

  /**
   * Ground props against the car.
   *
   * The class in `content/props.json` decides the cost (`systems/props.ts`): solid spends
   * armour through the ordinary damage path and shoves the prop aside, soft only shoves it,
   * hazard only slows the car. A solid prop also parts the car sideways, so a barrier
   * resolves instead of being driven through. The caller skips this whole pass while the
   * car is airborne.
   */
  private resolvePropContacts(time: number): void {
    for (const prop of [...this.props]) {
      if (!prop.sprite.active) continue;

      const box = {
        x: prop.sprite.x,
        y: prop.sprite.y,
        halfWidth: prop.halfWidth,
        halfHeight: prop.halfHeight,
      };
      const contact = contactBetween(this.playerBox(), box);
      if (!contact) continue;

      const outcome = propContactOutcome(prop.collision, this.player.isAirborne);
      if (!outcome.contact) continue;

      this.propContactCount += 1;
      this.lastPropContact = {
        index: this.propContactCount,
        kind: prop.kind,
        collision: prop.collision,
        damage: outcome.damage,
      };

      // A clipped obstacle throws dust off the road and, when it costs armour, debris.
      this.spawnDust(prop.sprite.x, prop.sprite.y);
      if (outcome.damage) this.spawnDebris(prop.sprite.x, prop.sprite.y);

      if (outcome.shove) this.shoveProp(prop, this.player.x < prop.sprite.x ? -1 : 1);

      if (outcome.speedFactor < 1) {
        this.speed = Math.min(this.speed, this.cruiseSpeed * outcome.speedFactor);
      }

      // Along the road the car is pinned, so a solid prop is what moves (shoved above);
      // sideways the car is the one that gives way.
      if (prop.collision === 'solid' && contact.axis === 'x') {
        this.player.shift(-contact.nx * (contact.depth + COLLISION.slop));
      }

      if (outcome.damage) this.damagePlayer(time);
      if (this.runEnded) return;
    }
  }

  /** Throw a prop off the road. Gameplay removes it at once; the tween is only the look. */
  private shoveProp(prop: PropInstance, direction: 1 | -1): void {
    const index = this.props.indexOf(prop);
    if (index >= 0) this.props.splice(index, 1);

    this.tweens.add({
      targets: prop.sprite,
      x: prop.sprite.x + direction * PROP_IMPACT.knockAside,
      y: prop.sprite.y - 22,
      alpha: 0,
      duration: PROP_IMPACT.knockFadeMs,
      onComplete: () => prop.sprite.destroy(),
    });
  }

  private playerBox(): CollisionBox {
    return {
      x: this.player.x,
      // The ground station, not the drawn altitude: bullets and boss fire are aimed there.
      y: this.player.groundY,
      halfWidth: this.player.halfWidth,
      halfHeight: this.player.halfHeight,
    };
  }

  private overlapsPlayer(x: number, y: number, hw: number, hh: number): boolean {
    return (
      Math.abs(x - this.player.x) < hw + this.player.halfWidth &&
      // Shells are checked against the road station, so a jump is never immunity.
      Math.abs(y - this.player.groundY) < hh + this.player.halfHeight
    );
  }

  /**
   * One car against the player, on the real contact path.
   *
   * The resolver does the whole of the contact first — both cars are parted, both get an
   * impulse — because a collision that leaves two cars overlapping, or deletes one on the
   * spot, is the bug this exists to prevent. Only then does the contact cost anything, and
   * what it costs is decided by `contactCost`:
   *
   * - a hostile ram spends one armour hit through `damagePlayer`, which owns the i-frame
   *   window, so a contact cannot spend armour twice in one frame or at all while
   *   invulnerable; the hit that landed leaves the wheel wobbling and the camera kicked;
   *   and the car that was rammed takes `COLLISION.impactDamage`, clamped so the frame it is
   *   touched cannot wreck it but the next hit can — a hard hit *may* wreck the car it lands
   *   on, it does not erase it;
   * - every hostile also carries a signature side weapon. Touching it shoves the car away
   *   along the contact normal and holds the wheel for the weapon's window, alongside the
   *   armour and impact damage above, never instead of them;
   * - traffic never costs armour, and its penalty is paid by the contact rather than by the
   *   damage window, so an i-frame cannot swallow it; see `content/civilians.json`.
   *
   * A glance from a sideswipe is neither: the cars are pushed apart and both drive on.
   */
  private resolveVehicleContact(
    time: number,
    other: EnemyVehicle | CivilianVehicle,
  ): void {
    const hit = resolveContact(this.player, other);
    if (!hit) return;

    this.player.shift(hit.shiftAX);
    this.player.applyImpulse(hit.deltaAX);
    other.shift(hit.shiftBX, hit.shiftBY);
    other.applyImpulse(hit.deltaBX, hit.deltaBY);

    // Two bumpers meeting throw sparks; a hard one also knocks debris off the car it hit.
    this.spawnSparks((this.player.x + other.x) / 2, (this.player.groundY + other.y) / 2);
    if (hit.hard) this.spawnDebris(other.x, other.y);

    const hostile = other instanceof EnemyVehicle;
    const weapon = other instanceof EnemyVehicle ? other.def.weapon : null;
    this.contactCount += 1;
    this.lastContact = {
      index: this.contactCount,
      other: hostile ? 'enemy' : 'civilian',
      depth: hit.contact.depth,
      nx: hit.contact.nx,
      ny: hit.contact.ny,
      approach: hit.approach,
      hard: hit.hard,
      playerVx: hit.deltaAX,
      otherVx: hit.deltaBX,
      weapon,
    };

    // The side weapon: a shove away from the hostile and a window with no wheel. It runs
    // for every hostile contact, hard or glance, because touching a weapon is what the
    // weapon does; armour is a separate question decided below.
    if (weapon && !this.runEnded) {
      const spec = contactWeaponFor(weapon);
      const away = this.player.x >= other.x ? 1 : -1;
      this.player.addImpulse(away * spec.pushPx);
      this.player.lockSteering(time, spec.lockMs);
    }

    const cost = contactCost({
      hard: hit.hard,
      hostile,
      runEnded: this.runEnded,
      invulnerable: this.player.isInvulnerable,
    });

    // The penalty for clattering a neutral car belongs to the contact, not to the damage
    // window: an i-frame buys the player armour, never a free pass through a bus.
    if (cost.trafficPenalty && other instanceof CivilianVehicle) {
      this.applyScore('civilianContact');
      this.wreckCivilian(other, 'CIVILIAN HIT');
    }

    if (cost.jolt) {
      // A hostile hit kicks the camera inside `damagePlayer`; a traffic hit spends no
      // armour, so it is not on that path and its jolt is applied here.
      this.player.wobble(time);
      if (!cost.armour) this.kickCamera(time);
    }

    // Armour, and only armour, is what the window buys: `damagePlayer` owns it and answers
    // whether the hit landed, so a hard ram cannot spend twice in one frame.
    if (!cost.armour || !this.damagePlayer(time)) return;

    // A wreck at zero armour respawns and sweeps the road around the car, so the car that
    // was just hit may already be gone.
    if (!cost.damageOther || !(other instanceof EnemyVehicle)) return;
    if (!other.sprite.active) return;

    // `contactImpactDamage` is what keeps the side weapon's promise: the hostile is marked
    // but left standing on the frame it is touched, and the next hit finishes it.
    if (other.hit(contactImpactDamage(other.hp))) this.killEnemy(other);
  }

  /**
   * Start the deterministic camera kick a hit leaves behind.
   *
   * Every hit that jolts the frame goes through here — a shell, rough ground, a ram, a
   * traffic contact on a run that is still driving, the debug control — rather than through
   * Phaser's `Camera.shake()`, which offsets the frame with `Math.random()` and would make a
   * seeded run irreproducible frame for frame. This is the same beat written as a decaying
   * sine on the camera's scroll: no randomness, no clock reads beyond the frame time, so a
   * replay of the same run shakes exactly the same way.
   *
   * The one `Camera.shake()` left in this scene is `defeatBoss`, a reward beat that no
   * contact can reach (boss collisions are outside this order), never a damage path.
   */
  private kickCamera(time: number): void {
    this.shakeFrom = time;
    this.shakeUntil = time + COLLISION.shakeMs;
    if (!this.cameraHome) {
      this.cameraHome = { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY };
    }
  }

  /** Apply or undo the camera kick. Runs last in `update()`, so it owns the frame's scroll. */
  private updateCameraKick(time: number): void {
    const camera = this.cameras.main;
    const home = this.cameraHome;
    if (!home) return;

    if (time >= this.shakeUntil) {
      camera.setScroll(home.x, home.y);
      this.cameraHome = null;
      return;
    }

    const age = Math.max(0, time - this.shakeFrom) / 1000;
    const decay = (this.shakeUntil - time) / COLLISION.shakeMs;
    const phase = age * COLLISION.shakeHz * Math.PI * 2;
    camera.setScroll(
      home.x + Math.sin(phase) * COLLISION.shakeOffset * decay,
      home.y + Math.cos(phase * 2) * COLLISION.shakeOffset * 0.5 * decay,
    );
  }

  /**
   * The rough-ground rules, run every frame the world moves.
   *
   * Off the paint the car is not destroyed outright: it is warned, slowed, and then hit on
   * a fixed cadence once `OFFROAD.graceMs` has passed. Every tick goes through
   * `damagePlayer`, so rough ground spends armour exactly like a shell does and a final
   * tick at zero armour spends a life and respawns the car on the road it was on.
   */
  private updateOffRoad(time: number, road: RoadProfile): void {
    if (!this.player.isOffRoad(road)) {
      if (this.offRoad) this.showBanner('BACK ON THE ROAD');
      this.offRoad = false;
      this.offRoadSince = null;
      return;
    }

    this.offRoad = true;
    if (this.offRoadSince === null) {
      // Grace: a steering correction that clips the shoulder is recoverable, and the warning
      // is what tells the player the clock has started.
      this.offRoadSince = time;
      this.nextOffRoadHitAt = time + OFFROAD.graceMs;
      this.showBanner('OFF ROAD');
      return;
    }

    if (time < this.nextOffRoadHitAt) return;
    this.nextOffRoadHitAt = time + OFFROAD.damageIntervalMs;
    // Rough ground kicks dust up at the wheels on every tick it costs.
    this.spawnDust(this.player.x, PLAYER.y + 8);
    this.damagePlayer(time);
  }

  private damagePlayer(time: number): boolean {
    // The scene keeps ticking during the game-over delay, and two collisions can land on
    // the same frame: once the run is over, nothing else may touch the wreck.
    if (this.runEnded) return false;
    if (!this.player.takeHit(time)) return false;
    // Every damage path — a shell, a ram, rough ground, the debug control — kicks the camera
    // through `kickCamera` and never through `Camera.shake()`: the Phaser shake offsets the
    // frame with `Math.random()`, and a seeded run has to replay the same way.
    this.kickCamera(time);
    this.audio.play('hit');
    // Armour and score are separate resources: a hit that the car survives costs no
    // points, so only a destroyed vehicle moves the score.
    this.applyScore('armourHit');

    if (this.player.isDestroyed) {
      this.spendLife(time);
    }
    return true;
  }

  /**
   * Spend one life on a wreck.
   *
   * Every zero-armour path funnels through here — an enemy shell, a ram, the boss, the debug
   * control — so the life counter, the respawn and the single end-of-run hand-off cannot
   * drift apart. Lives are separate from armour precisely because a respawn refills armour:
   * without a counter of their own a wreck could never end a run.
   */
  private spendLife(time: number): void {
    if (this.runEnded) return;

    this.lives = Math.max(0, this.lives - 1);
    if (this.lives === 0) {
      this.endRun();
      return;
    }

    this.respawn(time);
  }

  /**
   * Put a fresh car on the road, at the same stretch of highway the wreck happened on.
   *
   * World distance is deliberately untouched: a respawn must not refund road already driven
   * or skip the sector the player died in. Speed resets to cruise, because the pedals of the
   * run that just ended are not the ones the player is holding now.
   */
  private respawn(time: number): void {
    // Recentre on the road the wreck happened on: the car may have died on the dirt beside
    // it, and a fresh life spent in the same hedge would be the same mistake twice.
    this.player.respawn(time, roadAt(this.blueprint.road, this.distance));
    this.speed = MOTION.cruiseSpeed;
    this.steer = 0;
    this.offRoad = false;
    this.offRoadSince = null;
    this.nextOffRoadHitAt = 0;
    this.touchInput.reset();
    this.clearNearbyThreats();
    this.audio.play('pickup');
    this.showBanner(`RESPAWN · ${this.lives} LEFT`);
  }

  /**
   * Sweep hostile threats out of the respawn window.
   *
   * Only threats: enemy shells already in the air are dropped and pursuers sitting on the
   * respawn point are removed. They are removed rather than killed — a respawn must not pay
   * score for the road that killed the player. Traffic, pickups, props and the act boss are
   * left alone; they are part of the level, not the wreck.
   */
  private clearNearbyThreats(): void {
    const radius = PLAYER.respawnClearRadius;
    const near = (sprite: { x: number; y: number }): boolean =>
      Math.abs(sprite.x - this.player.x) <= radius &&
      Math.abs(sprite.y - this.player.y) <= radius;

    for (const bullet of this.bullets) {
      if (bullet.from !== 'enemy' || !near(bullet.sprite)) continue;
      bullet.sprite.destroy();
      bullet.at = Number.NEGATIVE_INFINITY;
    }
    this.bullets = this.bullets.filter((bullet) => Number.isFinite(bullet.at));

    const survivors: EnemyVehicle[] = [];
    for (const enemy of this.enemies) {
      if (near(enemy.sprite)) {
        enemy.destroy();
        continue;
      }
      survivors.push(enemy);
    }
    this.enemies = survivors;
  }

  /** Apply one scoring rule, clamped at zero, and record it for the debug surface. */
  private applyScore(kind: ScoreEventKind): void {
    const delta = scoreDelta(kind);
    this.score = Math.max(0, this.score + delta);
    this.lastScoreEvent = { kind, delta };
  }

  /**
   * Shared civilian wreck: tint, challenge counter, feedback. Called by contact and fire.
   *
   * The camera is not shaken here. A hard contact kicks deterministically from the contact
   * path (and a run that has already ended gets no jolt at all), while a shot-down civilian
   * is feedback enough through its audio and banner. `Camera.shake()` would spend
   * `Math.random()` and break seed replay.
   */
  private wreckCivilian(civilian: CivilianVehicle, banner: string): void {
    const { x, y } = civilian.sprite;
    civilian.wreck(this.distance);
    // Traffic burns and throws debris when it comes apart — the same burn-then-burst beat a
    // hostile gets, without the explosion package (a civilian is not an ammo hit).
    this.burnVehicle(x, y);
    this.spawnDebris(x, y);
    this.challenges.notifyCivilianHit();
    this.audio.play('hit');
    this.showBanner(banner);
  }

  private killEnemy(enemy: EnemyVehicle): void {
    this.applyScore('enemyDestroyed');
    this.challenges.notifyKill();
    this.audio.play('explosion');
    // No camera shake: the explosion package and its audio are the feedback, and the camera
    // kick belongs to `kickCamera`, which only a hit on the player earns.
    const { x, y } = enemy.sprite;
    // A car burns before it comes apart, then takes one of the four packages in turn.
    this.burnVehicle(x, y);
    this.playExplosion(x, y, this.nextExplosionVariant());
    this.spawnSparks(x, y);

    enemy.destroy();
    this.enemies = this.enemies.filter((e) => e !== enemy);
  }

  private applyPickup(kind: string): void {
    this.audio.play('pickup');
    this.challenges.notifyPickup();

    switch (kind) {
      case 'oil':
        this.player.addOil(2);
        this.showBanner('OIL SLICK +2');
        break;
      case 'smoke':
        this.player.addSmoke(1);
        this.showBanner('SMOKE +1');
        break;
      case 'armour':
        this.player.addArmor(1);
        this.showBanner('ARMOUR +1');
        break;
      case 'shield':
        this.player.addArmor(2);
        this.showBanner('SHIELD');
        break;
      case 'nitro':
        this.score += 100;
        this.showBanner('NITRO');
        break;
      default:
        this.score += 50;
        break;
    }
  }

  /* ------------------------------- challenge ------------------------------- */

  /**
   * One definition of the challenge callbacks. The first sector and every sector after it
   * are built here, so the reward paid is always the one `challenges.json` declares.
   */
  private createChallengeSystem(): ChallengeSystem {
    return new ChallengeSystem(
      this.blueprint,
      (plan) => {
        this.score += plan.reward;
        this.showBanner(`CHALLENGE COMPLETE · ${plan.label}`);
      },
      (plan) => {
        this.showBanner(`CHALLENGE FAILED · ${plan.label}`);
      },
    );
  }

  private updateChallenge(): void {
    const state = this.challenges.update(this.distance);
    if (!state) return;
    this.challengeLabel = state.label;
    this.challengeProgress = state.progress;
    this.challengeTarget = state.target;
  }

  /* --------------------------------- flow ---------------------------------- */

  /**
   * Cross the sector boundary.
   *
   * World distance restarts at 0 here, which makes every carried-over entity's `at` a
   * meaningless number in the thousands: it can never come back on screen, so it would sit
   * in the arena forever and eat a spawn slot. The world is therefore emptied first, and
   * the spawner cursor is reset so the new blueprint starts on its own first event.
   *
   * Reached only through `updateActBoundary`, which holds it back until the act boss is
   * down, so the transition is unchanged from WO-33 and simply runs later.
   */
  private advanceLevel(): void {
    this.clearWorld();

    this.levelIndex += 1;
    this.blueprint = levelForSeed(this.seed, this.levelIndex);
    this.distance = 0;
    resetSpawner(this.spawner);

    this.challengeLabel = '';
    this.challengeProgress = 0;
    this.challengeTarget = 0;
    this.challenges = this.createChallengeSystem();

    this.road.destroy();
    this.road = new RoadSystem(this, this.blueprint.road, this.blueprint.type, this.art);
    this.applyVisibility();

    this.presentSector();
  }

  /** Destroy every live world object, on both edges of the play aperture. */
  private clearWorld(): void {
    // A live boss is an encounter, not sector scenery, so it is deliberately not swept
    // here: it lives in its own field rather than in `enemies`, and only losing the fight
    // removes it. That is the invariant a sector reset must never break.
    for (const enemy of this.enemies) enemy.destroy();
    for (const civilian of this.civilians) civilian.destroy();
    for (const bullet of this.bullets) bullet.sprite.destroy();
    for (const hazard of this.hazards) hazard.sprite.destroy();
    for (const rocket of this.rockets) rocket.sprite.destroy();
    for (const pickup of this.pickups) pickup.sprite.destroy();
    for (const prop of this.props) prop.sprite.destroy();
    for (const ramp of this.ramps) ramp.sprite.destroy();
    for (const item of this.decor) item.sprite.destroy();
    for (const rotor of this.rotors) rotor.gfx.destroy();

    this.enemies = [];
    this.civilians = [];
    this.bullets = [];
    this.hazards = [];
    this.rockets = [];
    this.stopFlame();
    this.pickups = [];
    this.props = [];
    this.ramps = [];
    this.decor = [];
    this.rotors = [];
    // Decals are world-static, so a sector boundary — which restarts `distance` at zero —
    // would replay the old sector's marks up the new road. Clear them with the world.
    this.skidMarks = [];
    this.skidGraphics.clear();
    this.lastLanding = null;
    this.lastPropContact = null;
  }

  /** Darken the world for the run. `visibility` 1 is clear; a tunnel is 0.45. */
  private applyVisibility(): void {
    const alpha = 1 - Math.max(0, Math.min(1, this.blueprint.visibility));
    this.darkness.clear();

    if (alpha <= 0) {
      this.darkness.setVisible(false);
      return;
    }

    this.darkness.setVisible(true);
    this.darkness.fillStyle(PALETTE.void, alpha);
    this.darkness.fillRect(0, 0, WORLD.width, WORLD.height);
  }

  /** Freeze the run behind a card naming the sector and the level type. */
  private presentSector(): void {
    const card: SectorCardState = {
      level: this.levelIndex,
      label: levelLabelFor(this.blueprint.type),
    };

    this.sectorCard = card;
    this.lastSectorCard = card;
    this.introActive = true;

    this.scene.launch('LevelIntro', {
      levelIndex: this.levelIndex,
      type: this.blueprint.type,
      targetScene: this.scene.key,
    });
  }

  private endRun(): void {
    // Exactly once: two collisions on the same frame must not start the result screen twice.
    if (this.runEnded) return;
    this.runEnded = true;

    this.player.showWrecked();
    this.audio.play('engineFail');
    // The hit that ended the run already kicked the camera through `damagePlayer`; a run
    // that is over gets no second, random shake.
    this.scene.stop('Hud');

    // The scene keeps ticking until the 600 ms hand-off, which would add a few points and
    // a couple of hundred pixels to a run that is already over — and could even cross a
    // sector boundary. Freeze the result here so the summary, the stored best and the
    // debug snapshot all describe the same moment.
    const result = {
      score: Math.max(0, Math.round(this.score)),
      distance: Math.round(this.distance * LEVEL.metresPerPixel),
      level: this.levelIndex,
      seed: this.seed,
      lives: this.lives,
    };

    const best = Number(localStorage.getItem(`${GAME.storagePrefix}best`) ?? '0');
    if (result.score > best) {
      localStorage.setItem(`${GAME.storagePrefix}best`, String(result.score));
    }

    this.time.delayedCall(600, () => {
      this.scene.start('GameOver', result);
    });
  }

  private showBanner(text: string): void {
    this.lastBanner = text;
    const width = measureText(text, 1) + 16;
    // This scene's camera is zoomed, so everything it draws is a world coordinate. The
    // banner keeps its authored position by going through `WORLD.scale` (screen px → world
    // px) rather than by drawing in the HUD's space.
    const centreX = WORLD.width / 2;
    const top = BANNER_Y * WORLD.scale;
    const plate = this.add.graphics().setDepth(199);
    plate.fillStyle(PALETTE.void, 0.9);
    plate.fillRect(centreX - width / 2, top, width, 22);
    plate.fillStyle(PALETTE.hotPink, 1);
    plate.fillRect(centreX - width / 2, top, 1, 22);

    const label = new PixelText(this, {
      x: centreX,
      y: top + 6,
      color: PALETTE.bone,
      scale: 1,
      align: 'center',
    })
      .setText(text)
      .setDepth(200);

    plate.setAlpha(0);
    label.setAlpha(0);

    this.tweens.add({
      targets: [plate, label],
      alpha: { from: 0, to: 1 },
      duration: 160,
      yoyo: true,
      hold: 900,
      onComplete: () => {
        plate.destroy();
        label.destroy();
      },
    });
  }

}

function safeEnemy(id: string) {
  try {
    return getEnemy(id);
  } catch {
    return null;
  }
}

/**
 * The content row for a prop id, with a passable stand-in for an id the table forgot.
 *
 * A missing row must never crash a run or silently turn a barrier into a wall that cannot
 * be resolved, so the fallback is the cheapest thing on the road: a soft, small box.
 */
function safeProp(id: string): { collision: PropCollision; halfWidth: number; halfHeight: number } {
  const def = findProp(id);
  if (def) return def;
  return { collision: 'soft', halfWidth: 8, halfHeight: 8 };
}

function safeCivilianId(id: string): string {
  try {
    getCivilian(id);
    return id;
  } catch {
    return 'sedan';
  }
}

function pickupColor(kind: string): 'amber' | 'teal' | 'signalRed' | 'bone' | 'violet' {
  switch (kind) {
    case 'oil':
      return 'violet';
    case 'smoke':
      return 'bone';
    case 'armour':
      return 'signalRed';
    case 'shield':
      return 'teal';
    default:
      return 'amber';
  }
}
