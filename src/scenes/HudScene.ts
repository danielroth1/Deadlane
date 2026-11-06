import Phaser from 'phaser';
import { GAME } from '@/config';
import { PALETTE } from '@/palette';
import { PixelText } from '@/ui/pixel-text';
import type { GameScene, HudState } from './GameScene';

/**
 * HUD overlay.
 *
 * Reads state from the game scene rather than subscribing to events: one pull per frame is
 * cheaper than a stream of updates, and it cannot desync from the simulation.
 */
export class HudScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private scoreText!: PixelText;
  private sectorText!: PixelText;
  private distanceText!: PixelText;
  private challengeText!: PixelText;
  private pips!: Phaser.GameObjects.Graphics;
  private speedBar!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Hud');
  }

  init(data: { game: GameScene }): void {
    this.gameScene = data.game;
  }

  create(): void {
    const pad = 8;

    // Backing strips so the HUD stays readable over grass, water and concrete alike.
    const bars = this.add.graphics();
    bars.fillStyle(PALETTE.void, 0.55);
    bars.fillRect(0, 0, GAME.width, 28);
    bars.fillRect(0, GAME.height - 24, GAME.width, 24);
    bars.fillStyle(PALETTE.hotPink, 0.5);
    bars.fillRect(0, 28, GAME.width, 1);

    this.scoreText = new PixelText(this, { x: pad, y: pad, color: PALETTE.white, scale: 2 }).setText(
      '000000',
    );

    this.sectorText = new PixelText(this, {
      x: GAME.width - pad,
      y: pad,
      color: PALETTE.hotPink,
      scale: 1,
      align: 'right',
    }).setText('SECTOR 1');

    this.distanceText = new PixelText(this, {
      x: GAME.width - pad,
      y: pad + 10,
      color: PALETTE.steelLight,
      scale: 1,
      align: 'right',
    }).setText('0 M');

    this.challengeText = new PixelText(this, {
      x: GAME.width / 2,
      y: pad + 2,
      color: PALETTE.bone,
      scale: 1,
      align: 'center',
    });

    this.pips = this.add.graphics();
    this.speedBar = this.add.graphics();

    // Everything in the HUD must sit above the world.
    for (const child of this.children.list) {
      (child as Phaser.GameObjects.GameObject & { setDepth: (n: number) => void }).setDepth(100);
    }
  }

  override update(): void {
    if (!this.gameScene?.scene.isActive()) return;

    const state = this.gameScene.hudState;

    this.scoreText.setText(state.score.toString().padStart(6, '0'));
    this.sectorText.setText(`SECTOR ${state.level}`);
    this.distanceText.setText(`${state.distance} M`);

    if (state.challenge) {
      this.challengeText.setText(
        state.challengeTarget > 0
          ? `${state.challenge}  ${state.challengeProgress}/${state.challengeTarget}`
          : state.challenge,
      );
    } else {
      this.challengeText.setText('');
    }

    this.drawPips(state);
    this.drawSpeed(state);
  }

  private drawPips(state: HudState): void {
    const g = this.pips;
    const x = 8;
    const y = GAME.height - 18;

    g.clear();

    // Armour.
    for (let i = 0; i < state.maxArmor; i += 1) {
      const filled = i < state.armor;
      g.fillStyle(filled ? PALETTE.hotPink : PALETTE.steel, filled ? 1 : 0.5);
      g.fillRect(x + i * 9, y, 7, 7);
    }

    // Oil and smoke counters.
    g.fillStyle(PALETTE.violet, 1);
    for (let i = 0; i < state.oil; i += 1) g.fillRect(x + 62 + i * 5, y, 3, 7);

    g.fillStyle(PALETTE.bone, 1);
    for (let i = 0; i < state.smoke; i += 1) g.fillRect(x + 96 + i * 5, y, 3, 7);
  }

  private drawSpeed(state: HudState): void {
    const g = this.speedBar;
    const width = 96;
    const x = GAME.width - width - 8;
    const y = GAME.height - 16;
    const ratio = Math.max(0, Math.min(1, state.speed / 520));

    g.clear();
    g.fillStyle(PALETTE.asphalt, 1).fillRect(x, y, width, 6);
    g.fillStyle(ratio > 0.8 ? PALETTE.signalRed : PALETTE.amber, 1).fillRect(
      x,
      y,
      width * ratio,
      6,
    );
  }
}
