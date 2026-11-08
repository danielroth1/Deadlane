import type Phaser from 'phaser';
import { COLLISION, PLAYER, SPAWN, WORLD } from '@/config';
import { laneCenter, type RoadProfile } from '@/levels/types';
import type { CivilianDef } from '@/content';
import { civilianColorFor, type Art } from '@/art';
import { easeTowards } from '@/systems/motion';

/**
 * Neutral traffic.
 *
 * Civilians exist to make the road feel alive and to make carelessness expensive: clipping
 * one costs score, and shooting one destroys it for a larger penalty. Neither ever costs
 * armour. They never attack and never chase.
 */

export class CivilianVehicle {
  readonly sprite: Phaser.GameObjects.Image;
  at: number;
  readonly lane: number;
  /**
   * The car's own forward speed, world px/s.
   *
   * Absolute, not a share of the player's scroll: traffic keeps driving at its own pace even
   * when the player comes to a halt, so a stopped player is passed rather than being left in
   * a frozen diorama.
   */
  readonly speed: number;
  wrecked = false;
  /** True once the car has been drawn inside the aperture. */
  private entered = false;
  /**
   * Lateral distance from the lane centre the car holds, px.
   *
   * Zero for generated traffic. Kept because the lane centre moves as the surface widens
   * and narrows, and a car that was deliberately placed a few pixels off centre — the
   * debug stage in `GameScene` puts one in the gun line — must stay where it was put.
   */
  private laneOffset = 0;
  /** Lateral speed a contact gave the car, px/s. Bleeds off at `COLLISION.impulseDrag`. */
  private impulseX = 0;
  /** Forward speed a contact gave the car, px/s, added to `speed` while it bleeds off. */
  private impulseAt = 0;
  /** The last world distance and scroll the car was stepped at, world px and px/s. */
  private lastDistance: number | null = null;
  /** The last road cross-section the car was stepped against, so a shove can redraw it. */
  private lastRoad: RoadProfile;
  private scroll = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    art: Art,
    readonly def: CivilianDef,
    at: number,
    lane: number,
    road: RoadProfile,
    speed: number,
  ) {
    this.at = at;
    this.lane = lane;
    this.speed = speed;
    this.lastRoad = road;

    const x = laneCenter(road, lane);

    // An explicit `def.art` names a real manifest frame id and wins outright. Everything
    // else draws the procedural placeholder under its own id: the old shape-derived
    // `<slot>/<shape>` guess is gone because `civilians/sedan` and `civilians/delivery-van`
    // exist now, so a wagon, a hatchback or a coupe would silently wear a sedan sprite.
    // The leading `placeholder/` keeps that id out of the manifest's namespace forever.
    this.sprite = art.image(def.art ?? `placeholder/${def.id}`, x, -80, () => ({
      shape: def.shape,
      bodyColor: civilianColorFor(def.id),
      faction: 'civilian',
      size: def.size,
    }));

    this.sprite.setDepth(30);
    this.sprite.setScale(def.size / Math.max(1, this.sprite.width));
  }

  /**
   * Pin the car `x` px of world x, keeping it there as the lane centre moves.
   *
   * Used by the debug stage, which puts one civilian in the gun line: assigning
   * `sprite.x` alone would be undone by the next `update()` re-deriving the lane centre.
   */
  pinTo(x: number, road: RoadProfile): void {
    this.laneOffset = x - laneCenter(road, this.lane);
    this.lastRoad = road;
    this.sprite.x = x;
  }

  /**
   * Past either edge of the play aperture.
   *
   * Screen `y` alone is not enough: a unit that has fallen behind the player is still on
   * screen for another stretch, and after a sector boundary its world `at` belongs to the
   * previous sector, so it would never reach the bottom edge at all. The leading edge is
   * culled on the same terms as the trailing one: traffic outruns a stopped player, and a car
   * that has driven off the top of the frame is gone.
   */
  isOffscreen(distance: number): boolean {
    if (this.at < distance - SPAWN.despawnMargin) return true;
    if (this.sprite.y > WORLD.height + SPAWN.despawnMargin) return true;
    return this.entered && this.sprite.y < -SPAWN.despawnMargin;
  }

  /** Box centre on the lane axis, world px. */
  get x(): number {
    return this.sprite.x;
  }

  /** Box centre on the road axis, world px. */
  get y(): number {
    return this.sprite.y;
  }

  get halfWidth(): number {
    return this.sprite.displayWidth * 0.34;
  }

  get halfHeight(): number {
    return this.sprite.displayHeight * 0.4;
  }

  /** Lateral velocity, world px/s: a live impulse only. Traffic steers nothing. */
  get vx(): number {
    return this.impulseX;
  }

  /** Velocity down-screen, px/s: the road scrolling past less the car's own forward speed. */
  get vy(): number {
    return this.scroll - (this.speed + this.impulseAt);
  }

  /** False: the car moves along `at`, so a contact may push it down the road. */
  get pinnedY(): boolean {
    return false;
  }

  /**
   * Take a contact's positional correction, world px.
   *
   * `at` is the source of screen y, so a vertical correction is applied to `at` (positive is
   * down-screen, which means less road travelled) rather than to the sprite.
   */
  shift(dx: number, dy: number): void {
    this.laneOffset += dx;
    this.at -= dy;
    this.sprite.x = laneCenter(this.lastRoad, this.lane) + this.laneOffset;
    this.sprite.y = PLAYER.y + (this.lastDistance ?? 0) - this.at;
  }

  /** Take a contact's impulse, world px/s, in screen axes. */
  applyImpulse(vx: number, vy: number): void {
    this.impulseX = vx;
    this.impulseAt = -vy;
  }

  /**
   * Drive on, holding the lane.
   *
   * The lane centre is re-derived from the road at the car's own `at` every frame: the
   * surface widens and narrows, and traffic that kept the x it spawned with would end up
   * straddling a lane boundary on the narrow stretches. A wreck stays where it came to
   * rest — it is debris, not a driver.
   */
  update(dt: number, distance: number, road: RoadProfile): void {
    this.lastRoad = road;
    if (this.lastDistance !== null && dt > 0) {
      this.scroll = (distance - this.lastDistance) / dt;
    }
    this.lastDistance = distance;

    if (!this.wrecked) {
      this.at += (this.speed + this.impulseAt) * dt;
      // Gentle sway so a lane of traffic does not look like a conveyor belt.
      this.sprite.rotation = Math.sin(this.at * 0.004) * 0.02;
      this.laneOffset += this.impulseX * dt;
      this.sprite.x = laneCenter(road, this.lane) + this.laneOffset;
    }
    this.impulseX = easeTowards(this.impulseX, 0, COLLISION.impulseDrag * dt);
    this.impulseAt = easeTowards(this.impulseAt, 0, COLLISION.impulseDrag * dt);
    this.sprite.y = PLAYER.y + distance - this.at;
    if (this.sprite.y >= 0 && this.sprite.y <= WORLD.height) this.entered = true;
  }

  wreck(distance: number): void {
    this.wrecked = true;
    this.sprite.setTint(0x5a2b2b);
    this.sprite.setAlpha(0.8);
    this.sprite.y = PLAYER.y + distance - this.at;
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
