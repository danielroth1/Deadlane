import Phaser from 'phaser';
import type { AssetsManifest } from '@/art';
import { registerArtSheets } from '@/art';
import { GAME } from '@/config';

/**
 * Boot: load the asset manifest only.
 *
 * The manifest has to be in the cache before Preload can know which sheets to fetch, so
 * the load is split across two scenes rather than trying to chain loaders in one.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    this.load.json('assets', 'assets/assets.json');
  }

  create(): void {
    this.scene.start('Preload');
  }
}

/**
 * Preload: fetch generated sheets (if any) and register them as spritesheets.
 *
 * With no approved art this scene does nothing and the game runs on procedural
 * placeholders, which is the intended state for most of the project.
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    const manifest = this.cache.json.get('assets') as AssetsManifest | undefined;
    const sheets = manifest?.sheets ?? {};
    const entries = Object.entries(sheets);

    if (entries.length === 0) return;

    const barWidth = 200;
    const bar = this.add.graphics();
    this.add
      .text(GAME.width / 2, GAME.height / 2 - 20, 'LOADING', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '10px',
        color: '#7a8794',
      })
      .setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      bar.clear();
      bar.fillStyle(0x161a21, 1).fillRect(GAME.width / 2 - barWidth / 2, GAME.height / 2, barWidth, 6);
      bar.fillStyle(0xff2e63, 1).fillRect(GAME.width / 2 - barWidth / 2, GAME.height / 2, barWidth * value, 6);
    });

    this.load.on('complete', () => {
      bar.destroy();
    });

    for (const [slotId, sheet] of entries) {
      this.load.image(`img:${slotId}`, sheet.image);
    }
  }

  create(): void {
    const manifest = this.cache.json.get('assets') as AssetsManifest | undefined;
    if (manifest) registerArtSheets(this, manifest);
    this.scene.start('Title');
  }
}
