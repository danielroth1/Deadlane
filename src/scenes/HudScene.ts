import Phaser from 'phaser';
import { BOSS, GAME, MOTION } from '@/config';
import { PALETTE } from '@/palette';
import { PixelText } from '@/ui/pixel-text';
import { toggleAudioMute } from '@/systems/audio-registry';
import { buttonAt } from '@/systems/touch-input';
import { TouchPad } from '@/ui/touch-pad';
import { RUN_PAUSED_EVENT, type GameScene, type HudState, type RunDebugState } from './GameScene';

export interface DebugSnapshot extends RunDebugState {
  /** True while the pause card is on screen; the card is the visible pause state. */
  readonly pauseCard: boolean;
  /** True while the touch pad is on screen. Desktop leaves it hidden. */
  readonly touchPad: boolean;
}

/** Debug-only actions for Playwright, installed beside the read-only snapshot. */
export interface DebugControl {
  /** Put a lone civilian directly in the gun line, a short way ahead of the car. */
  stageCivilianAhead(): void;
  /** Advance the run by `pixels` of world distance instead of waiting out the clock. */
  fastForward(pixels: number): void;
  /** Spend one life through the real wreck path, respawning or ending the run. */
  loseLife(): void;
  /** Spend one life through the real wreck path. Kept for specs written before lives. */
  destroyPlayer(): void;
  /** Kill the live act boss through the normal damage path, paying its reward. */
  destroyBoss(): void;
}

declare global {
  interface Window {
    /** Read-only run snapshot, installed only when the page is opened with `?debug=1`. */
    __deadlane?: DebugSnapshot;
    /** Debug-only actions, installed only when the page is opened with `?debug=1`. */
    __deadlaneControl?: DebugControl;
  }
}

/**
 * HUD overlay.
 *
 * Reads state from the game scene rather than subscribing to events: one pull per frame is
 * cheaper than a stream of updates, and it cannot desync from the simulation.
 *
 * It also owns Esc and M. A paused scene receives no keyboard input at all, so the pause
 * key, the mute key and the pause card have to live in a scene that keeps running.
 */
