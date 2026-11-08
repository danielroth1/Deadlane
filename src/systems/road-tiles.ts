import { GAME } from '@/config';
import type { LevelType, RoadProfile } from '@/levels/types';
import {
  CANYON_TILE_ART,
  HIGHWAY_TILE_ART,
  WATER_TILE_ART,
  type TileArtByKind,
  type TileKind,
} from '@/art/ids';

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

/** The rectangle of a cell one band repeats, drawn 1:1. */
export interface TileWindow {
  readonly sourceX: number;
  readonly sourceWidth: number;
  readonly sourceY: number;
  readonly sourceHeight: number;
}

/**
 * Every window a level type needs to draw its road from tile cells.
 *
 * A theme is a rectangle per role: both axes are windowed because the model draws a dark
 * border down the top and left of most cells, and repeating either one is a line every
 * tile. Each band wraps its scroll at its own window height, so a band with a trimmed row
 * still moves continuously with every other band.
 */
export interface RoadTileTheme {
  readonly terrain: TileWindow;
  readonly shoulderLeft: TileWindow;
  readonly shoulderRight: TileWindow;
  /** The drivable surface. One contiguous window, so the band repeats evenly. */
  readonly surface: TileWindow;
  /** Lane dividers. The band's width is the window's width. */
  readonly dash: TileWindow;
}

/** A theme's art table plus the windows measured on that sheet. */
export interface RoadTileSpec {
  readonly windows: RoadTileTheme;
  readonly art: TileArtByKind;
}

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

export const HIGHWAY_TILE_WINDOWS: RoadTileTheme = {
  surface: { sourceX: SURFACE_SAMPLE_X, sourceWidth: SURFACE_SAMPLE_WIDTH, sourceY: 0, sourceHeight: TILE_SIZE },
  terrain: { sourceX: TERRAIN_SAMPLE_X, sourceWidth: TERRAIN_SAMPLE_WIDTH, sourceY: 0, sourceHeight: TILE_SIZE },
  shoulderLeft: { sourceX: SHOULDER_SAMPLE_LEFT, sourceWidth: SHOULDER_WIDTH, sourceY: 0, sourceHeight: TILE_SIZE },
  shoulderRight: { sourceX: SHOULDER_SAMPLE_RIGHT, sourceWidth: SHOULDER_WIDTH, sourceY: 0, sourceHeight: TILE_SIZE },
  dash: { sourceX: DASH_SAMPLE_X, sourceWidth: DASH_WIDTH, sourceY: 0, sourceHeight: TILE_SIZE },
};

/**
 * Windows measured on the shipped `art-14-tiles-canyon` cells (`cell-N.png`).
 *
 * - surface (cell 0): columns 3–15, rows 1–30. The cell is a road strip, not plain
 *   asphalt — it carries a solid edge line at column 2 and a painted white dash at column
 *   16, and a dark model border on row 0. Sampling left of the dash and below the border
 *   keeps only cracked asphalt and leaves the marking to the lane bands, where it lines up
 *   with the lane geometry instead of repeating every window width.
 * - terrain (cell 1): the whole sand plain, which is uniform edge to edge.
 * - shoulder (cell 6): cracked stone, uniform across its columns; each strip takes its
 *   own outer eight columns so the verge does not repeat a road edge.
 * - dash (cell 0): columns 8–23 put the painted dash at local column 8, the centre of the
 *   16 px band, with asphalt either side of it; rows 1–30 drop the same dark border row.
 */
export const CANYON_TILE_WINDOWS: RoadTileTheme = {
  surface: { sourceX: 3, sourceWidth: 13, sourceY: 1, sourceHeight: 30 },
  terrain: { sourceX: 0, sourceWidth: 32, sourceY: 0, sourceHeight: TILE_SIZE },
  shoulderLeft: { sourceX: 0, sourceWidth: SHOULDER_WIDTH, sourceY: 0, sourceHeight: TILE_SIZE },
  shoulderRight: { sourceX: 24, sourceWidth: SHOULDER_WIDTH, sourceY: 0, sourceHeight: TILE_SIZE },
  dash: { sourceX: 8, sourceWidth: DASH_WIDTH, sourceY: 1, sourceHeight: 30 },
};

