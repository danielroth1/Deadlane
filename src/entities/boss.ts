import type Phaser from 'phaser';
import { BOSS, PLAYER } from '@/config';
import { PALETTE } from '@/palette';
import { flatTexture, type VehicleShape } from '@/art/placeholders';
import type { Art } from '@/art';
import type { BossDef, BossKind } from '@/content';
import type { RoadProfile } from '@/levels/types';
import {
  bossAction,
  createBossFight,
  damageBoss,
  type BossAction,
  type BossFightState,
} from '@/systems/boss';

/**
 * The act boss.
 *
 * An enemy is a thing that passes by; a boss is an encounter. It holds station ahead of the
 * car instead of racing it, so the player can neither outrun it nor lose it, and it only
 * leaves the road when it is destroyed. Everything that makes it dangerous — hp, speed,
 * the attacks it alternates — comes from `bosses.json`; this class supplies the silhouette,
 * the station-keeping and the telegraph cue.
 */

/** Placeholder silhouette per boss kind, used when no generated frame exists. */
const KIND_SHAPE: Readonly<Record<BossKind, VehicleShape>> = {
  carrier: 'truck',
  gunship: 'heli',
  dreadnought: 'boat',
  borer: 'block',
};

export interface BossUpdateContext {
  readonly now: number;
  readonly dt: number;
  /** The run's world cursor, so the boss's `at` tracks its station on screen. */
  readonly distance: number;
  readonly playerX: number;
}

export class BossVehicle {
  readonly sprite: Phaser.GameObjects.Image;
  /** The pure fight state: hp, defeat and the attack cycle. */
  readonly state: BossFightState;
  /** World position, re-derived from the station every frame so shells aim correctly. */
  at: number;

  private phase = 0;
  private currentX: number;
  private telegraphing = false;
  private readonly warning: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    art: Art,
    readonly def: BossDef,
    distance: number,
    private readonly road: RoadProfile,
    now: number,
  ) {
    this.state = createBossFight(def, now);
    this.currentX = road.left + road.width / 2;

    // `boss/<id>` matches the art-07-boss cell slugs, so WO-49's sheet starts drawing the
    // moment it ships and the placeholder covers every run until then.
    this.sprite = art.imageAny(
      [...(def.art ? [def.art] : []), `boss/${def.id}`],
      this.currentX,
      -def.size,
      () => ({
        shape: KIND_SHAPE[def.kind],
        bodyColor: def.color,
        accentColor: def.accent,
        faction: 'enemy',
        size: def.size,
      }),
    );
    this.sprite.setDepth(42);
    this.sprite.setScale(def.size / Math.max(1, this.sprite.width));
    this.at = distance + (PLAYER.y - this.sprite.y);

    // A red bar at the boss's nose that pulses through the telegraph, so a volley is always
    // announced before it lands.
    this.warning = scene.add
      .image(this.currentX, this.sprite.y, flatTexture(scene, 'boss-telegraph', 'signalRed', 40))
      .setDepth(41)
      .setScale(2)
      .setVisible(false);
  }

  get hp(): number {
    return this.state.hp;
  }

  get maxHp(): number {
    return this.state.maxHp;
  }

  get defeated(): boolean {
    return this.state.defeated;
  }

  /**
   * Hold station, weave, and run the attack cycle.
   *
   * The station is screen-space on purpose: the world cursor advances the whole time the
   * fight lasts, so a boss pinned to a world `at` would slide off the bottom of the screen
   * within a second. `at` is then derived from how far ahead the boss is drawn, which is
   * exactly the number shells and collision need.
   */
  update(ctx: BossUpdateContext): BossAction | null {
    this.phase += ctx.dt;

    const stationY = PLAYER.y - BOSS.stationAhead;
    if (this.sprite.y < stationY) {
      this.sprite.y = Math.min(
        stationY,
        this.sprite.y + BOSS.approachSpeed * this.def.speed * ctx.dt,
      );
    }

    // Weave across the road with a bias toward the player's half, so the boss is a moving
    // target rather than a turret the player parks in front of.
    const halfWidth = this.road.width / 2;
    const weave = Math.min(BOSS.weaveAmplitude, halfWidth - this.sprite.displayWidth * 0.4);
    const centre = this.road.left + halfWidth;
    const bias =
      Math.max(-1, Math.min(1, (ctx.playerX - centre) / Math.max(1, halfWidth))) * weave * 0.35;
    const targetX =
      centre + bias + Math.sin((this.phase / BOSS.weavePeriod) * Math.PI * 2) * weave;

    const maxStep = BOSS.lateralSpeed * this.def.speed * ctx.dt;
    this.currentX += Math.max(-maxStep, Math.min(maxStep, targetX - this.currentX));

    const margin = this.sprite.displayWidth * 0.4;
    this.currentX = Math.max(
      this.road.left + margin,
      Math.min(this.road.left + this.road.width - margin, this.currentX),
    );
    this.sprite.x = this.currentX;

    this.at = ctx.distance + (PLAYER.y - this.sprite.y);
    this.warning.setPosition(this.sprite.x, this.sprite.y + this.sprite.displayHeight / 2);

    const action = bossAction(this.state, ctx.now);
    if (action?.kind === 'telegraph') this.startTelegraph();
    else if (action?.kind === 'fire') this.endTelegraph();

    return action;
  }

  /** Returns true when this hit destroyed the boss. Defeat is terminal. */
  hit(damage: number): boolean {
    const result = damageBoss(this.state, damage);
    if (result === 'defeated') return true;

    this.sprite.setTint(PALETTE.white);
    this.scene.time.delayedCall(60, () => {
      if (!this.sprite.active) return;
      if (this.telegraphing) this.sprite.setTint(PALETTE.amber);
      else this.sprite.clearTint();
    });
    return false;
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.warning);
    this.warning.destroy();
    this.sprite.destroy();
  }

  private startTelegraph(): void {
    if (this.telegraphing) return;
    this.telegraphing = true;
    this.sprite.setTint(PALETTE.amber);
    this.warning.setVisible(true).setAlpha(0.35);
    this.scene.tweens.add({
      targets: this.warning,
      alpha: 1,
      duration: 120,
      yoyo: true,
      repeat: -1,
    });
  }

  private endTelegraph(): void {
    if (!this.telegraphing) return;
    this.telegraphing = false;
    this.scene.tweens.killTweensOf(this.warning);
    this.warning.setVisible(false);
    this.sprite.clearTint();
  }
}
