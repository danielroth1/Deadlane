import Phaser from 'phaser';
import { ensureVehicleTexture, type VehicleOptions } from './placeholders';

export { civilianColorFor, ensureVehicleTexture, flatTexture, pickupTexture, propTexture } from './placeholders';
export type { VehicleOptions, VehicleShape } from './placeholders';

/**
 * Resolves a semantic sprite id to something Phaser can render.
 *
 * Priority: generated art from `public/assets/assets.json`, then a procedural placeholder.
 * Gameplay code never branches on which one it got, which is what keeps "art arrives later"
 * from becoming a rewrite.
 */

export interface AssetsManifest {
  generatedAt: string;
  sheets: Record<
    string,
    {
      slot: string;
      code: string;
      cellSize: number;
      cols: number;
      rows: number;
      image: string;
      frames: Record<string, { x: number; y: number; w: number; h: number }>;
    }
  >;
  sprites: Record<string, { sheet: string; x: number; y: number; w: number; h: number }>;
}

export interface SpriteRef {
  readonly key: string;
  readonly frame?: number;
}

export class Art {
  private readonly manifest: AssetsManifest | null;

  constructor(private readonly scene: Phaser.Scene) {
    this.manifest = (scene.cache.json.get('assets') as AssetsManifest | undefined) ?? null;
  }

  /** True when this id has real generated art behind it. */
  has(id: string): boolean {
    return Boolean(this.manifest?.sprites[id]);
  }

  /** How many sprite ids have real art. Shown on the title screen. */
  get generatedSpriteCount(): number {
    return Object.keys(this.manifest?.sprites ?? {}).length;
  }

  get sheetCount(): number {
    return Object.keys(this.manifest?.sheets ?? {}).length;
  }

  /**
   * Resolve an id, falling back to a placeholder vehicle when no art exists.
   *
   * `fallback` is only invoked when the manifest has nothing, so placeholder textures are
   * created lazily rather than at boot.
   */
  resolve(id: string, fallback: () => VehicleOptions): SpriteRef {
    const entry = this.manifest?.sprites[id];
    if (entry) {
      const sheet = this.manifest?.sheets[entry.sheet];
      if (sheet && this.scene.textures.exists(entry.sheet)) {
        const col = Math.round(entry.x / sheet.cellSize);
        const row = Math.round(entry.y / sheet.cellSize);
        return { key: entry.sheet, frame: row * sheet.cols + col };
      }
    }
    return { key: ensureVehicleTexture(this.scene, id, fallback()) };
  }

  /** Create an image, sized to the asset's native pixel size. */
  image(id: string, x: number, y: number, fallback: () => VehicleOptions): Phaser.GameObjects.Image {
    const ref = this.resolve(id, fallback);
    const image =
      ref.frame === undefined
        ? this.scene.add.image(x, y, ref.key)
        : this.scene.add.image(x, y, ref.key, ref.frame);
    return image;
  }

  /**
   * Try several ids in order.
   *
   * Generated frame ids are derived from the sheet's cell labels, which are human-written
   * and may drift. Trying a short list of candidates means a renamed cell degrades to the
   * next best sprite instead of silently showing a placeholder.
   */
  imageAny(ids: readonly string[], x: number, y: number, fallback: () => VehicleOptions): Phaser.GameObjects.Image {
    for (const id of ids) {
      if (this.has(id)) return this.image(id, x, y, fallback);
    }
    return this.image(ids[0] ?? 'fallback', x, y, fallback);
  }
}

/**
 * Register generated sheets as spritesheets.
 *
 * Frames are addressed by grid index rather than by name: the manifest already stores
 * rects, and `(y / cellSize) * cols + x / cellSize` recovers the index exactly, so no
 * per-frame metadata needs to survive into the runtime.
 */
export function registerArtSheets(scene: Phaser.Scene, manifest: AssetsManifest): void {
  for (const [slotId, sheet] of Object.entries(manifest.sheets)) {
    if (scene.textures.exists(slotId)) continue;
    const imageKey = `img:${slotId}`;
    if (!scene.textures.exists(imageKey)) continue;

    const source = scene.textures.get(imageKey);
    const image = source.getSourceImage() as HTMLImageElement;

    scene.textures.addSpriteSheet(slotId, image, {
      frameWidth: sheet.cellSize,
      frameHeight: sheet.cellSize,
    });
  }
}