/**
 * Windows measured on the shipped `art-15-tiles-water` cells (`cell-N.png`).
 *
 * On water the road *is* water, so every band is sampled from the sheet's water cells and
 * no band is ever asphalt.
 *
 * - surface (cell 0, open water): columns 1–30, rows 1–30. Column 0 is the dark border
 *   the model draws down the left of every cell and row 0 the same border across its top;
 *   repeating either would be a line every tile.
 * - terrain (cell 9, deep water): the same trim on the water outside the channel. The
 *   channel is marked by its shoulders, not by a different material.
 * - shoulder (cell 12, the wooden pier the sheet labels `stone bank edge`): columns 10–18
 *   are the plank deck, which repeats as mooring posts along the channel edge. One window
 *   serves both sides because planks have no inside or outside.
 * - dash (cell 2, foam): columns 8–23 cut through the white patch, so repeating the band
 *   draws a dashed wake down each lane boundary. The 32 px cell has transparent rows above
 *   and below the patch; they are gaps in the dash, and the surface water shows through.
 */
export const WATER_TILE_WINDOWS: RoadTileTheme = {
  surface: { sourceX: 1, sourceWidth: 30, sourceY: 1, sourceHeight: 30 },
  terrain: { sourceX: 1, sourceWidth: 30, sourceY: 1, sourceHeight: 30 },
  shoulderLeft: { sourceX: 10, sourceWidth: SHOULDER_WIDTH, sourceY: 0, sourceHeight: TILE_SIZE },
  shoulderRight: { sourceX: 10, sourceWidth: SHOULDER_WIDTH, sourceY: 0, sourceHeight: TILE_SIZE },
  dash: { sourceX: 8, sourceWidth: DASH_WIDTH, sourceY: 0, sourceHeight: TILE_SIZE },
};

/**
 * Level type → the sheet and windows its road is drawn from.
 *
 * City and tunnel are deliberately absent: they keep the drawn theme until their own
 * sheets land, and a missing entry is the only thing that has to change to opt them in.
 */
export const ROAD_TILE_SPECS: Readonly<Partial<Record<LevelType, RoadTileSpec>>> = {
  highway: { windows: HIGHWAY_TILE_WINDOWS, art: HIGHWAY_TILE_ART },
  canyon: { windows: CANYON_TILE_WINDOWS, art: CANYON_TILE_ART },
  river: { windows: WATER_TILE_WINDOWS, art: WATER_TILE_ART },
};

export interface TileBandPlan extends TileWindow {
  readonly kind: TileKind;
  /** Screen x of the band's left edge. */
  readonly x: number;
  /** Screen width of the band. */
  readonly width: number;
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
 * Distance → position inside one repeat, in `[0, period)`.
 *
 * Wrapping keeps the number small and the pattern periodic with exactly one repeat, so a
 * seam can never creep in through accumulated float error. The period is the window's own
 * height: a band that trims the top row of its cell repeats at 30 px, not 32, and wrapping
 * it at 32 would jump the pattern by 2 px every tile.
 */
export function tileOffset(distance: number, period: number = TILE_SIZE): number {
  const wrapped = distance % period;
  return wrapped < 0 ? wrapped + period : wrapped;
}

/** One band, with its scroll offset derived from its own window height. */
function band(
  kind: TileKind,
  x: number,
  width: number,
  window: TileWindow,
  distance: number,
): TileBandPlan {
  return {
    kind,
    x,
    width,
    ...window,
    offset: -tileOffset(distance, window.sourceHeight),
  };
}

/**
 * Road profile + distance → the bands the tile layer draws, back to front.
 *
 * The first five bands are fixed by the profile: terrain fills the screen edges, the
 * shoulders straddle the drivable surface, and the surface fills it exactly. The dash
 * bands sit on the interior lane boundaries, one per divider, and scroll with `distance`.
 *
 * The theme only supplies windows; it never moves a band, so a level type can change how
 * its road is drawn without touching the geometry the collision code uses.
 */
export function planRoadTiles(
  road: RoadProfile,
  distance: number,
  windows: RoadTileTheme = HIGHWAY_TILE_WINDOWS,
): readonly TileBandPlan[] {
  const right = road.left + road.width;
  const dashWidth = windows.dash.sourceWidth;

  const bands: TileBandPlan[] = [
    band('terrain', 0, road.left, windows.terrain, distance),
    band('terrain', right, GAME.width - right, windows.terrain, distance),
    band('shoulder', road.left - SHOULDER_WIDTH, SHOULDER_WIDTH, windows.shoulderLeft, distance),
    band('shoulder', right, SHOULDER_WIDTH, windows.shoulderRight, distance),
    band('surface', road.left, road.width, windows.surface, distance),
  ];

  for (let lane = 1; lane < road.lanes; lane += 1) {
    bands.push(
      band(
        'dash',
        road.left + lane * road.laneWidth - dashWidth / 2,
        dashWidth,
        windows.dash,
        distance,
      ),
    );
  }

  return bands.filter((plan) => plan.width > 0);
}
