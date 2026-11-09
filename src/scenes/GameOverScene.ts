import Phaser from 'phaser';
import { GAME } from '@/config';
import { PALETTE } from '@/palette';
import { Art } from '@/art';
import { UI_CHROME_ART } from '@/art/ids';
import { acquireAudio } from '@/systems/audio-registry';
import { PixelText } from '@/ui/pixel-text';
import { formatSeed } from '@/rng';

interface GameOverData {
  score: number;
  distance: number;
  level: number;
  seed: number;
  /** Lives left when the run ended. A run ends at zero, so this is the proof it did. */
  lives: number;
}

/** Read-only result view served to Playwright through `window.__deadlaneOver` at `?debug=1`. */
export interface RunResultSnapshot {
  readonly score: number;
  readonly distance: number;
  readonly level: number;
  readonly seed: number;
  readonly lives: number;
  /** Best score as this screen read it back from storage. */
  readonly best: number;
  /** True when this result replaced that best. */
  readonly isBest: boolean;
}

declare global {
  interface Window {
    /** Read-only result snapshot, installed only when the page is opened with `?debug=1`. */
    __deadlaneOver?: RunResultSnapshot;
  }
}

/**
 * Run summary. Shows the seed so a good (or unfair) run can be replayed later via
 * `?seed=` — which is the whole reason levels are generated from a seed in the first place.
 */
export class GameOverScene extends Phaser.Scene {
  private art!: Art;

  constructor() {
    super('GameOver');
  }

  create(data: GameOverData): void {
    this.cameras.main.setBackgroundColor(GAME.background);
    this.art = new Art(this);
    this.drawChrome();

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
      `DISTANCE ${data.distance} M   SECTOR ${data.level}   LIVES ${data.lives}`,
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

    this.installDebugSnapshot(data, best, isBest);
  }

  /**
   * art-20 chrome for the result screen.
   *
   * The four captioned card plates are unusable and the sheet has no divider cell, so only
   * the ribbon and two corner brackets are wired. Both are optional — the text is drawn
   * either way.
   */
  private drawChrome(): void {
    this.art.sprite(UI_CHROME_ART.banner[0] ?? '', GAME.width / 2, 44);

    const corner = UI_CHROME_ART['corner-bracket'][0] ?? '';
    this.art.sprite(corner, 0, 0)?.setOrigin(0, 0);
    this.art.sprite(corner, GAME.width, GAME.height)?.setOrigin(1, 1).setFlip(true, true);
  }

  /**
   * Opt-in, read-only result surface for Playwright.
   *
   * The HUD installs `window.__deadlane` for the run, but it is stopped before this scene
   * starts, so a spec that reaches game over has no other way to read the result without
   * screenshotting the canvas. Never writes gameplay.
   */
  private installDebugSnapshot(data: GameOverData, best: number, isBest: boolean): void {
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return;

    window.__deadlaneOver = {
      score: data.score,
      distance: data.distance,
      level: data.level,
      seed: data.seed,
      lives: data.lives,
      best,
      isBest,
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      delete window.__deadlaneOver;
    });
  }
}
