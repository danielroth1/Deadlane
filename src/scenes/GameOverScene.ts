import Phaser from 'phaser';
import { GAME } from '@/config';
import { PALETTE } from '@/palette';
import { acquireAudio } from '@/systems/audio-registry';
import { PixelText } from '@/ui/pixel-text';
import { formatSeed } from '@/rng';

interface GameOverData {
  score: number;
  distance: number;
  level: number;
  seed: number;
}

/**
 * Run summary. Shows the seed so a good (or unfair) run can be replayed later via
 * `?seed=` — which is the whole reason levels are generated from a seed in the first place.
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: GameOverData): void {
    this.cameras.main.setBackgroundColor(GAME.background);

    const centerX = GAME.width / 2;

    new PixelText(this, { x: centerX, y: 88, color: PALETTE.hotPink, scale: 3, align: 'center' }).setText(
      'VEHICLE LOST',
    );

    const best = Number(localStorage.getItem(`${GAME.storagePrefix}best`) ?? '0');
    const isBest = data.score >= best && data.score > 0;

    new PixelText(this, { x: centerX, y: 148, color: PALETTE.white, scale: 2, align: 'center' }).setText(
      `SCORE ${data.score.toString().padStart(6, '0')}`,
    );

    new PixelText(this, { x: centerX, y: 178, color: PALETTE.bone, scale: 1, align: 'center' }).setText(
      `DISTANCE ${data.distance} M   SECTOR ${data.level}`,
    );

    if (isBest) {
      new PixelText(this, {
        x: centerX,
        y: 202,
        color: PALETTE.sand,
        scale: 2,
        align: 'center',
      }).setText('NEW BEST');
    }

    new PixelText(this, {
      x: centerX,
      y: 236,
      color: PALETTE.asphaltLight,
      scale: 1,
      align: 'center',
    }).setText(`SEED ${formatSeed(data.seed)}`);

    const prompt = new PixelText(this, {
      x: centerX,
      y: 284,
      color: PALETTE.steelLight,
      scale: 1,
      align: 'center',
    }).setText('SPACE REDEPLOY    ESC TITLE');

    this.tweens.add({
      targets: prompt,
      alpha: { from: 1, to: 0.3 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    });

    const redeploy = (): void => {
      // The run's audio was disposed on shutdown; build it inside this gesture so the new
      // context is not left suspended by the autoplay policy.
      acquireAudio(this.registry).unlock();
      this.cameras.main.fadeOut(200, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('Game', { levelIndex: 1 });
      });
    };

    this.input.keyboard!.once('keydown-SPACE', redeploy);
    this.input.keyboard!.once('keydown-ENTER', redeploy);
    this.input.keyboard!.once('keydown-ESC', () => this.scene.start('Title'));
    this.input.once('pointerdown', redeploy);
  }
}
