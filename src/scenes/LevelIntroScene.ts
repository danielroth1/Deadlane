import Phaser from 'phaser';
import { GAME, LEVEL } from '@/config';
import { PALETTE } from '@/palette';
import { Art } from '@/art';
import { UI_CHROME_ART } from '@/art/ids';
import { LEVEL_PROFILES, type LevelType } from '@/levels/types';
import { PixelText } from '@/ui/pixel-text';

/** Emitted on the scene named by `targetScene` when the card is done. */
export const SECTOR_INTRO_DONE_EVENT = 'sector:intro-done';

export interface LevelIntroData {
  readonly levelIndex: number;
  readonly type: LevelType;
  /** Scene that stays frozen behind the card and resumes when it finishes. */
  readonly targetScene: string;
}

/**
 * Sector card.
 *
 * A short, self-contained presentation that names the sector and the road before the run
 * resumes. It is its own scene for one practical reason: the game scene freezes while the
 * card is up, and a frozen scene cannot update its own tweens or timers.
 */
export class LevelIntroScene extends Phaser.Scene {
  private art!: Art;
  private targetScene = 'Game';
  private levelIndex = 1;
  private type: LevelType = 'highway';
  private finished = false;
  private timer?: Phaser.Time.TimerEvent;

  constructor() {
    super('LevelIntro');
  }

  init(data: LevelIntroData): void {
    this.targetScene = data.targetScene;
    this.levelIndex = data.levelIndex;
    this.type = data.type;
    this.finished = false;
  }

  create(): void {
    const profile = LEVEL_PROFILES[this.type];
    const centerX = GAME.width / 2;

    this.art = new Art(this);

    const overlay = this.add.graphics();
    overlay.fillStyle(PALETTE.void, 0.86);
    overlay.fillRect(0, 0, GAME.width, GAME.height);

    const width = 320;
    const height = 116;
    const x = (GAME.width - width) / 2;
    const y = (GAME.height - height) / 2;

    overlay.fillStyle(PALETTE.asphalt, 1);
    overlay.fillRect(x, y, width, height);
    overlay.fillStyle(PALETTE.hotPink, 1);
    overlay.fillRect(x, y, 2, height);
    overlay.fillStyle(PALETTE.steel, 1);
    overlay.fillRect(x + 2, y + height - 2, width - 2, 2);

    // art-20's captioned `sector card` plate is unusable and the sheet has no divider cell,
    // so the primitive card stays and only the plain panel fill is layered over it — as a
    // header band, because the steel type under it reads better on the dark plate than on a
    // mid-tone one.
    const plate =
      this.art
        .tile(UI_CHROME_ART['panel-fill'][0] ?? '', x, y, width, 68)
        ?.setAlpha(0.6) ?? null;

    const sector = new PixelText(this, {
      x: centerX,
      y: y + 16,
      color: PALETTE.hotPink,
      scale: 3,
      align: 'center',
    }).setText(`SECTOR ${this.levelIndex}`);

    const label = new PixelText(this, {
      x: centerX,
      y: y + 48,
      color: PALETTE.white,
      scale: 2,
      align: 'center',
    }).setText(profile.label);

    const typeLine = new PixelText(this, {
      x: centerX,
      y: y + 74,
      color: PALETTE.steelLight,
      scale: 1,
      align: 'center',
    }).setText(`${this.type.toUpperCase()} / ${profile.lanes} LANES`);

    const hint = new PixelText(this, {
      x: centerX,
      y: y + 94,
      color: PALETTE.steel,
      scale: 1,
      align: 'center',
    }).setText('SPACE TO CONTINUE');

    const children: (Phaser.GameObjects.GameObject | null)[] = [
      overlay,
      plate,
      sector,
      label,
      typeLine,
      hint,
    ];

    const card = this.add
      .container(
        0,
        0,
        children.filter((child): child is Phaser.GameObjects.GameObject => child !== null),
      )
      .setDepth(300)
      .setAlpha(0);

    this.tweens.add({
      targets: card,
      alpha: { from: 0, to: 1 },
      duration: LEVEL.introFadeMs,
    });

    this.timer = this.time.delayedCall(LEVEL.introMs, () => this.finish());

    // Skippable, like the title screen: the card must never be something to wait out.
    this.input.keyboard?.once('keydown-SPACE', () => this.finish());
    this.input.keyboard?.once('keydown-ENTER', () => this.finish());
    this.input.once('pointerdown', () => this.finish());
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.timer?.remove();
    this.scene.get(this.targetScene).events.emit(SECTOR_INTRO_DONE_EVENT);
    this.scene.stop();
  }
}
