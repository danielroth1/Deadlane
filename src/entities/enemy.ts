import type Phaser from 'phaser';
import { COLLISION, MOTION, PLAYER, SPAWN, WORLD } from '@/config';
import { laneCenter, type RoadProfile } from '@/levels/types';
import type { EnemyDef } from '@/content';
import type { Art } from '@/art';
import { easeTowards } from '@/systems/motion';

/**
 * A hostile unit.
 *
 * Behaviour is chosen from a small, closed set (`BehaviorId`) rather than subclassing per
 * enemy: every enemy shares one of five behaviours, and the data table decides which. That
 * keeps "add an enemy" a JSON change, which is what `AGENTS.md` promises.
 */

export interface EnemyUpdateContext {
  readonly now: number;
  readonly dt: number;
  readonly distance: number;
  readonly playerX: number;
}

const ART_SLOTS = ['enemy-ground-a', 'enemy-ground-b', 'enemy-air', 'enemy-sea'];

export class EnemyVehicle {
  readonly sprite: Phaser.GameObjects.Image;
  hp: number;
  at: number;
  lane: number;

  private phase: number;
  private nextFireAt = 0;
  private currentX: number;
  /**
   * The hostile's own forward speed, world px/s.
   *
   * Absolute, not a share of the player's scroll: a hostile drives at its own speed whether
   * the player is flat out or stopped, which is what lets a braking player watch one pull
   * away and what stops the player's speed from silently rebalancing the chase.
   *
   * Hostiles always spawn ahead, so the speed must stay below cruise or they would outrun
   * the chase and never be reachable. `def.speed` shapes the share of cruise rather than of
   * the live scroll; the 0.94 cap keeps the fastest row from matching the player exactly.
   */
  private readonly speed: number;
  /** True once the unit has been drawn inside the aperture. */
  private entered = false;
  /** Lateral distance from the lane centre the unit holds, px. Zero unless pinned. */
  private laneOffset = 0;
  /** Lateral speed the unit's own steering produced this frame, px/s. */
  private steerVelocity = 0;
  /** Lateral speed a contact gave the unit, px/s. Bleeds off at `COLLISION.impulseDrag`. */
  private impulseX = 0;
  /** Forward speed a contact gave the unit, px/s, added to `speed` while it bleeds off. */
  private impulseAt = 0;
  /** The last world distance and scroll the unit was stepped at, world px and px/s. */
  private lastDistance: number | null = null;
  private scroll = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    art: Art,
    readonly def: EnemyDef,
    at: number,
    lane: number,
    road: RoadProfile,
    seedPhase: number,
  ) {
    this.at = at;
    this.lane = lane;
    this.hp = def.hp;
    this.phase = seedPhase;
    this.currentX = laneCenter(road, lane);
    this.speed = MOTION.cruiseSpeed * Math.min(0.94, 0.5 + def.speed * 0.3);

    // An explicit `def.art` names a real manifest frame id and wins outright. The derived
    // `<slot>/<id>` candidates stay as a fallback for enemies whose content id happens to
    // match a cell slug, and the placeholder handles the rest.
    const artCandidates = [...(def.art ? [def.art] : []), ...ART_SLOTS.map((slot) => `${slot}/${def.id}`)];

    this.sprite = art.imageAny(
      artCandidates,
      this.currentX,
      -80,
      () => ({
        shape: def.shape,
        bodyColor: def.color,
        accentColor: def.accent,
        faction: 'enemy',
        size: def.size,
      }),
    );
    this.sprite.setDepth(40);
    this.sprite.setScale(def.size / Math.max(1, this.sprite.width));
  }

  /**
   * Past either edge of the play aperture.
   *
   * Screen `y` alone is not enough: a unit that has fallen behind the player is still on
   * screen for another stretch, and after a sector boundary its world `at` belongs to the
   * previous sector, so it would never reach the bottom edge at all.
   *
   * The leading edge needs the same treatment now that a hostile drives at an absolute speed:
   * a player who brakes hard is overtaken from behind by nothing, but every hostile ahead of
   * the car pulls away and would otherwise sit off the top of the screen for the rest of the
   * sector, holding a spawn slot. `entered` is what tells a deserter from a unit that has not
   * descended into view yet.
   */
  isOffscreen(distance: number): boolean {
    if (this.at < distance - SPAWN.despawnMargin) return true;
    if (this.sprite.y > WORLD.height + SPAWN.despawnMargin) return true;
    return this.entered && this.sprite.y < -SPAWN.despawnMargin;
  }

  get wantsToFire(): boolean {
    return false;
  }

  /** Box centre on the lane axis, world px. */
  get x(): number {
    return this.sprite.x;
  }

  /** Box centre on the road axis, world px. */
  get y(): number {
    return this.sprite.y;
  }

  /** Half-extents used for collision against the player. */
  get halfWidth(): number {
    return this.sprite.displayWidth * 0.4;
  }

  get halfHeight(): number {
    return this.sprite.displayHeight * 0.4;
  }

  /** Lateral velocity, world px/s: the unit's own steering plus any live impulse. */
  get vx(): number {
    return this.steerVelocity + this.impulseX;
  }

  /** Velocity down-screen, px/s: the road scrolling past less the unit's own forward speed. */
  get vy(): number {
    return this.scroll - (this.speed + this.impulseAt);
  }

  /** False: the unit moves along `at`, so a contact may push it down the road. */
  get pinnedY(): boolean {
    return false;
  }

  /**
   * Take a contact's positional correction, world px.
   *
   * `at` is the source of screen y, so a vertical correction is applied to `at` (positive is
   * down-screen, which means less road travelled) rather than to the sprite. The road clamp
   * in `update()` pulls an over-large lateral shove back onto the surface next frame.
   */
  shift(dx: number, dy: number): void {
    this.currentX += dx;
    this.at -= dy;
    this.sprite.x = this.currentX;
    this.sprite.y = PLAYER.y + (this.lastDistance ?? 0) - this.at;
  }

  /** Take a contact's impulse, world px/s, in screen axes. */
  applyImpulse(vx: number, vy: number): void {
    this.impulseX = vx;
    this.impulseAt = -vy;
  }

  /**
   * Pin the unit to a world x and world `at`, holding both until something pushes it.
   *
   * `at` is the source of screen y, so a pinned `at` is a pinned screen station. Used by the
   * debug collision stage, which needs a hostile exactly where a contact is about to happen
   * and nothing of its own steering mixed into the result.
   */
  pinTo(x: number, at: number, distance: number, road: RoadProfile): void {
    this.laneOffset = x - laneCenter(road, this.lane);
    this.currentX = x;
    this.at = at;
    this.lastDistance = distance;
    this.steerVelocity = 0;
    this.sprite.x = x;
    this.sprite.y = PLAYER.y + distance - at;
  }

  update(ctx: EnemyUpdateContext, road: RoadProfile): boolean {
    this.at += (this.speed + this.impulseAt) * ctx.dt;
    this.impulseAt = easeTowards(this.impulseAt, 0, COLLISION.impulseDrag * ctx.dt);
    this.phase += ctx.dt;

    // The scroll the road is moving at, measured rather than assumed: the contact pass needs
    // it to turn a push along the road into a velocity down the screen.
    if (this.lastDistance !== null && ctx.dt > 0) {
      this.scroll = (ctx.distance - this.lastDistance) / ctx.dt;
    }
    this.lastDistance = ctx.distance;

    const screenY = PLAYER.y + ctx.distance - this.at;
    const homeX = laneCenter(road, this.lane) + this.laneOffset;

    let targetX = homeX;

    switch (this.def.behavior) {
      case 'weave': {
        const amplitude = this.def.weaveAmplitude ?? 40;
        const period = this.def.weavePeriod ?? 1.6;
        targetX = homeX + Math.sin((this.phase / period) * Math.PI * 2) * amplitude;
        break;
      }
      case 'charge': {
        // Drifts toward the player's lane, then commits.
        const closing = screenY > -60 && screenY < PLAYER.y;
        if (closing) {
          targetX = homeX + Math.max(-1, Math.min(1, (ctx.playerX - homeX) / 120)) * 30;
        }
        break;
      }
      case 'ram': {
        const range = this.def.ramRange ?? 200;
        const gap = Math.abs(screenY - PLAYER.y);
        if (gap < range) {
          targetX += Math.max(-1, Math.min(1, (ctx.playerX - homeX) / 60)) * 40;
        }
        break;
      }
      case 'hold':
      case 'turret':
      default:
        break;
    }

    // Smooth lateral motion so nothing teleports sideways.
    const steerStep = (targetX - this.currentX) * Math.min(1, ctx.dt * 6);
    this.steerVelocity = ctx.dt > 0 ? steerStep / ctx.dt : 0;
    this.currentX += steerStep + this.impulseX * ctx.dt;
    this.impulseX = easeTowards(this.impulseX, 0, COLLISION.impulseDrag * ctx.dt);

    const minX = road.left + this.sprite.displayWidth * 0.3;
    const maxX = road.left + road.width - this.sprite.displayWidth * 0.3;

    this.sprite.x = Math.max(minX, Math.min(maxX, this.currentX));
    this.sprite.y = screenY;
    if (screenY >= 0 && screenY <= WORLD.height) this.entered = true;

    // Lean into the direction of travel, snapped to whole degrees.
    const delta = targetX - this.currentX;
    this.sprite.setRotation(delta > 2 ? 0.06 : delta < -2 ? -0.06 : 0);

    if (this.def.behavior === 'turret' && this.def.fireRate) {
      if (ctx.now >= this.nextFireAt && screenY > -40 && screenY < PLAYER.y) {
        this.nextFireAt = ctx.now + this.def.fireRate;
        return true;
      }
    }

    return false;
  }

  /** Returns true when this hit destroyed the unit. */
  hit(damage: number): boolean {
    this.hp -= damage;
    if (this.hp <= 0) return true;

    this.sprite.setTint(0xffffff);
    this.scene.time.delayedCall(60, () => this.sprite.clearTint());
    return false;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
