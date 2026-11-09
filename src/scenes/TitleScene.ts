import Phaser from 'phaser';
import { GAME } from '@/config';
import { PALETTE } from '@/palette';
import { Art } from '@/art';
import { UI_CHROME_ART } from '@/art/ids';
import { acquireAudio, toggleAudioMute } from '@/systems/audio-registry';
import { PixelText } from '@/ui/pixel-text';
import { formatSeed } from '@/rng';
import type { AudioSystem } from '@/systems/audio';

/**
 * Title screen.
 *
 * Doubles as diagnostics: it shows how many generated sprites are loaded, so it is obvious
 * at a glance whether the game is running on real art or placeholders.
 */
export class TitleScene extends Phaser.Scene {
  private art!: Art;
  private audio!: AudioSystem;

  constructor() {
    super('Title');
  }

  create(): void {
    this.art = new Art(this);
    // Reuse the registry's system: a fresh one per title visit stacked voices, because the
    // previous engine oscillator was never stopped.
    this.audio = acquireAudio(this.registry);

    this.cameras.main.setBackgroundColor(GAME.background);
    this.drawBackdrop();
    this.drawPanel();

    const centerX = GAME.width / 2;

    new PixelText(this, { x: centerX, y: 78, color: PALETTE.white, scale: 5, align: 'center' }).setText(
      'DEADLANE',
    );

    new PixelText(this, {
      x: centerX,
      y: 124,
      color: PALETTE.hotPink,
      scale: 2,
      align: 'center',
      letterSpacing: 1,
    }).setText('HIGHWAY INTERCEPT');

    const best = Number(localStorage.getItem(`${GAME.storagePrefix}best`) ?? '0');
    new PixelText(this, { x: centerX, y: 168, color: PALETTE.bone, scale: 2, align: 'center' }).setText(
      `BEST ${best.toString().padStart(6, '0')}`,
    );

    const prompt = new PixelText(this, {
      x: centerX,
      y: 214,
      color: PALETTE.steelLight,
      scale: 2,
      align: 'center',
    }).setText('PRESS SPACE OR TAP');

    this.tweens.add({
      targets: prompt,
      alpha: { from: 1, to: 0.3 },
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

    new PixelText(this, {
      x: centerX,
      y: 264,
      color: PALETTE.steel,
      scale: 1,
      align: 'center',
    }).setText('ARROWS STEER   SPACE FIRE   Z ROCKET   C FLAME');

    new PixelText(this, {
      x: centerX,
      y: 276,
      color: PALETTE.steel,
      scale: 1,
      align: 'center',
    }).setText('X OIL   SHIFT SMOKE   ESC PAUSE   M MUTE');

    new PixelText(this, {
      x: centerX,
      y: 294,
      color: PALETTE.steel,
      scale: 1,
      align: 'center',
    }).setText(`ART ${this.art.generatedSpriteCount} SPRITES / ${this.art.sheetCount} SHEETS`);

    new PixelText(this, {
      x: centerX,
      y: 312,
      color: PALETTE.asphaltLight,
      scale: 1,
      align: 'center',
    }).setText(`SEED ${formatSeed(Date.now() % 0x7fffffff)}`);

    const start = (): void => {
      this.audio.unlock();
      this.cameras.main.fadeOut(220, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start('Game', { levelIndex: 1 });
      });
    };

    this.input.keyboard!.once('keydown-SPACE', start);
    this.input.keyboard!.once('keydown-ENTER', start);
    this.input.once('pointerdown', start);

    // Mute before starting a run, so a player can opt out without being shot at first.
    this.input.keyboard!.on('keydown-M', (event: KeyboardEvent) => {
      if (event.repeat) return;
      toggleAudioMute(this.registry);
    });
  }

  /** A scrolling road behind the menu: same geometry as the game, no entities. */
  private drawBackdrop(): void {
    const g = this.add.graphics();
    const laneWidth = 64;
    const roadLeft = 128;
    const roadWidth = 384;

    g.fillStyle(PALETTE.asphalt, 1).fillRect(roadLeft, 0, roadWidth, GAME.height);
    g.fillStyle(PALETTE.steel, 1).fillRect(roadLeft - 8, 0, 8, GAME.height);
    g.fillStyle(PALETTE.steel, 1).fillRect(roadLeft + roadWidth, 0, 8, GAME.height);

    for (let lane = 1; lane < 6; lane += 1) {
      const x = roadLeft + lane * laneWidth - 2;
      for (let y = 0; y < GAME.height; y += 64) {
        g.fillStyle(PALETTE.steelLight, 1).fillRect(x, y, 4, 22);
      }
    }

    // Slow scroll to imply motion without competing with the title.
    this.tweens.addCounter({
      from: 0,
      to: -64,
      duration: 1600,
      repeat: -1,
      onUpdate: (tween) => {
        g.y = tween.getValue() ?? 0;
      },
    });

    g.setAlpha(0.35);
  }

  /** Dark plate behind the text so the road never fights the type. */
  private drawPanel(): void {
    const g = this.add.graphics();
    g.fillStyle(PALETTE.void, 0.78);
    g.fillRect(0, 40, GAME.width, 296);

    // art-20 chrome, layered over the primitive plate — the plate is what a missing or
    // unpulled sheet leaves behind. Its four captioned card cells are unusable, so the
    // corners, the fill and the rules are all plain components.
    this.art
      .tile(UI_CHROME_ART['panel-fill'][0] ?? '', 0, 40, GAME.width, 296)
      ?.setAlpha(0.5);

    const corner = UI_CHROME_ART['panel-corner'][0] ?? '';
    this.art.sprite(corner, 0, 40)?.setOrigin(0, 0);
    this.art.sprite(corner, GAME.width, 40)?.setOrigin(1, 0).setFlip(true, false);
    this.art.sprite(corner, 0, 336)?.setOrigin(0, 1).setFlip(false, true);
    this.art.sprite(corner, GAME.width, 336)?.setOrigin(1, 1).setFlip(true, true);

    // The two rules under the title and above the footer. art-20 drew no divider cell, so
    // these stay drawn.
    g.fillStyle(PALETTE.hotPink, 0.8);
    g.fillRect(GAME.width / 2 - 40, 64, 80, 2);
    g.fillRect(GAME.width / 2 - 40, 330, 80, 2);
  }
}
