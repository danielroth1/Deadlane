import type Phaser from 'phaser';
import { COLLISION, JUMP, OFFROAD, PLAYER, WORLD } from '@/config';
import { PALETTE } from '@/palette';
import type { RoadProfile } from '@/levels/types';
import type { Art, VehicleOptions } from '@/art';
import { clamp, easeTowards } from '@/systems/motion';
import { advanceJump, createJump, isAirborne, jumpHeight, type JumpState } from '@/systems/jump';

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

/** The weapons the car carries; cadence, ranges and lifetimes live in `weapons.json`. */
export type WeaponId = 'gun' | 'oil' | 'smoke' | 'rocket' | 'flame';

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
  rockets: number = PLAYER.startRockets;
  flame: number = PLAYER.startFlame;

  private invulnerableUntil = 0;
  /**
   * The ramp jump in progress, or null on the ground.
   *
   * The arc itself lives in `systems/jump.ts`: this car only remembers when it took off.
   * Airborne is read by the scene, which skips ground contact and draws the shadow.
   */
  private jumpState: JumpState | null = null;
  /** Lateral speed the steering asked for this frame, px/s. Recorded for the contact pass. */
  private steerVelocity = 0;
  /** Lateral speed a contact gave the car, px/s. Bleeds off at `COLLISION.impulseDrag`. */
  private impulseX = 0;
  /** When the control wobble of the last hard hit starts, and when it ends. */
  private wobbleFrom = 0;
  private wobbleUntil = 0;
  /**
   * Scene-clock time a contact weapon holds the wheel until.
   *
   * Separate from the wobble: a wobble adds a decaying steer, a lock removes the player's
   * steer entirely. Both are clock-derived, so a seeded run loses the wheel the same way.
   */
  private steerLockUntil = 0;
  /** When each weapon last fired, so its content cooldown can be enforced. */
  private readonly lastUsedAt: Record<WeaponId, number> = {
    gun: Number.NEGATIVE_INFINITY,
    oil: Number.NEGATIVE_INFINITY,
    smoke: Number.NEGATIVE_INFINITY,
    rocket: Number.NEGATIVE_INFINITY,
    flame: Number.NEGATIVE_INFINITY,
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

  /**
   * The car's road station, independent of jump height.
   *
   * Collision still happens here while the car is airborne, which is what keeps a jump from
   * becoming immunity: shells are aimed at the road, and the road is where the car's box
   * stays for them.
   */
  get groundY(): number {
    return PLAYER.y;
  }

  get isInvulnerable(): boolean {
    return this.scene.time.now < this.invulnerableUntil;
  }

  /** Take off from a ramp. */
  jump(durationMs: number = JUMP.durationMs): void {
    this.jumpState = createJump(durationMs);
  }

  /** True while the car is off the ground. The scene skips ground contact on this. */
  get isAirborne(): boolean {
    return isAirborne(this.jumpState);
  }

  /** Height above the road, px: what the sprite and the shadow are drawn from. */
  get airHeight(): number {
    return jumpHeight(this.jumpState, JUMP.apexHeight);
  }

  /** Half-extents used for collision against other vehicles. */
  get halfWidth(): number {
    return this.sprite.displayWidth * HALF_WIDTH_RATIO;
  }

  get halfHeight(): number {
    return this.sprite.displayHeight * HALF_HEIGHT_RATIO;
  }

  /** Lateral velocity this frame, world px/s: what the steering asked for plus any impulse. */
  get vx(): number {
    return this.steerVelocity + this.impulseX;
  }

  /**
   * Velocity down-screen, px/s. Always zero.
   *
   * The car holds its station on the road, so it never moves down the screen however hard
   * something hits it; the contact pass reads this and puts the whole vertical share of a
   * hit onto the other car.
   */
  get vy(): number {
    return 0;
  }

  /** True: `PLAYER.y` is the road projection's anchor, so the car is pinned to it. */
  get pinnedY(): boolean {
    return true;
  }

  /** True while a contact weapon is holding the wheel. Read by the debug surface. */
  get isSteerLocked(): boolean {
    return this.scene.time.now < this.steerLockUntil;
  }

  /**
   * Take a contact's positional correction, world px.
   *
   * Lateral only, for the same reason `vy` is zero: a vertical correction is applied to the
   * other car by the contact pass.
   */
  shift(dx: number): void {
    this.sprite.x += dx;
  }

  /**
   * Take a contact's impulse, world px/s.
   *
   * Replaces the live impulse rather than adding to it: contacts are resolved once per
   * frame, and the last one is the one that moved the car.
   */
  applyImpulse(vx: number): void {
    this.impulseX = vx;
  }

  /**
   * Add a lateral kick to the live impulse.
   *
   * Used by the signature side weapons: their shove arrives after the contact resolver has
   * already given the car a parting impulse, and the two have to be felt together rather
   * than the later one replacing the earlier.
   */
  addImpulse(vx: number): void {
    this.impulseX += vx;
  }

  /**
   * Hold the wheel for `ms` after a side weapon lands.
   *
   * A longer lock replaces a shorter one, so an EMP that catches an already-harpooned car
   * cannot shorten its blackout. Nothing here touches the car's velocity: the shove and the
   * lock are separate, which is what lets the car be thrown sideways while it is unsteerable.
   */
  lockSteering(time: number, ms: number): void {
    this.steerLockUntil = Math.max(this.steerLockUntil, time + Math.max(0, ms));
  }

  /**
   * Start the short steering wobble a hard hit leaves behind.
   *
   * A decaying sine of the scene clock, not a random walk: the same run at the same frame
   * rate wobbles the same way every time, which is what keeps a seeded run reproducible.
   */
  wobble(time: number): void {
    this.wobbleFrom = time;
    this.wobbleUntil = time + COLLISION.wobbleMs;
  }

  /** Additive steering, `-COLLISION.wobbleSteer`–`+`, from a live wobble. Zero without one. */
  private wobbleAt(time: number): number {
    if (time >= this.wobbleUntil) return 0;
    const age = Math.max(0, time - this.wobbleFrom) / 1000;
    const decay = (this.wobbleUntil - time) / COLLISION.wobbleMs;
    return (
      Math.sin(age * COLLISION.wobbleHz * Math.PI * 2) * COLLISION.wobbleSteer * decay
    );
  }

  /**
   * Steering with a speed-dependent lean.
   *
   * The car holds its vertical station exactly: `PLAYER.y` is the centre of the aperture and
   * the road projection is anchored there, so nothing here may nudge `y`. The old 1 px engine
   * jitter was written for a car pinned to the bottom edge; at dead centre it reads as the
   * whole frame shaking rather than the engine idling.
   *
   * The car is no longer pinned to the paint. It may cross the shoulder onto the apron —
   * `OFFROAD.apron` px of rough ground past each edge — and the scene decides what that
   * costs. The clamp is still here so a steering mistake cannot leave the world, and it is
   * the only thing that limits how far out the car can get.
   *
   * Returns true on the frame the ramp jump ends, which is where the scene fires its landing
   * effect. The car is lifted by `airHeight` while airborne and back on `PLAYER.y` when it
   * lands.
   */
  update(dt: number, steer: number, time: number, road: RoadProfile): boolean {
    // Advance the jump before reading its height, so the sprite is drawn at this frame's
    // altitude and a landing frame is exactly on the road.
    const step = this.jumpState ? advanceJump(this.jumpState, dt * 1000) : null;
    if (step) this.jumpState = step.state;
    const landed = step?.landed ?? false;

    // A hard hit takes the wheel for a moment: the wobble is added to whatever the player
    // asked for, and the sum stays inside one full lock so the car cannot outrun its own
    // lateral speed. A side weapon's lock removes the player's input entirely; the wobble
    // still applies once the lock expires.
    const locked = time < this.steerLockUntil;
    const steering = locked ? 0 : clamp(steer + this.wobbleAt(time), -1, 1);
    this.steerVelocity = steering * PLAYER.lateralSpeed;

    const dx = (this.steerVelocity + this.impulseX) * dt;
    const minX = road.left - OFFROAD.apron;
    const maxX = road.left + road.width + OFFROAD.apron;

    this.sprite.x = Math.max(minX, Math.min(maxX, this.sprite.x + dx));
    this.impulseX = easeTowards(this.impulseX, 0, COLLISION.impulseDrag * dt);

    // Lean once the lateral velocity clears the shared threshold, not at an arbitrary
    // fraction of full tilt.
    const lateralVelocity = Math.abs(steering) * PLAYER.lateralSpeed;
    const lean = lateralVelocity > PLAYER.leanThreshold ? Math.sign(steering) * 2.5 : 0;
    this.sprite.setRotation((lean * Math.PI) / 180);
    this.sprite.y = PLAYER.y - this.airHeight;

    if (this.isInvulnerable) {
      this.sprite.setAlpha(0.55 + 0.45 * Math.abs(Math.sin(time * 0.02)));
    } else {
      this.sprite.setAlpha(1);
    }

    return landed;
  }

  /** True when the car's centre is outside the drivable surface at `road`. */
  isOffRoad(road: RoadProfile): boolean {
    return this.sprite.x < road.left || this.sprite.x > road.left + road.width;
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

  /** Launch one rocket. False while the tube is empty or still cooling down. */
  useRocket(time: number, cooldown: number): boolean {
    if (this.rockets <= 0 || !this.canUseWeapon('rocket', time, cooldown)) return false;
    this.rockets -= 1;
    this.lastUsedAt.rocket = time;
    return true;
  }

  /** Fire one flame burst. False with no fuel left or while the burner is recovering. */
  useFlame(time: number, cooldown: number): boolean {
    if (this.flame <= 0 || !this.canUseWeapon('flame', time, cooldown)) return false;
    this.flame -= 1;
    this.lastUsedAt.flame = time;
    return true;
  }

  addRockets(n = 1): void {
    this.rockets = Math.min(PLAYER.maxRockets, this.rockets + n);
  }

  addFlame(n = 1): void {
    this.flame = Math.min(PLAYER.maxFlame, this.flame + n);
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
   * window; at zero armour the car is wrecked and the scene decides what that costs — a
   * life, or the run.
   */
  takeHit(time: number): boolean {
    if (this.isInvulnerable) return false;
    this.armor -= 1;
    this.invulnerableUntil = time + PLAYER.iFrames;
    this.refreshArt();
    this.flash();
    return true;
  }

  /**
   * Put a fresh car back on the road after a lost life.
   *
   * Armour returns to the starting loadout and the wrecked frame is released, so a respawn
   * is the only thing that can undo `showWrecked()`. The longer respawn grace window is what
   * keeps the player from being hit again before they have read the banner.
   *
   * A wreck can happen off the shoulder, so the respawn recentres the car on the road it is
   * handed: coming back on the same patch of rough ground would spend the next life on the
   * same mistake.
   */
  respawn(time: number, road?: RoadProfile): void {
    this.armor = PLAYER.startArmor;
    // Clear the terminal wreck state first: `setArtState()` refuses to repaint a wreck.
    this.wrecked = false;
    this.invulnerableUntil = time + PLAYER.respawnIFrames;
    // A fresh car: neither the shove that wrecked the last one nor its wobble carries over.
    this.impulseX = 0;
    this.steerVelocity = 0;
    this.wobbleUntil = 0;
    // Nor does a contact weapon's lock: the replacement car has a working wheel.
    this.steerLockUntil = 0;
    // Nor does a jump: the replacement car is on the road, not in the air.
    this.jumpState = null;
    if (road) this.sprite.x = road.left + road.width / 2;
    this.refreshArt();
  }

  /**
   * Debug-only: arm the last armour point and drop the i-frame window.
   *
   * After a hit or a respawn the car is invulnerable for a while, so a spec that proves the
   * life counter steps 3 → 2 → 1 → 0 would otherwise have to wait out real time. The hit
   * that follows still runs the shipped `takeHit()` / `spendLife()` path; only the wait is
   * skipped. Reached through `window.__deadlaneControl` at `?debug=1`; nothing in the run
   * calls it.
   */
  debugArmLastHit(): void {
    this.armor = 1;
    this.invulnerableUntil = 0;
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
