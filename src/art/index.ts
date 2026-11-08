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
      /** Frame ids on a tile sheet that are full-bleed surfaces and may be repeated. */
      tiles?: string[];
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

  /** The sprite-sheet frame behind an id, or null when the manifest has nothing for it. */
  private generated(id: string): SpriteRef | null {
    const entry = this.manifest?.sprites[id];
    if (!entry) return null;
    const sheet = this.manifest?.sheets[entry.sheet];
    if (!sheet || !this.scene.textures.exists(entry.sheet)) return null;
    const col = Math.round(entry.x / sheet.cellSize);
    const row = Math.round(entry.y / sheet.cellSize);
    return { key: entry.sheet, frame: row * sheet.cols + col };
  }

  /**
   * The generated frame behind an id, or null when the manifest or the texture is missing.
   *
   * Unlike `resolve`, this never falls back to a placeholder, so a caller that layers
   * generated art over a drawn fallback can decide for itself whether the art exists.
   */
  frameFor(id: string): SpriteRef | null {
    return this.generated(id);
  }

  /**
   * Resolve an id, falling back to a placeholder vehicle when no art exists.
   *
   * `fallback` is only invoked when the manifest has nothing, so placeholder textures are
   * created lazily rather than at boot.
   */
  resolve(id: string, fallback: () => VehicleOptions): SpriteRef {
    return this.generated(id) ?? { key: ensureVehicleTexture(this.scene, id, fallback()) };
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
   * Try several ids in order and return the first that resolves.
   *
   * Generated frame ids are derived from the sheet's cell labels, which are human-written
   * and may drift. Trying a short list of candidates means a renamed cell degrades to the
   * next best sprite instead of silently showing a placeholder.
   */
  refAny(ids: readonly string[], fallback: () => VehicleOptions): SpriteRef {
    for (const id of ids) {
      if (this.has(id)) return this.resolve(id, fallback);
    }
    return this.resolve(ids[0] ?? 'fallback', fallback);
  }

  /** Create an image from the first id that resolves. */
  imageAny(ids: readonly string[], x: number, y: number, fallback: () => VehicleOptions): Phaser.GameObjects.Image {
    const ref = this.refAny(ids, fallback);
    return ref.frame === undefined
      ? this.scene.add.image(x, y, ref.key)
      : this.scene.add.image(x, y, ref.key, ref.frame);
  }

  /**
   * Create an image from the first id that has generated art, else from a procedural
   * texture the caller builds.
   *
   * Pickups and effects are not vehicles, so their stand-in is a texture key rather than
   * `VehicleOptions`. `fallbackKey` only runs when no candidate id is in the manifest,
   * which keeps placeholder textures off the boot path.
   */
  imageFrom(
    ids: readonly string[],
    x: number,
    y: number,
    fallbackKey: () => string,
  ): Phaser.GameObjects.Image {
    for (const id of ids) {
      const ref = this.generated(id);
      if (ref) return this.scene.add.image(x, y, ref.key, ref.frame);
    }
    return this.scene.add.image(x, y, fallbackKey());
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
