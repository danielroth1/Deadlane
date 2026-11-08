import Phaser from 'phaser';
import {
  BOSS,
  CAMERA,
  DIFFICULTY,
  GAME,
  LEVEL,
  MOTION,
  PLAYER,
  SCORE,
  SPAWN,
  TOUCH,
  WEAPON_FX,
  WORLD,
} from '@/config';
import { PALETTE } from '@/palette';
import { Art } from '@/art';
import { EFFECT_ART, pickupArtIds, propArtIds } from '@/art/ids';
import { flatTexture, pickupTexture, propTexture } from '@/art/placeholders';
import { PlayerVehicle, displayScale } from '@/entities/player';
import { EnemyVehicle } from '@/entities/enemy';
import { CivilianVehicle } from '@/entities/civilian';
import { BossVehicle } from '@/entities/boss';
import { getCivilian, getEnemy, getWeapon } from '@/content';
import { bossForLevel, type BossAttackPattern } from '@/systems/boss';
import {
  forwardShot,
  oilCatches,
  returnShot,
  screenYFromWorldAt,
  smokeBlocksFire,
  worldAtFromScreenY,
} from '@/systems/weapons';
import { levelForSeed, levelLabelFor, type LevelBlueprint } from '@/levels';
import { laneCenter, type LevelEvent } from '@/levels/types';
import { RoadSystem } from '@/systems/road';
import { acquireAudio, disposeAudio } from '@/systems/audio-registry';
import type { AudioSystem } from '@/systems/audio';
import { speedRatio, stepSpeed } from '@/systems/motion';
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
  /** World position, re-derived every frame: a hazard rides with the car. */
  at: number;
  readonly kind: 'oil' | 'smoke';
  /** Screen offset from the car's centre, px. Positive is behind, negative ahead. */
  readonly screenOffset: number;
  /** Mutable so a slick that has caught a pursuer can be spent on the spot. */
  expiresAt: number;
}

interface Pickup {
  readonly sprite: Phaser.GameObjects.Image;
  at: number;
  readonly x: number;
  readonly kind: string;
}