export class HudScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private scoreText!: PixelText;
  private sectorText!: PixelText;
  private distanceText!: PixelText;
  private challengeText!: PixelText;
  private muteText!: PixelText;
  private offRoadText!: PixelText;
  private bossText!: PixelText;
  private bossBar!: Phaser.GameObjects.Graphics;
  private pips!: Phaser.GameObjects.Graphics;
  private speedBar!: Phaser.GameObjects.Graphics;
  private pauseCard?: Phaser.GameObjects.Container;
  private pauseHint?: PixelText;
  private pauseCardVisible = false;
  private touchPad!: TouchPad;
  private touchPadVisible = false;

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

    // Quiet state marker, right-aligned against the speed bar's left edge.
    this.muteText = new PixelText(this, {
      x: GAME.width - 112,
      y: GAME.height - 20,
      color: PALETTE.steelLight,
      scale: 1,
      align: 'right',
    });

    // Rough-ground warning, in the free middle of the bottom strip.
    this.offRoadText = new PixelText(this, {
      x: GAME.width / 2,
      y: GAME.height - 20,
      color: PALETTE.signalRed,
      scale: 1,
      align: 'center',
    });

    // Boss name plate and health bar, directly under the top strip. Empty until an act
    // boss is on the road.
    this.bossText = new PixelText(this, {
      x: GAME.width / 2,
      y: 32,
      color: PALETTE.signalRed,
      scale: 1,
      align: 'center',
    });

    this.pips = this.add.graphics();
    this.speedBar = this.add.graphics();
    this.bossBar = this.add.graphics();

    // Everything in the HUD must sit above the world.
    for (const child of this.children.list) {
      (child as Phaser.GameObjects.GameObject & { setDepth: (n: number) => void }).setDepth(100);
    }

    this.buildPauseCard();
    this.touchPad = new TouchPad(this);
    this.installTouchControls();
    this.installPauseControl();
    this.installMuteControl();
    this.installDebugSnapshot();
  }

  override update(): void {
    // The pad keeps drawing while the run is frozen, so the pause button stays lit and
    // tappable on the card it just raised.
    this.touchPad.render(this.gameScene.touchInput, this.time.now);

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

    this.muteText.setText(state.muted ? 'MUTED' : '');

    // Rough-ground warning. It sits in the free middle of the bottom strip, between the
    // weapon counters and the speed bar, so it never covers a readout the player needs
    // while steering back onto the road.
    this.offRoadText.setText(state.offRoad ? 'OFF ROAD' : '');

    this.drawPips(state);
    this.drawSpeed(state);
    this.drawBoss(state);
  }

  private drawPips(state: HudState): void {
    const g = this.pips;
    const x = 8;
    const y = GAME.height - 18;
    /** Where the life pips start: past the armour pips (5 × 9 px) and the gun oil counter. */
    const livesX = x + 130;

    g.clear();

    // Armour.
    for (let i = 0; i < state.maxArmor; i += 1) {
      const filled = i < state.armor;
      g.fillStyle(filled ? PALETTE.hotPink : PALETTE.steel, filled ? 1 : 0.5);
      g.fillRect(x + i * 9, y, 7, 7);
    }

    // Lives. Deliberately a different shape from an armour pip — a wider block with a
    // punched centre — so the two counters are never read as one bar. Lives sit in the
    // free stretch of the bottom strip, right of the weapon counters and left of the speed
    // bar.
    for (let i = 0; i < state.maxLives; i += 1) {
      const filled = i < state.lives;
      const lifeX = livesX + i * 11;
      g.fillStyle(filled ? PALETTE.sand : PALETTE.steel, filled ? 1 : 0.5);
      g.fillRect(lifeX, y, 9, 7);
      if (filled) {
        g.fillStyle(PALETTE.void, 1);
        g.fillRect(lifeX + 3, y + 2, 3, 3);
      }
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
    const ratio = Math.max(0, Math.min(1, state.speed / MOTION.maxSpeed));

    g.clear();
    g.fillStyle(PALETTE.asphalt, 1).fillRect(x, y, width, 6);
    g.fillStyle(ratio > 0.8 ? PALETTE.signalRed : PALETTE.amber, 1).fillRect(
      x,
      y,
      width * ratio,
      6,
    );
  }

  /** The encounter's own readout: who it is, and how much of it is left. */
  private drawBoss(state: HudState): void {
    const g = this.bossBar;
    g.clear();

    const boss = state.boss;
    if (!boss) {
      this.bossText.setText('');
      return;
    }

    this.bossText.setText(`${boss.label}  ${Math.max(0, boss.hp)}/${boss.maxHp}`);

    const width = BOSS.healthBarWidth;
    const x = (GAME.width - width) / 2;
    const y = 42;
    const ratio = boss.maxHp > 0 ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 0;

    g.fillStyle(PALETTE.void, 0.8);
    g.fillRect(x - 1, y - 1, width + 2, BOSS.healthBarHeight + 2);
    g.fillStyle(PALETTE.steel, 1);
    g.fillRect(x, y, width, BOSS.healthBarHeight);
    g.fillStyle(ratio > 0.3 ? PALETTE.signalRed : PALETTE.amber, 1);
    g.fillRect(x, y, Math.round(width * ratio), BOSS.healthBarHeight);
  }

  /* --------------------------------- touch --------------------------------- */

  /**
   * Show the pad on a touch-first device, arm it after the first touch, and own Pause.
   *
   * Every other control is routed by the run into the same input state the keyboard sets,
   * so there is one gameplay path. Pause cannot be: a paused scene receives no pointer
   * events at all, so the button that resumes a frozen run has to live in the scene that
   * keeps running.
   */
  private installTouchControls(): void {
    const params = new URLSearchParams(window.location.search);
    const touchFirst =
      params.get('touch') === '1' ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches);

    let visible = touchFirst;
    const apply = (): void => {
      this.touchPadVisible = visible;
      this.touchPad.setVisible(visible);
      this.gameScene.setTouchPadActive(visible);
    };

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // A touch anywhere arms the pad, which covers hybrid devices whose primary pointer
      // is a mouse. A mouse never does: desktop keeps the pad hidden.
      if (!visible && pointer.wasTouch) {
        visible = true;
        apply();
      }
      if (!visible) return;
      if (buttonAt(pointer.worldX, pointer.worldY)?.action !== 'pause') return;
      this.gameScene.togglePause();
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.touchPad.destroy());

    apply();
  }

  /* --------------------------------- pause --------------------------------- */

  private buildPauseCard(): void {
    const overlay = this.add.graphics();
    overlay.fillStyle(PALETTE.void, 0.7);
    overlay.fillRect(0, 0, GAME.width, GAME.height);

    const width = 264;
    const height = 88;
    const x = (GAME.width - width) / 2;
    const y = (GAME.height - height) / 2;

    overlay.fillStyle(PALETTE.asphalt, 1);
    overlay.fillRect(x, y, width, height);
    overlay.fillStyle(PALETTE.hotPink, 1);
    overlay.fillRect(x, y, 2, height);
    overlay.fillStyle(PALETTE.steel, 1);
    overlay.fillRect(x + 2, y + height - 2, width - 2, 2);

    const title = new PixelText(this, {
      x: GAME.width / 2,
      y: y + 18,
      color: PALETTE.white,
      scale: 4,
      align: 'center',
    }).setText('PAUSED');

    const hint = new PixelText(this, {
      x: GAME.width / 2,
      y: y + 58,
      color: PALETTE.bone,
      scale: 1,
      align: 'center',
    }).setText('ESC RESUME   M MUTE');
    this.pauseHint = hint;

    this.pauseCard = this.add.container(0, 0, [overlay, title, hint]).setDepth(200).setVisible(false);
  }

  private installPauseControl(): void {
    this.input.keyboard?.on('keydown-ESC', (event: KeyboardEvent) => {
      // Held-key repeats would flip the state every frame.
      if (event.repeat) return;
      this.gameScene.togglePause();
    });

    const onPaused = (paused: boolean): void => {
      this.pauseCardVisible = paused;
      // Name the control the player actually has in front of them.
      this.pauseHint?.setText(
        this.touchPadVisible ? 'PAUSE TO RESUME' : 'ESC RESUME   M MUTE',
      );
      this.pauseCard?.setVisible(paused);
    };

    this.gameScene.events.on(RUN_PAUSED_EVENT, onPaused);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.gameScene?.events.off(RUN_PAUSED_EVENT, onPaused);
    });
  }

  private installMuteControl(): void {
    this.input.keyboard?.on('keydown-M', (event: KeyboardEvent) => {
      // Held-key repeats would flip the preference every frame.
      if (event.repeat) return;
      toggleAudioMute(this.registry);
    });
  }

  /* --------------------------------- debug --------------------------------- */

  /** Opt-in, read-only observation surface for Playwright. Never writes gameplay. */
  private installDebugSnapshot(): void {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') !== '1') return;

    Object.defineProperty(window, '__deadlane', {
      configurable: true,
      get: (): DebugSnapshot => ({
        ...this.gameScene.debugState,
        pauseCard: this.pauseCardVisible,
        touchPad: this.touchPadVisible,
      }),
    });

    window.__deadlaneControl = {
      stageCivilianAhead: () => this.gameScene.debugStageCivilianAhead(),
      fastForward: (pixels: number) => this.gameScene.debugFastForward(pixels),
      loseLife: () => this.gameScene.debugLoseLife(),
      destroyPlayer: () => this.gameScene.debugDestroyPlayer(),
      destroyBoss: () => this.gameScene.debugDestroyBoss(),
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      delete window.__deadlane;
      delete window.__deadlaneControl;
    });
  }
}
