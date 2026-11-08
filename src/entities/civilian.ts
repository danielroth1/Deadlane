import type Phaser from 'phaser';
import { GAME, PLAYER, SPAWN } from '@/config';
import { laneCenter, type RoadProfile } from '@/levels/types';
import type { CivilianDef } from '@/content';
import { civilianColorFor, type Art } from '@/art';
import type { VehicleShape } from '@/art/placeholders';

/**
 * Neutral traffic.
 *
 * Civilians exist to make the road feel alive and to make carelessness expensive: clipping
 * one costs score, and shooting one destroys it for a larger penalty. Neither ever costs
 * armour. They never attack and never chase.
 */

const ART_SLOTS = ['civilians', 'civilians-a'];
const SLOT_BY_SHAPE: Readonly<Record<VehicleShape, string>> = {
  wedge: 'sedan',
  truck: 'delivery-van',
  boat: 'boat',
  bike: 'sedan',
  heli: 'sedan',
  block: 'sedan',
};

export class CivilianVehicle {
  readonly sprite: Phaser.GameObjects.Image;
  at: number;
  readonly lane: number;
  /** Relative to world scroll: 0.3 means it crawls toward the player. */
  readonly speedFactor: number;
  wrecked = false;

  constructor(
    private readonly scene: Phaser.Scene,
    art: Art,
    readonly def: CivilianDef,
    at: number,
    lane: number,
    road: RoadProfile,
    speedFactor: number,
  ) {
    this.at = at;
    this.lane = lane;
    this.speedFactor = speedFactor;

    const x = laneCenter(road, lane);
    const artId = `${ART_SLOTS[0]}/${SLOT_BY_SHAPE[def.shape]}`;

    this.sprite = art.imageAny([artId], x, -80, () => ({
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
   * previous sector, so it would never reach the bottom edge at all.
   */
  isOffscreen(distance: number): boolean {
    return (
      this.at < distance - SPAWN.despawnMargin ||
      this.sprite.y > GAME.height + SPAWN.despawnMargin
    );
  }

  get halfWidth(): number {
    return this.sprite.displayWidth * 0.34;
  }

  get halfHeight(): number {
    return this.sprite.displayHeight * 0.4;
  }

  update(dt: number, scroll: number, distance: number): void {
    if (!this.wrecked) {
      this.at += scroll * this.speedFactor * dt;
      // Gentle sway so a lane of traffic does not look like a conveyor belt.
      this.sprite.rotation = Math.sin(this.at * 0.004) * 0.02;
    }
    this.sprite.y = PLAYER.y + distance - this.at;
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
