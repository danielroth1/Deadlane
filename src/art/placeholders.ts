import Phaser from 'phaser';
import { PALETTE, CIVILIAN_COLORS, type PaletteKey } from '@/palette';

/**
 * Procedural stand-in art.
 *
 * The game must be playable before a single AI image exists, and must keep working if an
 * art slot fails all six attempts. These functions draw a deterministic, palette-correct
 * sprite into a texture the renderer can use exactly like generated art.
 *
 * They are intentionally plain: flat fills, hard edges, one-pixel-ish outlines. When real
 * art lands, it replaces these without any gameplay code changing.
 */

export type VehicleShape = 'wedge' | 'bike' | 'truck' | 'boat' | 'heli' | 'block';

export interface VehicleOptions {
  readonly bodyColor: PaletteKey;
  readonly accentColor?: PaletteKey;
  readonly shape: VehicleShape;
  readonly size?: number;
  readonly faction?: 'player' | 'enemy' | 'civilian';
}

const VEHICLE_TEXTURE_SIZE = 64;

export function vehicleTextureKey(id: string): string {
  return `ph:vehicle:${id}`;
}

/** Draw a top-down vehicle into a texture, once per id. */
export function ensureVehicleTexture(
  scene: Phaser.Scene,
  id: string,
  options: VehicleOptions,
): string {
  const key = vehicleTextureKey(id);
  if (scene.textures.exists(key)) return key;

  const size = options.size ?? VEHICLE_TEXTURE_SIZE;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  const body = PALETTE[options.bodyColor];
  const accent = PALETTE[options.accentColor ?? options.bodyColor];
  const outlineColor = PALETTE.void;
  const glass = PALETTE.teal;

  // Shared shadow, offset down-right by 2px per the art bible.
  g.fillStyle(PALETTE.void, 0.45);

  const cx = size / 2;

  const fillBody = (w: number, h: number, radius = 3): void => {
    g.fillStyle(outlineColor, 1);
    g.fillRoundedRect(cx - w / 2 - 1, size / 2 - h / 2 - 1, w + 2, h + 2, radius + 1);
    g.fillStyle(body, 1);
    g.fillRoundedRect(cx - w / 2, size / 2 - h / 2, w, h, radius);
  };

  switch (options.shape) {
    case 'bike': {
      g.fillStyle(PALETTE.void, 0.35);
      g.fillRect(cx - 4, size / 2 - 13, 9, 28);
      fillBody(9, 30, 4);
      g.fillStyle(accent, 1);
      g.fillRect(cx - 2, size / 2 - 15, 4, 4);
      g.fillStyle(PALETTE.white, 1);
      g.fillRect(cx - 3, size / 2 - 14, 2, 2);
      break;
    }
    case 'truck': {
      g.fillStyle(PALETTE.void, 0.35);
      g.fillRect(cx - 15, size / 2 - 21, 32, 46);
      fillBody(30, 44, 2);
      // Cargo box, lighter than the cab.
      g.fillStyle(PALETTE.asphaltLight, 1);
      g.fillRect(cx - 12, size / 2 - 18, 24, 26);
      g.fillStyle(PALETTE.steel, 1);
      g.fillRect(cx - 12, size / 2 - 18, 24, 3);
      g.fillStyle(glass, 1);
      g.fillRect(cx - 9, size / 2 + 10, 18, 6);
      g.fillStyle(PALETTE.white, 1);
      g.fillRect(cx - 12, size / 2 - 24, 5, 3);
      g.fillRect(cx + 7, size / 2 - 24, 5, 3);
      g.fillStyle(accent, 1);
      g.fillRect(cx - 11, size / 2 + 20, 4, 3);
      g.fillRect(cx + 7, size / 2 + 20, 4, 3);
      break;
    }
    case 'boat': {
      g.fillStyle(PALETTE.void, 0.35);
      g.fillRect(cx - 12, size / 2 - 16, 26, 38);
      // Hull: rectangle plus a pointed bow.
      g.fillStyle(outlineColor, 1);
      g.fillRect(cx - 12, size / 2 - 12, 24, 32);
      g.fillTriangle(cx - 12, size / 2 - 12, cx + 12, size / 2 - 12, cx, size / 2 - 26);
      g.fillStyle(body, 1);
      g.fillRect(cx - 11, size / 2 - 11, 22, 30);
      g.fillTriangle(cx - 11, size / 2 - 11, cx + 11, size / 2 - 11, cx, size / 2 - 24);
      g.fillStyle(glass, 1);
      g.fillRect(cx - 6, size / 2 - 2, 12, 9);
      g.fillStyle(PALETTE.bone, 1);
      g.fillRect(cx - 9, size / 2 + 16, 18, 2);
      break;
    }
    case 'heli': {
      // Rotor cross drawn crisply, never blurred.
      g.fillStyle(PALETTE.steelLight, 0.85);
      g.fillRect(cx - 2, 4, 4, size - 8);
      g.fillRect(4, cx - 2, size - 8, 4);
      g.fillStyle(PALETTE.void, 0.4);
      g.fillEllipse(cx + 4, cx + 6, 22, 30);
      g.fillStyle(outlineColor, 1);
      g.fillEllipse(cx, cx, 20, 28);
      g.fillStyle(body, 1);
      g.fillEllipse(cx, cx, 18, 26);
      g.fillStyle(glass, 1);
      g.fillEllipse(cx, cx - 6, 10, 10);
      g.fillStyle(accent, 1);
      g.fillRect(cx - 8, cx + 8, 16, 3);
      g.fillRect(cx - 1, size - 14, 3, 10);
      break;
    }
    case 'block': {
      g.fillStyle(PALETTE.void, 0.35);
      g.fillRect(cx - 17, size / 2 - 17, 36, 36);
      fillBody(34, 34, 2);
      g.fillStyle(accent, 1);
      g.fillRect(cx - 13, size / 2 - 13, 26, 4);
      g.fillStyle(PALETTE.steel, 1);
      g.fillRect(cx - 13, size / 2 + 5, 26, 8);
      break;
    }
    case 'wedge':
    default: {
      // Nose points up the screen: that is the direction of travel in a vertical
      // scroller, so a car drawn the other way reads as oncoming traffic.
      const nose = size / 2 - 21;
      const tail = size / 2 + 21;

      g.fillStyle(PALETTE.void, 0.35);
      g.fillRect(cx - 11, nose + 2, 26, 40);

      // Outline: a tapered nose on a rectangular body.
      g.fillStyle(outlineColor, 1);
      g.fillTriangle(cx - 9, nose + 6, cx + 9, nose + 6, cx, nose - 4);
      g.fillRect(cx - 12, nose + 5, 24, tail - nose - 5);

      g.fillStyle(body, 1);
      g.fillTriangle(cx - 8, nose + 6, cx + 8, nose + 6, cx, nose - 2);
      g.fillRect(cx - 11, nose + 6, 22, tail - nose - 7);

      // Cockpit sits forward of centre, like a mid-engine interceptor.
      g.fillStyle(glass, 1);
      g.fillRect(cx - 6, nose + 12, 12, 11);
      g.fillStyle(PALETTE.steel, 1);
      g.fillRect(cx - 6, nose + 23, 12, 2);

      // Nose lights: white for the player and civilians, a red bar for hostiles.
      if (options.faction === 'enemy') {
        g.fillStyle(PALETTE.signalRed, 1);
        g.fillRect(cx - 8, nose + 2, 16, 3);
      } else {
        g.fillStyle(PALETTE.white, 1);
        g.fillRect(cx - 9, nose + 1, 5, 3);
        g.fillRect(cx + 4, nose + 1, 5, 3);
      }

      // Tail lights: hot pink is reserved for the player.
      if (options.faction === 'player') {
        g.fillStyle(PALETTE.hotPink, 1);
      } else if (options.faction === 'enemy') {
        g.fillStyle(PALETTE.amber, 1);
      } else {
        g.fillStyle(PALETTE.bone, 1);
      }
      g.fillRect(cx - 10, tail - 3, 5, 4);
      g.fillRect(cx + 5, tail - 3, 5, 4);

      // Twin exhaust ports.
      g.fillStyle(PALETTE.steelLight, 1);
      g.fillRect(cx - 5, tail + 1, 3, 2);
      g.fillRect(cx + 2, tail + 1, 3, 2);
      break;
    }
  }

  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/** Flat colour block with a subtle inner edge — used for props and UI stand-ins. */
export function flatTexture(
  scene: Phaser.Scene,
  id: string,
  color: PaletteKey,
  size = 32,
  accent?: PaletteKey,
): string {
  const key = `ph:flat:${id}`;
  if (scene.textures.exists(key)) return key;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(PALETTE.void, 1);
  g.fillRect(0, 0, size, size);
  g.fillStyle(PALETTE[color], 1);
  g.fillRect(1, 1, size - 2, size - 2);
  if (accent) {
    g.fillStyle(PALETTE[accent], 1);
    g.fillRect(1, 1, size - 2, 2);
  }
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/** Roadside debris: a cone silhouette, so props do not read as stray colour blocks. */
export function propTexture(scene: Phaser.Scene, id: string, color: PaletteKey = 'amber'): string {
  const key = `ph:prop:${id}`;
  if (scene.textures.exists(key)) return key;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const size = 18;
  g.fillStyle(PALETTE.void, 1);
  g.fillTriangle(size / 2, 1, 1, size - 1, size - 1, size - 1);
  g.fillStyle(PALETTE[color], 1);
  g.fillTriangle(size / 2, 4, 4, size - 3, size - 4, size - 3);
  g.fillStyle(PALETTE.bone, 1);
  g.fillRect(4, size - 8, size - 8, 2);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/** Pickup: a diamond, visually distinct from traffic and debris. */
export function pickupTexture(scene: Phaser.Scene, id: string, color: PaletteKey): string {
  const key = `ph:pickup:${id}`;
  if (scene.textures.exists(key)) return key;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const size = 26;
  const mid = size / 2;
  g.fillStyle(PALETTE.void, 1);
  g.fillTriangle(mid, 0, size, mid, mid, size);
  g.fillTriangle(mid, 0, 0, mid, mid, size);
  g.fillStyle(PALETTE[color], 1);
  g.fillTriangle(mid, 3, size - 4, mid, mid, size - 3);
  g.fillTriangle(mid, 3, 4, mid, mid, size - 3);
  g.fillStyle(PALETTE.white, 1);
  g.fillRect(mid - 2, mid - 2, 4, 4);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/** Pick a civilian paint colour deterministically from a string id. */
export function civilianColorFor(id: string): PaletteKey {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CIVILIAN_COLORS[h % CIVILIAN_COLORS.length]!;
}