export interface HudState {
  score: number;
  armor: number;
  maxArmor: number;
  /** Lives left in the run. Separate from armour: armour refills on every respawn. */
  lives: number;
  maxLives: number;
  oil: number;
  smoke: number;
  speed: number;
  distance: number;
  level: number;
  levelLabel: string;
  challenge: string;
  challengeProgress: number;
  challengeTarget: number;
  muted: boolean;
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
  readonly hud: HudState;
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
  private pickups: Pickup[] = [];
  private props: { readonly sprite: Phaser.GameObjects.Image; readonly at: number }[] = [];
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
    this.pickups = [];
    this.props = [];
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
  }

  create(): void {
    this.art = new Art(this);
    this.audio = acquireAudio(this.registry);

    this.blueprint = levelForSeed(this.seed, this.levelIndex);

    this.road = new RoadSystem(this, this.blueprint.road, this.blueprint.type, this.art);
    this.player = new PlayerVehicle(this, this.art);

    this.challenges = this.createChallengeSystem();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,SPACE,SHIFT,X') as Record<
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
      speed: Math.round(this.worldSpeed),
      distance: Math.round(this.distance * LEVEL.metresPerPixel),
      level: this.levelIndex,
      levelLabel: this.blueprint ? levelLabelFor(this.blueprint.type) : '',
      challenge: this.challengeLabel,
      challengeProgress: this.challengeProgress,
      challengeTarget: this.challengeTarget,
      muted: this.audio?.isMuted ?? false,
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
      hud: this.hudState,
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
      this.blueprint.road,
      MOTION.cruiseSpeed * 0.3,
    );
    civilian.sprite.x = this.player.x;
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
    const speed = this.worldSpeed;
    this.distance += speed * dt;

    this.player.update(dt, this.steer, time);
    this.road.render(this.distance);
    this.audio.updateEngine(speedRatio(this.speed));

    this.spawnFromBlueprint();
    this.updateEnemies(dt, time);
    this.updateBoss(dt, time);
    this.updateCivilians(dt);
    this.updateBullets(dt);
    this.updateHazards(time);
    this.updatePickups(dt);
    this.updateProps();

    this.resolveCollisions(time);
    this.updateChallenge();
    // The sector transition is owned by the boss now: while one is alive the run holds,
    // and only a destroyed boss releases the boundary.
    this.updateActBoundary(time);

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
    const road = this.blueprint.road;

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
        const sprite = this.art
          .imageFrom(propArtIds(event.prop), laneCenter(road, event.lane), -60, () =>
            propTexture(this, event.prop, 'rust'),
          )
          .setDepth(20);
        this.props.push({ sprite, at: event.at });
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
      const wantsToFire = enemy.update(ctx, this.blueprint.road);
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

    const action = boss.update({
      now: time,
      dt,
      distance: this.distance,
      playerX: this.player.x,
    });

    if (action?.kind === 'fire') this.bossFire(boss, action.pattern);
  }

  /** Spawn the machine that closes this act. Called once, when the sector runs out. */
  private spawnBoss(time: number): void {
    // One sector is one act: the level type picks the machine and the sector number is the
    // act index that unlocks the higher-act variants in the content table.
    const act = this.levelIndex;
    const def = bossForLevel(this.blueprint.type, act);
    this.boss = new BossVehicle(this, this.art, def, this.distance, this.blueprint.road, time);
    this.showBanner(`ACT ${act} · ${def.label}`);
  }

  private bossFire(boss: BossVehicle, pattern: BossAttackPattern): void {
    // Boss shells reuse the hostile-shell path, so one `returnShot` still decides the lead
    // and the existing enemy-bullet collision still does the damage.
    const key = flatTexture(this, 'boss-bullet', 'amber', 9);
    const half = (pattern.shots - 1) / 2;

    for (let i = 0; i < pattern.shots; i += 1) {
      const x = boss.sprite.x + (i - half) * pattern.spreadPx;
      const sprite = this.add.image(x, boss.sprite.y, key).setDepth(45);
      this.bullets.push({
        sprite,
        ...returnShot({
          enemyX: x,
          enemyY: boss.sprite.y,
          playerX: this.player.x,
          playerY: this.player.y,
          distance: this.distance,
          scroll: this.worldSpeed,
          projectileSpeed: pattern.projectileSpeed,
          maxDrift: WEAPON_FX.maxShotDrift,
        }),
        from: 'enemy',
        damage: BOSS.shotDamage,
      });
    }

    this.audio.play('gun');
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

    const boom = this.art
      .imageFrom(EFFECT_ART.explosion, x, y, () =>
        flatTexture(this, 'explosion', 'amber', 34, 'white'),
      )
      .setDepth(60);
    this.tweens.add({
      targets: boom,
      scale: { from: 1.2, to: 3 },
      alpha: { from: 1, to: 0 },
      duration: 520,
      onComplete: () => boom.destroy(),
    });

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
      civilian.update(dt, this.distance);
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
   * Hazards ride with the car at a fixed screen offset.
   *
   * A world-static slick or cloud is left behind in a fraction of a second — the player
   * travels faster than anything else on the road, so a fixed effect would never be
   * crossed by a pursuer and would never sit between a hostile and the car.
   */
  private updateHazards(time: number): void {
    for (const hazard of this.hazards) {
      hazard.at = this.distance - hazard.screenOffset;
      hazard.sprite.y = screenYFromWorldAt(hazard.at, this.distance);
      hazard.sprite.setAlpha(Math.max(0, Math.min(1, (hazard.expiresAt - time) / 800)));
    }

    this.hazards = this.hazards.filter((hazard) => {
      const alive = time < hazard.expiresAt;
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

  private updateProps(): void {
    for (const prop of this.props) {
      prop.sprite.y = PLAYER.y + this.distance - prop.at;
    }
    this.props = this.props.filter((prop) => {
      if (prop.sprite.y > WORLD.height + 60) {
        prop.sprite.destroy();
        return false;
      }
      return true;
    });
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

    const y = this.player.y + WEAPON_FX.smokeOffset;
    const sprite = this.fitEffect(
      this.art.imageFrom(EFFECT_ART.smoke, this.player.x, y, () =>
        flatTexture(this, 'smoke', 'steelLight', 56),
      ),
      56,
    )
      .setDepth(35)
      .setAlpha(0.6);
    this.hazards.push({
      sprite,
      at: worldAtFromScreenY(y, this.distance),
      kind: 'smoke',
      screenOffset: WEAPON_FX.smokeOffset,
      expiresAt: time + (this.smokeWeapon.duration ?? 0),
    });
  }

  /** Drop an oil slick. Public so a touch pad drives the same path as X. */
  dropOil(time = this.time.now): void {
    if (!this.player.useOil(time, this.oilWeapon.cooldown)) return;

    const y = this.player.y + WEAPON_FX.oilOffset;
    const sprite = this.fitEffect(
      this.art.imageFrom(EFFECT_ART.oil, this.player.x, y, () =>
        flatTexture(this, 'oil', 'void', 40),
      ),
      40,
    )
      .setDepth(15)
      .setAlpha(0.85);
    this.hazards.push({
      sprite,
      at: worldAtFromScreenY(y, this.distance),
      kind: 'oil',
      screenOffset: WEAPON_FX.oilOffset,
      expiresAt: time + (this.oilWeapon.duration ?? 0),
    });
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
    // Player bullets vs enemies.
    for (const bullet of this.bullets) {
      if (bullet.from !== 'player') continue;
      for (const enemy of this.enemies) {
        if (Math.abs(bullet.sprite.x - enemy.sprite.x) < enemy.sprite.displayWidth * 0.45 &&
            Math.abs(bullet.sprite.y - enemy.sprite.y) < enemy.sprite.displayHeight * 0.45) {
          bullet.sprite.destroy();
          bullet.at = Number.NEGATIVE_INFINITY;

          if (enemy.hit(bullet.damage)) {
            this.killEnemy(enemy);
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
          bullet.sprite.destroy();
          bullet.at = Number.NEGATIVE_INFINITY;
          if (boss.hit(bullet.damage)) {
            this.defeatBoss(time);
            break;
          }
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

      bullet.sprite.destroy();
      bullet.at = Number.NEGATIVE_INFINITY;
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
        bullet.sprite.destroy();
        bullet.at = Number.NEGATIVE_INFINITY;
        this.damagePlayer(time);
      }
    }
    this.bullets = this.bullets.filter((b) => Number.isFinite(b.at));

    // Enemies vs player. A respawn clears the threats around the car, which replaces the
    // array this loop holds, so iterate the same array it started with and skip anything the
    // sweep already destroyed — a cleared pursuer must not pay a kill.
    for (const enemy of [...this.enemies]) {
      if (!enemy.sprite.active) continue;
      if (this.overlapsPlayer(enemy.sprite.x, enemy.sprite.y, enemy.sprite.displayWidth * 0.4, enemy.sprite.displayHeight * 0.4)) {
        enemy.hit(99);
        this.killEnemy(enemy);
        this.damagePlayer(time);
      }
    }

    // Civilians vs player. Hitting traffic costs score, but never armour: the road is
    // dense, and losing armour to unseen neutral cars reads as unfair rather than hard.
    for (const civilian of this.civilians) {
      if (civilian.wrecked) continue;
      if (this.overlapsPlayer(civilian.sprite.x, civilian.sprite.y, civilian.halfWidth, civilian.halfHeight)) {
        this.applyScore('civilianContact');
        this.wreckCivilian(civilian, 'CIVILIAN HIT');
      }
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

    // Oil slicks wreck the next pursuer that crosses them, then they are spent.
    for (const hazard of this.hazards) {
      if (hazard.kind !== 'oil') continue;

      const target = this.enemies.find((enemy) =>
        oilCatches(
          hazard.sprite,
          enemy.sprite,
          WEAPON_FX.oilCatchHalfWidth,
          WEAPON_FX.oilCatchHalfHeight,
        ),
      );
      if (!target) continue;

      hazard.expiresAt = time;
      target.hit(target.hp);
      this.killEnemy(target);
      this.score += SCORE.oilKill;
    }
  }

  private overlapsPlayer(x: number, y: number, hw: number, hh: number): boolean {
    return (
      Math.abs(x - this.player.x) < hw + this.player.halfWidth &&
      Math.abs(y - this.player.y) < hh + this.player.halfHeight
    );
  }

  private damagePlayer(time: number): void {
    // The scene keeps ticking during the game-over delay, and two collisions can land on
    // the same frame: once the run is over, nothing else may touch the wreck.
    if (this.runEnded) return;
    if (!this.player.takeHit(time)) return;
    this.cameras.main.shake(160, 0.008);
    this.audio.play('hit');
    // Armour and score are separate resources: a hit that the car survives costs no
    // points, so only a destroyed vehicle moves the score.
    this.applyScore('armourHit');

    if (this.player.isDestroyed) {
      this.spendLife(time);
    }
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
    this.player.respawn(time);
    this.speed = MOTION.cruiseSpeed;
    this.steer = 0;
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

  /** Shared civilian wreck: tint, challenge counter, feedback. Called by contact and fire. */
  private wreckCivilian(civilian: CivilianVehicle, banner: string): void {
    civilian.wreck(this.distance);
    this.challenges.notifyCivilianHit();
    this.cameras.main.shake(90, 0.005);
    this.audio.play('hit');
    this.showBanner(banner);
  }

  private killEnemy(enemy: EnemyVehicle): void {
    this.applyScore('enemyDestroyed');
    this.challenges.notifyKill();
    this.audio.play('explosion');
    this.cameras.main.shake(90, 0.004);

    const boom = this.art
      .imageFrom(EFFECT_ART.explosion, enemy.sprite.x, enemy.sprite.y, () =>
        flatTexture(this, 'explosion', 'amber', 34, 'white'),
      )
      .setDepth(60);
    this.tweens.add({
      targets: boom,
      scale: { from: 0.6, to: 1.6 },
      alpha: { from: 1, to: 0 },
      duration: 260,
      onComplete: () => boom.destroy(),
    });

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
    for (const pickup of this.pickups) pickup.sprite.destroy();
    for (const prop of this.props) prop.sprite.destroy();

    this.enemies = [];
    this.civilians = [];
    this.bullets = [];
    this.hazards = [];
    this.pickups = [];
    this.props = [];
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
    this.cameras.main.shake(400, 0.02);
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
