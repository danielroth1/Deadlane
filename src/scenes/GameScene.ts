import Phaser from 'phaser';
import { DIFFICULTY, GAME, LEVEL, PLAYER, SCORE, SPAWN, SPEED } from '@/config';
import { PALETTE } from '@/palette';
import { Art } from '@/art';
import { flatTexture, pickupTexture, propTexture } from '@/art/placeholders';
import { PlayerVehicle } from '@/entities/player';
import { EnemyVehicle } from '@/entities/enemy';
import { CivilianVehicle } from '@/entities/civilian';
import { getCivilian, getEnemy } from '@/content';
import { levelForSeed, typeForIndex, type LevelBlueprint } from '@/levels';
import { laneCenter, type LevelEvent } from '@/levels/types';
import { RoadSystem } from '@/systems/road';
import { AudioSystem } from '@/systems/audio';
import { ChallengeSystem } from '@/systems/challenges';
import { PixelText, measureText } from '@/ui/pixel-text';
import { seedFromLocation } from '@/rng';

interface Bullet {
  readonly sprite: Phaser.GameObjects.Image;
  at: number;
  readonly x: number;
  readonly speed: number;
  readonly from: 'player' | 'enemy';
  readonly damage: number;
}

interface Hazard {
  readonly sprite: Phaser.GameObjects.Image;
  at: number;
  readonly kind: 'oil' | 'smoke';
  readonly expiresAt: number;
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
  oil: number;
  smoke: number;
  speed: number;
  distance: number;
  level: number;
  levelLabel: string;
  challenge: string;
  challengeProgress: number;
  challengeTarget: number;
}

/**
 * The run.
 *
 * World model: everything lives at a monotonically increasing world distance `at`, and the
 * player sits at `distance`. Screen Y is `PLAYER.y + distance - at`, so a single number
 * drives scrolling, spawning and collision without any physics body bookkeeping.
 */
export class GameScene extends Phaser.Scene {
  private art!: Art;
  private audio!: AudioSystem;
  private road!: RoadSystem;
  private player!: PlayerVehicle;
  private challenges!: ChallengeSystem;

  private blueprint!: LevelBlueprint;
  private seed = 0;
  private levelIndex = 1;
  private distance = 0;
  private intensity = 0;
  private score = 0;
  private eventCursor = 0;

  private enemies: EnemyVehicle[] = [];
  private civilians: CivilianVehicle[] = [];
  private bullets: Bullet[] = [];
  private hazards: Hazard[] = [];
  private pickups: Pickup[] = [];
  private props: { readonly sprite: Phaser.GameObjects.Image; readonly at: number }[] = [];

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private steer = 0;
  private boostHeld = false;
  private brakeHeld = false;
  private challengeLabel = '';
  private challengeProgress = 0;
  private challengeTarget = 0;
  private paused = false;

  constructor() {
    super('Game');
  }

  init(data: { levelIndex?: number }): void {
    this.levelIndex = data.levelIndex ?? 1;
    this.seed = seedFromLocation(window.location.search, () => Date.now() % 0x7fffffff);
    this.distance = 0;
    this.intensity = 0;
    this.score = 0;
    this.eventCursor = 0;
    this.enemies = [];
    this.civilians = [];
    this.bullets = [];
    this.hazards = [];
    this.pickups = [];
    this.props = [];
    this.paused = false;
  }

