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
 * Tile frames are 32 × 32. The processed cells carry transparent margins where the
 * generator did not fill the cell, so each band samples a window of its frame rather than
 * stretching it: `sourceX` feeds `tilePositionX` and `scaleX` feeds `tileScaleX`.
 */

export const TILE_SIZE = 32;

/** Shoulder strips are 8 px wide, matching the drawn road geometry. */
export const SHOULDER_WIDTH = 8;

/** Source column where the shoulder strip starts on each side of cell 5. */
export const SHOULDER_SAMPLE_LEFT = 4;
export const SHOULDER_SAMPLE_RIGHT = 22;

/**
 * The lane dash is a 1-px column in the middle of cell 11 (source x 16). Sampling
 * x 15–18 and scaling x by 4 turns it into a 4-px marking without inventing paint, and
 * the surrounding asphalt columns keep the band opaque.
 */
export const DASH_WIDTH = 16;
export const DASH_SAMPLE_X = 15;
export const DASH_SCALE_X = 4;

export interface HighwayTileBandPlan {
  readonly kind: HighwayTileKind;
  /** Screen x of the band's left edge. */
  readonly x: number;
  /** Screen width of the band. */
  readonly width: number;
  /** Source-pixel x fed to `tilePositionX`. */
  readonly sourceX: number;
  /** Source-pixel x scale fed to `tileScaleX`. */
  readonly scaleX: number;
  /** Vertical source-pixel offset fed to `tilePositionY`, in `[0, TILE_SIZE)`. */
  readonly offset: number;
}

/**
 * Distance → scroll offset inside one tile.
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
  const offset = tileOffset(distance);

  const bands: HighwayTileBandPlan[] = [
    { kind: 'terrain', x: 0, width: road.left, sourceX: 0, scaleX: 1, offset },
    { kind: 'terrain', x: right, width: GAME.width - right, sourceX: 0, scaleX: 1, offset },
    {
      kind: 'shoulder',
      x: road.left - SHOULDER_WIDTH,
      width: SHOULDER_WIDTH,
      sourceX: SHOULDER_SAMPLE_LEFT,
      scaleX: 1,
      offset,
    },
    {
      kind: 'shoulder',
      x: right,
      width: SHOULDER_WIDTH,
      sourceX: SHOULDER_SAMPLE_RIGHT,
      scaleX: 1,
      offset,
    },
    { kind: 'surface', x: road.left, width: road.width, sourceX: 0, scaleX: 1, offset },
  ];

  for (let lane = 1; lane < road.lanes; lane += 1) {
    bands.push({
      kind: 'dash',
      x: road.left + lane * road.laneWidth - DASH_WIDTH / 2,
      width: DASH_WIDTH,
      sourceX: DASH_SAMPLE_X,
      scaleX: DASH_SCALE_X,
      offset,
    });
  }

  return bands.filter((band) => band.width > 0);
}
