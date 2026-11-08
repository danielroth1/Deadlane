import type Phaser from 'phaser';
import { PLAYER, ROAD, WORLD } from '@/config';
import { PALETTE } from '@/palette';
import type { Art, VehicleOptions } from '@/art';

/**
 * The player Interceptor.
 *
 * Deliberately thin: it owns position, resources and invulnerability, and nothing about
 * the world. The scene decides what a collision means; the vehicle only knows how to move
 * and how to look like it is moving.
 */

/** The visual states the player car can show. */
export type PlayerArtState = 'clean' | 'damaged' | 'wrecked';

/** Sprite ids per visual state, most specific first. */
const ART_IDS_BY_STATE: Record<PlayerArtState, readonly string[]> = {
  // The clean list keeps the historical aliases so a renamed cell degrades to the next
  // best sprite rather than a placeholder.
  clean: ['player-vehicle/interceptor-clean', 'player-vehicle/interceptor', 'player-vehicle/clean'],
  damaged: ['player-vehicle/interceptor-damaged'],
  wrecked: ['player-vehicle/interceptor-wrecked'],
};

/**
 * Pick the player's visual state from remaining armour.
 *
 * Wrecked at zero armour; damaged once any armour below the starting loadout has been
 * lost; clean at or above the starting loadout. Pure, so the tier boundaries are testable.
 */
export function playerArtState(armor: number): PlayerArtState {
  if (armor <= 0) return 'wrecked';
  if (armor < PLAYER.startArmor) return 'damaged';
  return 'clean';
}

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
  private readonly baseX: number;
  private artState: PlayerArtState = 'clean';
  /** Wrecked is terminal: the run is over, so no later repair may swap the frame back. */
  private wrecked = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly art: Art,
  ) {
    // The road is centred on the world aperture, so its middle is the aperture's middle.
    this.baseX = WORLD.width / 2;
    this.sprite = this.art.imageAny(ART_IDS_BY_STATE.clean, this.baseX, PLAYER.y, () =>
      this.placeholder(),
    );
    // Draw at a fixed on-screen footprint regardless of the source frame size: the art
    // sheet is 128 px per cell, the procedural placeholder is 64 px, and both must read
    // as one lane wide.
    this.sprite.setScale(this.footprintScale());
    this.sprite.setDepth(50);
  }

  /** Options for the procedural stand-in used when no player sheet is available. */
  private placeholder(): VehicleOptions {
    return {
      shape: 'wedge',
      // Steel rather than matte black: at 64px on an asphalt road, a black car reads as a
      // hole. Real art can go darker because it will have a proper outline and highlights.
      bodyColor: 'steel',
      accentColor: 'hotPink',
      faction: 'player',
      size: 64,
    };
  }

  /** Scale that puts the current frame at the on-screen footprint. */
  private footprintScale(): number {
    return displayScale(Math.max(this.sprite.width, this.sprite.height));
  }

  /** Swap to the frame for `state`, keeping the sheet and placeholder paths equivalent. */
  private setArtState(state: PlayerArtState): void {
    if (state === 'wrecked') {
      this.wrecked = true;
    } else if (this.wrecked) {
      // `endRun()` returns immediately and the scene keeps ticking through the 600 ms
      // game-over delay, so a pickup overlapping the wreck calls `refreshArt()`. Without
      // this guard the wreck would be repainted as a damaged car during the exact window
      // it exists to fill.
      return;
    }
    if (state === this.artState) return;
    this.artState = state;
    const ref = this.art.refAny(ART_IDS_BY_STATE[state], () => this.placeholder());
    this.sprite.setTexture(ref.key, ref.frame);
    this.sprite.setScale(this.footprintScale());
  }

  /** Re-pick the frame after armour changes. */
  private refreshArt(): void {
    this.setArtState(playerArtState(this.armor));
  }

  /** Show the wrecked frame; the scene calls this as the run ends. */
  showWrecked(): void {
    this.setArtState('wrecked');
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

  /**
   * Steering with a speed-dependent lean.
   *
   * The car holds its vertical station exactly: `PLAYER.y` is the centre of the aperture and
   * the road projection is anchored there, so nothing here may nudge `y`. The old 1 px engine
   * jitter was written for a car pinned to the bottom edge; at dead centre it reads as the
   * whole frame shaking rather than the engine idling.
   */
  update(dt: number, steer: number, time: number): void {
    const dx = steer * PLAYER.lateralSpeed * dt;
    const minX = ROAD.left + this.sprite.displayWidth * 0.28;
    const maxX = ROAD.left + ROAD.width - this.sprite.displayWidth * 0.28;

    this.sprite.x = Math.max(minX, Math.min(maxX, this.sprite.x + dx));

    // Lean once the lateral velocity clears the shared threshold, not at an arbitrary
    // fraction of full tilt.
    const lateralVelocity = Math.abs(steer) * PLAYER.lateralSpeed;
    const lean = lateralVelocity > PLAYER.leanThreshold ? Math.sign(steer) * 2.5 : 0;
    this.sprite.setRotation((lean * Math.PI) / 180);
    this.sprite.y = PLAYER.y;

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
    this.refreshArt();
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
    this.refreshArt();
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
