import Phaser from 'phaser';
import { GAME } from '@/config';
import { BootScene, PreloadScene } from '@/scenes/BootScene';
import { TitleScene } from '@/scenes/TitleScene';
import { GameScene } from '@/scenes/GameScene';
import { HudScene } from '@/scenes/HudScene';
import { LevelIntroScene } from '@/scenes/LevelIntroScene';
import { GameOverScene } from '@/scenes/GameOverScene';

/**
 * Entry point.
 *
 * The internal resolution is fixed at 640×360 and letterboxed by Phaser's FIT scaler, so
 * every gameplay constant is expressed in authored pixels and never needs a scale factor.
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'dl-root',
  width: GAME.width,
  height: GAME.height,
  backgroundColor: GAME.background,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME.width,
    height: GAME.height,
  },
  render: {
    pixelArt: true,
    antialias: false,
    powerPreference: 'low-power',
  },
  // Scene order is render order: the sector card must draw above both the world and the
  // HUD, so it is registered after `Hud`.
  scene: [
    BootScene,
    PreloadScene,
    TitleScene,
    GameScene,
    HudScene,
    LevelIntroScene,
    GameOverScene,
  ],
};

async function start(): Promise<void> {
  // No webfonts: all in-game text is drawn from the built-in 5x7 bitmap font, so the game
  // has no external asset dependency and can boot offline from disk.
  document.getElementById('dl-boot')?.setAttribute('hidden', 'true');
  new Phaser.Game(config);
}

void start();