  create(): void {
    this.art = new Art(this);
    this.audio = (this.registry.get('audio') as AudioSystem | undefined) ?? new AudioSystem();
    this.registry.set('audio', this.audio);

    this.blueprint = levelForSeed(this.seed, this.levelIndex);

    this.road = new RoadSystem(this, this.blueprint.road, this.blueprint.type);
    this.player = new PlayerVehicle(this, this.art);

    this.challenges = new ChallengeSystem(
      this.blueprint,
      (plan) => {
        this.score += 250;
        this.showBanner(`CHALLENGE COMPLETE · ${plan.label}`);
      },
      (plan) => {
        this.showBanner(`CHALLENGE FAILED · ${plan.label}`);
      },
    );

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,SPACE,SHIFT,ESC') as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;

    this.scene.launch('Hud', { game: this });
    this.input.keyboard!.on('keydown-ESC', () => this.togglePause());

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.audio.unlock();
      this.audio.play('gun');
    });

    this.cameras.main.setBackgroundColor(GAME.background);
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  /* ------------------------------- public API ------------------------------ */

  get hudState(): HudState {
    const challenge = this.challenges?.update(this.distance);
    return {
      score: Math.max(0, Math.round(this.score)),
      armor: this.player?.armor ?? 0,
      maxArmor: PLAYER.maxArmor,
      oil: this.player?.oil ?? 0,
      smoke: this.player?.smoke ?? 0,
      speed: this.currentScroll(),
      distance: Math.round(this.distance * LEVEL.metresPerPixel),
      level: this.levelIndex,
      levelLabel: this.blueprint?.type.toUpperCase() ?? '',
      challenge: this.challengeLabel,
      challengeProgress: this.challengeProgress,
      challengeTarget: this.challengeTarget,
    };
  }

  /* --------------------------------- update -------------------------------- */

  override update(time: number, delta: number): void {
    if (this.paused || !this.player) return;

    const dt = Math.min(delta, 50) / 1000;

    this.readInput(time);
    this.intensity = this.computeIntensity(dt);

    const scroll = this.currentScroll();
    this.distance += scroll * dt;

    this.player.update(dt, this.steer, time);
    this.road.render(this.distance);
    this.audio.updateEngine(Math.min(1, scroll / (SPEED.baseScroll + SPEED.maxScrollBonus)));

    this.spawnFromBlueprint();
    this.updateEnemies(dt, scroll, time);
    this.updateCivilians(dt, scroll);
    this.updateBullets(dt);
    this.updateHazards(dt, time);
    this.updatePickups(dt);
    this.updateProps();

    this.resolveCollisions(time);
    this.updateChallenge();

    if (this.distance > this.blueprint.length) {
      this.advanceLevel();
    }

    this.score += dt * (this.currentScroll() / SCORE.distancePerPoint) * 0.15;
  }

  /* --------------------------------- input --------------------------------- */

  private readInput(time: number): void {
    let steer = 0;
    if (this.cursors.left?.isDown || this.keys['A']?.isDown) steer -= 1;
    if (this.cursors.right?.isDown || this.keys['D']?.isDown) steer += 1;

    // Pointer control: dragging steers toward the pointer.
    const pointer = this.input.activePointer;
    if (pointer.isDown) {
      const dx = pointer.worldX - this.player.x;
      if (Math.abs(dx) > 12) steer += Math.sign(dx);
    }

    this.steer = Math.max(-1, Math.min(1, steer));
    this.boostHeld = Boolean(this.cursors.up?.isDown || this.keys['W']?.isDown);
    this.brakeHeld = Boolean(this.cursors.down?.isDown || this.keys['S']?.isDown);

    if (this.keys['SPACE']?.isDown && this.player.canFire(time)) {
      this.fire();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys['SHIFT']!)) {
      this.dropSmoke(time);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys['ESC']!)) {
      this.togglePause();
    }
  }

  private currentScroll(): number {
    const profile = this.blueprint?.scrollMultiplier ?? 1;
    const base = SPEED.baseScroll + SPEED.maxScrollBonus * this.intensity;
    const boost = this.boostHeld ? SPEED.boost : this.brakeHeld ? SPEED.brake : 1;
    return base * profile * boost;
  }

  private computeIntensity(dt: number): number {
    const timeFactor = Math.min(1, this.distance / (LEVEL.lengthPixels * 0.9));
    const target = Math.min(1, timeFactor * 0.8 + (this.levelIndex - 1) * 0.1);
    return this.intensity + (target - this.intensity) * Math.min(1, dt / DIFFICULTY.smoothing / 1000 + dt * 0.4);
  }

  /* -------------------------------- spawning ------------------------------- */

  private spawnFromBlueprint(): void {
    const horizon = this.distance + GAME.height + 120;

    while (this.eventCursor < this.blueprint.events.length) {
      const event = this.blueprint.events[this.eventCursor]!;
      if (event.at > horizon) break;
      this.eventCursor += 1;
      this.spawnEvent(event);
    }
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
        const key = pickupTexture(this, event.pickup, pickupColor(event.pickup));
        const sprite = this.add.image(laneCenter(road, event.lane), -60, key).setDepth(25);
        this.pickups.push({ sprite, at: event.at, x: sprite.x, kind: event.pickup });
        break;
      }
      case 'prop': {
        const key = propTexture(this, event.prop, 'rust');
        const sprite = this.add.image(laneCenter(road, event.lane), -60, key).setDepth(20);
        this.props.push({ sprite, at: event.at });
        break;
      }
      default:
        break;
    }
  }

  /* ------------------------------- entities -------------------------------- */

  private updateEnemies(dt: number, scroll: number, time: number): void {
    const ctx = {
      now: time,
      dt,
      scroll,
      distance: this.distance,
      playerX: this.player.x,
    };

    for (const enemy of this.enemies) {
      const wantsToFire = enemy.update(ctx, this.blueprint.road);
      if (wantsToFire) this.enemyFire(enemy);
    }

    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.isOffscreen) {
        enemy.destroy();
        return false;
      }
      return true;
    });
  }

  private updateCivilians(dt: number, scroll: number): void {
    for (const civilian of this.civilians) {
      civilian.update(dt, scroll, this.distance);
    }
    this.civilians = this.civilians.filter((c) => {
      if (c.isOffscreen) {
        c.destroy();
        return false;
      }
      return true;
    });
  }

  private updateBullets(dt: number): void {
    for (const bullet of this.bullets) {
      bullet.at += bullet.speed * dt;
      bullet.sprite.y = PLAYER.y + this.distance - bullet.at;
    }
    this.bullets = this.bullets.filter((bullet) => {
      const visible = bullet.sprite.y > -40 && bullet.sprite.y < GAME.height + 40;
      if (!visible) bullet.sprite.destroy();
      return visible;
    });
  }

  private updateHazards(dt: number, time: number): void {
    for (const hazard of this.hazards) {
      hazard.at += 0;
      hazard.sprite.y = PLAYER.y + this.distance - hazard.at;
      hazard.sprite.setAlpha(Math.max(0, Math.min(1, (hazard.expiresAt - time) / 800)));
      void dt;
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
      if (pickup.sprite.y > GAME.height + 40) {
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
      if (prop.sprite.y > GAME.height + 60) {
        prop.sprite.destroy();
        return false;
      }
      return true;
    });
  }

  /* -------------------------------- weapons -------------------------------- */

  private fire(): void {
    const key = flatTexture(this, 'bullet', 'white', 6);
    const left = this.add.image(this.player.x - 10, this.player.y - 26, key).setDepth(45);
    const right = this.add.image(this.player.x + 10, this.player.y - 26, key).setDepth(45);

    for (const sprite of [left, right]) {
      this.bullets.push({
        sprite,
        at: this.distance + (PLAYER.y - sprite.y),
        x: sprite.x,
        speed: 640,
        from: 'player',
        damage: 1,
      });
    }
    this.audio.play('gun');
  }

  private enemyFire(enemy: EnemyVehicle): void {
    const key = flatTexture(this, 'enemy-bullet', 'signalRed', 7);
    const sprite = this.add.image(enemy.sprite.x, enemy.sprite.y, key).setDepth(45);
    this.bullets.push({
      sprite,
      at: this.distance - (PLAYER.y - enemy.sprite.y),
      x: enemy.sprite.x,
      speed: -(enemy.def.projectileSpeed ?? 220),
      from: 'enemy',
      damage: 1,
    });
  }

  private dropSmoke(time: number): void {
    if (!this.player.useSmoke()) return;
    const key = flatTexture(this, 'smoke', 'steelLight', 56);
    const sprite = this.add.image(this.player.x, this.player.y + 30, key).setDepth(35).setAlpha(0.6);
    this.hazards.push({ sprite, at: this.distance - 30, kind: 'smoke', expiresAt: time + 4500 });
  }

  private dropOil(time: number): void {
    if (!this.player.useOil()) return;
    const key = flatTexture(this, 'oil', 'void', 40);
    const sprite = this.add.image(this.player.x, this.player.y + 30, key).setDepth(15).setAlpha(0.85);
    this.hazards.push({ sprite, at: this.distance - 30, kind: 'oil', expiresAt: time + 7000 });
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
    this.bullets = this.bullets.filter((b) => Number.isFinite(b.at));

    // Enemy bullets vs player.
    for (const bullet of this.bullets) {
      if (bullet.from !== 'enemy') continue;
      if (this.overlapsPlayer(bullet.sprite.x, bullet.sprite.y, 6, 6)) {
        bullet.sprite.destroy();
        bullet.at = Number.NEGATIVE_INFINITY;
        this.damagePlayer(time);
      }
    }
    this.bullets = this.bullets.filter((b) => Number.isFinite(b.at));

    // Enemies vs player.
    for (const enemy of this.enemies) {
      if (this.overlapsPlayer(enemy.sprite.x, enemy.sprite.y, enemy.sprite.displayWidth * 0.4, enemy.sprite.displayHeight * 0.4)) {
        enemy.hit(99);
        this.killEnemy(enemy);
        this.damagePlayer(time);
      }
    }

    // Civilians vs player. Hitting traffic is a score penalty, not a life: the road is
    // dense, and losing armour to unseen neutral cars reads as unfair rather than hard.
    for (const civilian of this.civilians) {
      if (civilian.wrecked) continue;
      if (this.overlapsPlayer(civilian.sprite.x, civilian.sprite.y, civilian.halfWidth, civilian.halfHeight)) {
        civilian.wreck(this.distance);
        this.challenges.notifyCivilianHit();
        this.score = Math.max(0, this.score + SCORE.civilianHit);
        this.cameras.main.shake(90, 0.005);
        this.audio.play('hit');
        this.showBanner('CIVILIAN HIT');
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

    // Oil slicks catch hostiles behind the player.
    for (const hazard of this.hazards) {
      if (hazard.kind !== 'oil') continue;
      if (hazard.sprite.y < PLAYER.y - 80) {
        for (const enemy of this.enemies) {
          if (Math.abs(enemy.sprite.y - hazard.sprite.y) < 30 &&
              Math.abs(enemy.sprite.x - hazard.sprite.x) < 34) {
            enemy.hit(99);
            this.killEnemy(enemy);
            this.score += SCORE.oilKill;
          }
        }
      }
    }
  }

  private overlapsPlayer(x: number, y: number, hw: number, hh: number): boolean {
    return (
      Math.abs(x - this.player.x) < hw + this.player.halfWidth &&
      Math.abs(y - this.player.y) < hh + this.player.halfHeight
    );
  }

  private damagePlayer(time: number): void {
    if (!this.player.takeHit(time)) return;
    this.cameras.main.shake(160, 0.008);
    this.audio.play('hit');
    this.score = Math.max(0, this.score + SCORE.civilianHit * 0.2);

    if (this.player.isDestroyed) {
      this.endRun();
    }
  }

  private killEnemy(enemy: EnemyVehicle): void {
    this.score += enemy.def.score;
    this.challenges.notifyKill();
    this.audio.play('explosion');
    this.cameras.main.shake(90, 0.004);

    const key = flatTexture(this, 'explosion', 'amber', 34, 'white');
    const boom = this.add.image(enemy.sprite.x, enemy.sprite.y, key).setDepth(60);
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

  private updateChallenge(): void {
    const state = this.challenges.update(this.distance);
    if (!state) return;
    this.challengeLabel = state.label;
    this.challengeProgress = state.progress;
    this.challengeTarget = state.target;
  }

  /* --------------------------------- flow ---------------------------------- */

  private advanceLevel(): void {
    this.levelIndex += 1;
    this.blueprint = levelForSeed(this.seed, this.levelIndex);
    this.distance = 0;
    this.eventCursor = 0;
    this.intensity = Math.max(0.2, this.intensity * 0.7);

    this.road.destroy();
    this.road = new RoadSystem(this, this.blueprint.road, this.blueprint.type);

    this.challenges = new ChallengeSystem(
      this.blueprint,
      (plan) => {
        this.score += 300;
        this.showBanner(`CHALLENGE COMPLETE · ${plan.label}`);
      },
      (plan) => this.showBanner(`CHALLENGE FAILED · ${plan.label}`),
    );

    this.showBanner(`SECTOR ${this.levelIndex} · ${typeForIndex(this.levelIndex).toUpperCase()}`);
  }

  private endRun(): void {
    this.audio.play('engineFail');
    this.cameras.main.shake(400, 0.02);
    this.scene.stop('Hud');

    const best = Number(localStorage.getItem(`${GAME.storagePrefix}best`) ?? '0');
    if (this.score > best) {
      localStorage.setItem(`${GAME.storagePrefix}best`, String(Math.round(this.score)));
    }

    this.time.delayedCall(600, () => {
      this.scene.start('GameOver', {
        score: Math.max(0, Math.round(this.score)),
        distance: Math.round(this.distance * LEVEL.metresPerPixel),
        level: this.levelIndex,
        seed: this.seed,
      });
    });
  }

  private togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) {
      this.scene.pause();
      this.showBanner('PAUSED · ESC TO RESUME');
    }
  }

  private showBanner(text: string): void {
    const width = measureText(text, 1) + 16;
    const plate = this.add.graphics().setDepth(199);
    plate.fillStyle(PALETTE.void, 0.9);
    plate.fillRect(GAME.width / 2 - width / 2, 58, width, 22);
    plate.fillStyle(PALETTE.hotPink, 1);
    plate.fillRect(GAME.width / 2 - width / 2, 58, 1, 22);

    const label = new PixelText(this, {
      x: GAME.width / 2,
      y: 64,
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

  /** Exposed for the HUD's oil button and for tests. */
  dropOilPublic(time = this.time.now): void {
    this.dropOil(time);
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
