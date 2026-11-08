import { GAME } from '@/config';
import type { RoadProfile } from '@/levels/types';
import type { HighwayTileKind } from '@/art/ids';

/**
 * Frame selection for the highway tile layer.
 *
 * Pure data in, pure data out: no Phaser, no texture lookups, no mutation. The road
 * profile decides every x position, and `distance` only decides the vertical scroll
 * offset, so the layer can never drift away from the geometry the collision code uses.
 *
 * Every band is a **1:1 window** of its 32 × 32 frame, never a scaled copy: `sourceX` and
 * `sourceWidth` select the columns to repeat and the layer draws them at their own pixel
 * size. Windows exist for two reasons — the processed cells carry their subject edge to
 * edge (nothing can be cropped away at runtime), and a full 32 px cell repeated across a
 * wide band would replay its own border columns as a vertical line every 32 px.
 */

export const TILE_SIZE = 32;

/** Shoulder strips are 8 px wide, matching the drawn road geometry. */
export const SHOULDER_WIDTH = 8;

/**
 * Windows, measured on the shipped `art-13-tiles-highway` cells.
 *
 * - surface (cell 0): columns 1–30. Both border columns are grain spikes the model drew
 *   along the cell edge; repeating them paints a faint line every 32 px.
 * - terrain (cell 7): columns 9–29, the grass interior. Columns 0, 30 and 31 are the
 *   darker road-adjacent edge of the source tile.
 * - shoulder (cell 5): columns 0–7 on the left and 24–31 on the right, the gravel verge
 *   with the painted edge line at the inner side.
 * - dash (cell 11): columns 8–23, which hold the dashed centre line at column 16 and
 *   none of the solid edge lines at columns 3 and 29.
 */
export const SURFACE_SAMPLE_X = 1;
export const SURFACE_SAMPLE_WIDTH = 30;
export const TERRAIN_SAMPLE_X = 9;
export const TERRAIN_SAMPLE_WIDTH = 21;
export const SHOULDER_SAMPLE_LEFT = 0;
export const SHOULDER_SAMPLE_RIGHT = 24;
export const DASH_WIDTH = 16;
export const DASH_SAMPLE_X = 8;

export interface HighwayTileBandPlan {
  readonly kind: HighwayTileKind;
  /** Screen x of the band's left edge. */
  readonly x: number;
  /** Screen width of the band. */
  readonly width: number;
  /** Left edge of the window inside the frame, in source pixels. */
  readonly sourceX: number;
  /** Width of the window inside the frame, in source pixels. Drawn 1:1. */
  readonly sourceWidth: number;
  /**
   * `tilePositionY` for the band.
   *
   * Negative on purpose. Phaser turns a positive `tilePositionY` into a v-coordinate
   * further down the texture (`TileSpriteWebGLRenderer` passes `positionY / height` as the
   * quad's top v; the canvas path translates by `-positionY`), so a positive value moves
   * the visible pattern **up** the screen. Every other thing on the road moves down —
   * `RoadSystem` draws markings at `y + offset` and a world point lands at
   * `player.y + distance - at` — so the tile layer has to scroll negative to travel with
   * the traffic.
   */
  readonly offset: number;
}

/**
 * Distance → position inside one tile, in `[0, TILE_SIZE)`.
 *
 * Wrapping keeps the number small and the pattern periodic with exactly one tile, so a
 * seam can never creep in through accumulated float error.
 */
export function tileOffset(distance: number): number {
  const wrapped = distance % TILE_SIZE;
  return wrapped < 0 ? wrapped + TILE_SIZE : wrapped;
}

/**
 * Road profile + distance → the bands the tile layer draws, back to front.
 *
 * The first five bands are fixed by the profile: terrain fills the screen edges, the
 * shoulders straddle the drivable surface, and the surface fills it exactly. The dash
 * bands sit on the interior lane boundaries, one per divider, and scroll with `distance`.
 */
export function planHighwayTiles(
  road: RoadProfile,
  distance: number,
): readonly HighwayTileBandPlan[] {
  const right = road.left + road.width;
  const offset = -tileOffset(distance);

  const bands: HighwayTileBandPlan[] = [
    {
      kind: 'terrain',
      x: 0,
      width: road.left,
      sourceX: TERRAIN_SAMPLE_X,
      sourceWidth: TERRAIN_SAMPLE_WIDTH,
      offset,
    },
    {
      kind: 'terrain',
      x: right,
      width: GAME.width - right,
      sourceX: TERRAIN_SAMPLE_X,
      sourceWidth: TERRAIN_SAMPLE_WIDTH,
      offset,
    },
    {
      kind: 'shoulder',
      x: road.left - SHOULDER_WIDTH,
      width: SHOULDER_WIDTH,
      sourceX: SHOULDER_SAMPLE_LEFT,
      sourceWidth: SHOULDER_WIDTH,
      offset,
    },
    {
      kind: 'shoulder',
      x: right,
      width: SHOULDER_WIDTH,
      sourceX: SHOULDER_SAMPLE_RIGHT,
      sourceWidth: SHOULDER_WIDTH,
      offset,
    },
    {
      kind: 'surface',
      x: road.left,
      width: road.width,
      sourceX: SURFACE_SAMPLE_X,
      sourceWidth: SURFACE_SAMPLE_WIDTH,
      offset,
    },
  ];

  for (let lane = 1; lane < road.lanes; lane += 1) {
    bands.push({
      kind: 'dash',
      x: road.left + lane * road.laneWidth - DASH_WIDTH / 2,
      width: DASH_WIDTH,
      sourceX: DASH_SAMPLE_X,
      sourceWidth: DASH_WIDTH,
      offset,
    });
  }

  return bands.filter((band) => band.width > 0);
}
