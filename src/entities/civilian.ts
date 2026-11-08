import type Phaser from 'phaser';
import { PLAYER, SPAWN, WORLD } from '@/config';
import { laneCenter, type RoadProfile } from '@/levels/types';
import type { CivilianDef } from '@/content';
import { civilianColorFor, type Art } from '@/art';

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

  get halfWidth(): number {
    return this.sprite.displayWidth * 0.34;
  }

  get halfHeight(): number {
    return this.sprite.displayHeight * 0.4;
  }

  update(dt: number, distance: number): void {
    if (!this.wrecked) {
      this.at += this.speed * dt;
      // Gentle sway so a lane of traffic does not look like a conveyor belt.
      this.sprite.rotation = Math.sin(this.at * 0.004) * 0.02;
    }
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
