import type Phaser from 'phaser';
import { PLAYER, ROAD } from '@/config';
import { PALETTE } from '@/palette';
import type { Art } from '@/art';

/**
 * The player Interceptor.
 *
 * Deliberately thin: it owns position, resources and invulnerability, and nothing about
 * the world. The scene decides what a collision means; the vehicle only knows how to move
 * and how to look like it is moving.
 */

const ART_CANDIDATES = [
  'player-vehicle/interceptor-clean',
  'player-vehicle/interceptor',
  'player-vehicle/clean',
];

/** The three weapons the car carries; cadence and lifetimes live in `weapons.json`. */
export type WeaponId = 'gun' | 'oil' | 'smoke';

/** Collision half-width as a fraction of the displayed sprite width. */
export const HALF_WIDTH_RATIO = 0.36;
/** Collision half-height as a fraction of the displayed sprite height. */
export const HALF_HEIGHT_RATIO = 0.42;

/**
 * Scale that draws a native frame at the target on-screen footprint.
 *
 * The art sheet is 128 px per cell and the placeholder is 64 px, so the factor differs
 * per source. A zero-sized texture (a frame that failed to load) falls back to 1 rather
 * than dividing by zero.
 */
export function displayScale(nativeSize: number, targetSize: number = PLAYER.spriteSize): number {
  return nativeSize > 0 ? targetSize / nativeSize : 1;
}

export class PlayerVehicle {
  readonly sprite: Phaser.GameObjects.Image;

  armor: number = PLAYER.startArmor;
  oil: number = PLAYER.startOil;
  smoke: number = PLAYER.startSmoke;

  private invulnerableUntil = 0;
  /** When each weapon last fired, so its content cooldown can be enforced. */
  private readonly lastUsedAt: Record<WeaponId, number> = {
    gun: Number.NEGATIVE_INFINITY,
    oil: Number.NEGATIVE_INFINITY,
    smoke: Number.NEGATIVE_INFINITY,
  };
  private baseY = PLAYER.y;
  private readonly baseX: number;

  constructor(
    private readonly scene: Phaser.Scene,
    art: Art,
  ) {
    this.baseX = ROAD.left + ROAD.width / 2;
    this.sprite = art.imageAny(ART_CANDIDATES, this.baseX, this.baseY, () => ({
      shape: 'wedge',
      // Steel rather than matte black: at 64px on an asphalt road, a black car reads as a
      // hole. Real art can go darker because it will have a proper outline and highlights.
      bodyColor: 'steel',
      accentColor: 'hotPink',
      faction: 'player',
      size: 64,
    }));
    // Draw at a fixed on-screen footprint regardless of the source frame size: the art
    // sheet is 128 px per cell, the procedural placeholder is 64 px, and both must read
    // as one lane wide.
    const nativeSize = Math.max(this.sprite.width, this.sprite.height);
    this.sprite.setScale(displayScale(nativeSize));
    this.sprite.setDepth(50);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get isInvulnerable(): boolean {
    return this.scene.time.now < this.invulnerableUntil;
  }

  /** Half-extents used for collision against other vehicles. */
  get halfWidth(): number {
    return this.sprite.displayWidth * HALF_WIDTH_RATIO;
  }

  get halfHeight(): number {
    return this.sprite.displayHeight * HALF_HEIGHT_RATIO;
  }

  /** Steering with a speed-dependent lean, plus a constant engine jitter. */
  update(dt: number, steer: number, time: number): void {
    const dx = steer * PLAYER.lateralSpeed * dt;
    const minX = ROAD.left + this.sprite.displayWidth * 0.28;
    const maxX = ROAD.left + ROAD.width - this.sprite.displayWidth * 0.28;

    this.sprite.x = Math.max(minX, Math.min(maxX, this.sprite.x + dx));

    const lean = Math.abs(steer) > 0.1 ? Math.sign(steer) * 2.5 : 0;
    this.sprite.setRotation((lean * Math.PI) / 180);

    // 1px engine vibration at a fixed rate, so it reads as mechanical, not random.
    const jitter = Math.sin(time * 0.05) > 0.6 ? 1 : 0;
    this.sprite.y = this.baseY + jitter;

    if (this.isInvulnerable) {
      this.sprite.setAlpha(0.55 + 0.45 * Math.abs(Math.sin(time * 0.02)));
    } else {
      this.sprite.setAlpha(1);
    }
  }

  /** True when `cooldown` ms have passed since this weapon last fired. */
  canUseWeapon(id: WeaponId, time: number, cooldown: number): boolean {
    return time - this.lastUsedAt[id] >= cooldown;
  }

  /** Pull the trigger. Returns false while the gun is still cooling down. */
  canFire(time: number, cooldown: number): boolean {
    if (!this.canUseWeapon('gun', time, cooldown)) return false;
    this.lastUsedAt.gun = time;
    return true;
  }

  useOil(time: number, cooldown: number): boolean {
    if (this.oil <= 0 || !this.canUseWeapon('oil', time, cooldown)) return false;
    this.oil -= 1;
    this.lastUsedAt.oil = time;
    return true;
  }

  useSmoke(time: number, cooldown: number): boolean {
    if (this.smoke <= 0 || !this.canUseWeapon('smoke', time, cooldown)) return false;
    this.smoke -= 1;
    this.lastUsedAt.smoke = time;
    return true;
  }

  addOil(n = 1): void {
    this.oil = Math.min(PLAYER.maxOil, this.oil + n);
  }

  addSmoke(n = 1): void {
    this.smoke = Math.min(PLAYER.maxSmoke, this.smoke + n);
  }

  addArmor(n = 1): void {
    this.armor = Math.min(PLAYER.maxArmor, this.armor + n);
  }

  /**
   * Apply one hit.
   *
   * Returns true when the hit landed. Armour absorbs it and grants a short invulnerability
   * window; at zero armour the run ends.
   */
  takeHit(time: number): boolean {
    if (this.isInvulnerable) return false;
    this.armor -= 1;
    this.invulnerableUntil = time + PLAYER.iFrames;
    this.flash();
    return true;
  }

  get isDestroyed(): boolean {
    return this.armor <= 0;
  }

  private flash(): void {
    this.sprite.setTint(PALETTE.signalRed);
    this.scene.time.delayedCall(120, () => this.sprite.clearTint());
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
