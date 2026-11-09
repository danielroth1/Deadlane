import { PLAYER, SURFACE, WORLD } from '@/config';
import type { LevelType, RoadProfile, RoadShape, SurfaceKind } from '@/levels/types';
import {
  CANYON_TILE_ART,
  CITY_TILE_ART,
  HIGHWAY_TILE_ART,
  TRANSITION_TILE_ART,
  TUNNEL_TILE_ART,
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
 *   with the lane geometry instead of repeating every window width. Measured on the
 *   shipped sheet: columns 3–15 hold 84 % `steel`, 7 % `asphalt-light`, 4.6 % `void` and
 *   3.6 % `asphalt`, and not one `bone` or `white` pixel; the step across the wrap (0.0
 *   luma on rows, 2.8 on columns) is below the largest step inside the window.
 * - terrain (cell 1): columns 1–30, the whole sand plain. Column 31 is a darker sand edge
 *   (mean luma 188 against 194) and keeping it puts the sharpest step in the band on the
 *   wrap — 5.5 luma against 1.5 luma between neighbouring columns — so the window starts at
 *   column 1 and its wrap measures 1.8.
 * - shoulder (cell 6): cracked stone, uniform across its columns; each strip takes its
 *   own outer eight columns so the verge does not repeat a road edge. The band is exactly
 *   one window wide, so only the 32-row wrap is ever repeated.
 * - dash (cell 0): columns 8–23 put the painted dash at column 16 — local column 8, the
 *   centre of the 16 px band to within half a pixel — with asphalt either side of it and
 *   none of the edge line at column 2; rows 1–30 drop the same dark border row.
 */
export const CANYON_TILE_WINDOWS: RoadTileTheme = {
  surface: { sourceX: 3, sourceWidth: 13, sourceY: 1, sourceHeight: 30 },
  terrain: { sourceX: 1, sourceWidth: 30, sourceY: 0, sourceHeight: TILE_SIZE },
  shoulderLeft: { sourceX: 0, sourceWidth: SHOULDER_WIDTH, sourceY: 0, sourceHeight: TILE_SIZE },
  shoulderRight: { sourceX: 24, sourceWidth: SHOULDER_WIDTH, sourceY: 0, sourceHeight: TILE_SIZE },
  dash: { sourceX: 8, sourceWidth: DASH_WIDTH, sourceY: 1, sourceHeight: 30 },
};

/**
 * Windows measured on the shipped `art-15-tiles-water` cells (`cell-N.png`).
 *
 * On water the road *is* water, so every band is sampled from the sheet's water cells and
 * no band is ever asphalt. Every rectangle below was measured on the committed PNG; the
 * numbers are pinned by `road-tiles.sheet.test.ts`, which decodes the sheet and fails if the
 * art moves under the window.
 *
 * - surface (cell 10, the sheet's `current streak`): columns 2–31, rows 0–25. `open water`
 *   (cell 0) is the obvious choice and is deliberately **not** used: it ramps from a mean
 *   row luma of 115 at the top to 66 at the bottom, so a 30-row window of it steps 49.7
 *   luma at the wrap against a 6.9 median step inside — a bright band every 30 px on the
 *   road. The current streak's own rows are noise around one level and its wrap is 4.3.
 * - terrain (cell 9, deep water): columns 1–30, rows 6–27, the calm water outside the
 *   channel. Rows 1–30 wrap a 113-luma row onto an 89-luma one; rows 6–27 wrap at 2.3,
 *   which is smaller than any step inside the window.
 * - shoulder (cell 12, the deck this sheet labels `stone bank edge`): columns 12–19, rows
 *   8–31, the warm plank deck that reads as mooring posts along the channel edge. Rows 0–7
 *   are grey stone and the columns to either side are stone and water; the deck window
 *   itself is 1.6 % teal — i.e. not water — against 28 % in the surface window. One window
 *   serves both sides because planks have no inside or outside.
 * - dash (cell 2, foam): columns 8–23 cut through the white patch, whose brightness
 *   centroid sits at column 16 — local column 8, the centre of the band to within half a
 *   pixel — so repeating the band draws a dashed wake down each lane boundary. The 32 px
 *   cell has transparent rows above and below the patch; they are gaps in the dash, and the
 *   surface water shows through.
 */
export const WATER_TILE_WINDOWS: RoadTileTheme = {
  surface: { sourceX: 2, sourceWidth: 30, sourceY: 0, sourceHeight: 26 },
  terrain: { sourceX: 1, sourceWidth: 30, sourceY: 6, sourceHeight: 22 },
  shoulderLeft: { sourceX: 12, sourceWidth: SHOULDER_WIDTH, sourceY: 8, sourceHeight: 24 },
  shoulderRight: { sourceX: 12, sourceWidth: SHOULDER_WIDTH, sourceY: 8, sourceHeight: 24 },
  dash: { sourceX: DASH_SAMPLE_X, sourceWidth: DASH_WIDTH, sourceY: 0, sourceHeight: TILE_SIZE },
};

/**
 * Windows measured on the shipped `art-16-tiles-city` cells (`cell-N.png`).
 *
 * The city sheet is a block of compositions, not a set of seams: cell 0 is a whole street
 * cross-section and cell 12 is the only cell that tiles as a surface. Every rectangle below
 * was measured on the committed PNG and is pinned by `road-tiles.sheet.test.ts`.
 *
 * - surface (cell 0, the street strip): columns 11–17, rows 2–28. The cell carries a rust
 *   kerb edge at column 10 — just outside the window — a dashed centre line at column 18 and
 *   a solid kerb line at 26–28. Columns 11–17 are the only run of plain asphalt whose wrap
 *   is as smooth as its interior (0.0 luma at the seam against 4.1 inside). It is narrow,
 *   because the cell is a street cross-section: the asphalt between the kerb and the dash is
 *   all there is. Rows 0–1 and 30–31 are the transparent margins of the composition.
 * - terrain (cell 12, plaza tile): columns 1–30, rows 1–30. The grout lines sit on column 0
 *   and row 0, so the window starts one pixel inside them and the repeated seam is a light
 *   column against a light column (2.5 luma) instead of a grout line.
 * - shoulder (cell 8, alley concrete): columns 1–8, rows 2–24. Rows 25–31 are the dark
 *   ledge of that composition; stopping at row 24 keeps the band a uniform concrete strip.
 *   Both shoulders use the same window — a kerb has no inside or outside.
 * - dash (cell 0): columns 14–21 put the painted centre line at local column 4, the middle
 *   of the 8 px band to within half a pixel, with plain asphalt either side. Repeating it
 *   paints the line on the lane boundary without replaying the kerb line at 26–28.
 */
export const CITY_TILE_WINDOWS: RoadTileTheme = {
  surface: { sourceX: 11, sourceWidth: 7, sourceY: 2, sourceHeight: 28 },
  terrain: { sourceX: 1, sourceWidth: 30, sourceY: 1, sourceHeight: 30 },
  shoulderLeft: { sourceX: 1, sourceWidth: SHOULDER_WIDTH, sourceY: 2, sourceHeight: 23 },
  shoulderRight: { sourceX: 1, sourceWidth: SHOULDER_WIDTH, sourceY: 2, sourceHeight: 23 },
  dash: { sourceX: 14, sourceWidth: 8, sourceY: 2, sourceHeight: 28 },
};

/**
 * Windows measured on the shipped `art-17-tiles-tunnel` cells (`cell-N.png`).
 *
 * The tunnel is the one level type whose world is darkened by `LevelBlueprint.visibility`
 * (WO-33 draws a single void overlay at `1 - visibility`). The windows below sample the
 * sheet at its authored brightness and the tile layer is never tinted, so that overlay is
 * the *only* darkening: the sheet is composed with the darkness once, not twice. See the
 * composition test in `road-tiles.sheet.test.ts`.
 *
 * - surface (cell 0, tunnel asphalt): columns 3–13, rows 0–29. The cell is a road
 *   cross-section: a white edge line at columns 1–2, the dashed centre line at column 15
 *   and an amber hazard line at 26–27. Columns 3–13 are plain asphalt; the window wraps at
 *   0.3 luma on rows and 3.2 on columns against 11 luma inside, so it tiles as a surface.
 * - terrain (cell 2, concrete wall): the whole cell. Outside the carriageway is wall, and
 *   this cell is the wall face with its light fitting — repeating it draws the strip lights
 *   down the tunnel. The whole cell wraps at 51.8 luma against 81.2 inside because the
 *   fitting is a brighter row than the seam.
 * - shoulder: cell 0's outer eight columns. On the left that is the white edge line at
 *   local columns 1–2; on the right it is the amber hazard line at local columns 2–3 and
 *   the bright edge at 6–7. The asphalt either side keeps the strip opaque.
 * - dash (cell 0): columns 8–23 put the painted centre line at local column 7, the middle
 *   of the 16 px band to within half a pixel.
 */
export const TUNNEL_TILE_WINDOWS: RoadTileTheme = {
  surface: { sourceX: 3, sourceWidth: 11, sourceY: 0, sourceHeight: 30 },
  terrain: { sourceX: 0, sourceWidth: 32, sourceY: 0, sourceHeight: 32 },
  shoulderLeft: { sourceX: 0, sourceWidth: SHOULDER_WIDTH, sourceY: 1, sourceHeight: 30 },
  shoulderRight: { sourceX: 24, sourceWidth: SHOULDER_WIDTH, sourceY: 1, sourceHeight: 30 },
  dash: { sourceX: 8, sourceWidth: DASH_WIDTH, sourceY: 1, sourceHeight: 30 },
};

/**
 * Level type → the sheet and windows its road is drawn from.
 *
 * A level type with no entry keeps the drawn theme, so a rejected or missing sheet degrades
 * to painted fills and nothing else in the game changes.
 */
export const ROAD_TILE_SPECS: Readonly<Partial<Record<LevelType, RoadTileSpec>>> = {
  highway: { windows: HIGHWAY_TILE_WINDOWS, art: HIGHWAY_TILE_ART },
  canyon: { windows: CANYON_TILE_WINDOWS, art: CANYON_TILE_ART },
  river: { windows: WATER_TILE_WINDOWS, art: WATER_TILE_ART },
  city: { windows: CITY_TILE_WINDOWS, art: CITY_TILE_ART },
  tunnel: { windows: TUNNEL_TILE_WINDOWS, art: TUNNEL_TILE_ART },
};

/** The sheet a water stretch draws regardless of the level type it sits in. */
export const WATER_TILE_SPEC: RoadTileSpec = {
  windows: WATER_TILE_WINDOWS,
  art: WATER_TILE_ART,
};

/**
 * The sheet one surface of one level type draws from.
 *
 * Water always uses the art-15 sheet, because the material — not the sector's theme — is
 * what the water tiles depict. Land in a water-heavy sector is a causeway, so it borrows
 * the highway's asphalt sheet; every other type keeps its own theme on land.
 */
export function roadTileSpecFor(
  type: LevelType,
  surface: SurfaceKind,
): RoadTileSpec | undefined {
  if (surface === 'water') return WATER_TILE_SPEC;
  return ROAD_TILE_SPECS[type === 'river' ? 'highway' : type];
}

/**
 * A transition cell drawn as an 8 px strip over a theme's shoulder.
 *
 * The strip is a material boundary, not a band: `left` is sampled with terrain on its
 * left edge and drivable surface on its right, `right` the other way round. A theme whose
 * transition cell did not qualify keeps its shoulder from `ROAD_TILE_SPECS` — the drawn
 * fallback contract — so a missing strip is never a hole or a black band.
 */
export interface EdgeTileSpec {
  readonly art: readonly string[];
  readonly left: TileWindow;
  readonly right: TileWindow;
}

/**
 * Windows measured on the shipped `art-18-tiles-transition` cells.
 *
 * Cell 4 is the one clean blend on the sheet: a grass verge, a narrow worn road strip and
 * grass again. Row 0 is the model's dark border, so every window starts at row 1 and
 * repeats at 30 rows (measured wrap step 0.0 luma against 16–19 luma inside). The left
 * window starts in olive and ends in the road's steel; the right window reverses that.
 * Neither window contains the painted centre dash at column 15, so repeating the shoulder
 * cannot scribble a dashed line into it.
 */
export const HIGHWAY_EDGE_BLEND: EdgeTileSpec = {
  art: TRANSITION_TILE_ART['shoulder-grass'],
  left: { sourceX: 7, sourceWidth: SHOULDER_WIDTH, sourceY: 1, sourceHeight: 30 },
  right: { sourceX: 16, sourceWidth: SHOULDER_WIDTH, sourceY: 1, sourceHeight: 30 },
};

/**
 * Windows measured on the shipped `art-18` chevron cell (cell 5).
 *
 * Columns 13–19 hold the amber chevrons; columns 12–19 keep asphalt either side so the
 * 8 px strip is opaque. Rows 1–23 are the vertical period that wraps with a 0.0 luma step;
 * the whole 32 px cell wraps at 59.3 luma, which would be a visible notch every 32 px, so
 * the strip scrolls at 23 px instead.
 */
export const CANYON_EDGE_CHEVRON: EdgeTileSpec = {
  art: TRANSITION_TILE_ART.chevron,
  left: { sourceX: 12, sourceWidth: SHOULDER_WIDTH, sourceY: 1, sourceHeight: 23 },
  right: { sourceX: 12, sourceWidth: SHOULDER_WIDTH, sourceY: 1, sourceHeight: 23 },
};

/**
 * Level type → the transition strip that replaces its shoulder.
 *
 * Only themes whose transition cell qualified get a strip. Highway gets the grass →
 * asphalt blend; canyon gets the chevron hazard shoulder (its cliff edge). River, city and
 * tunnel keep their sheet shoulders because their asphalt → water/concrete blend cells
 * carry a vehicle.
 */
export const ROAD_EDGE_SPECS: Readonly<Partial<Record<LevelType, EdgeTileSpec>>> = {
  highway: HIGHWAY_EDGE_BLEND,
  canyon: CANYON_EDGE_CHEVRON,
};
/**
 * Windows for the shore band and its marker line, measured on the shipped cells.
 *
 * The bank is a 20-row band inside art-15's gravel shore (cell 7): rows 2–21 of that cell
 * are uniform gravel with no dark model border, and the band repeats across the aperture
 * at its native width. The marker samples art-18's chevron cell (5) from column 10 to 22
 * and rows 8–14, one chevron row, so repeating it draws an unbroken hazard line.
 */
export const SHORE_BANK_WINDOW: TileWindow = {
  sourceX: 1,
  sourceWidth: 30,
  sourceY: 2,
  sourceHeight: SURFACE.shoreBandPixels,
};

export const SHORE_STRIPE_WINDOW: TileWindow = {
  sourceX: 10,
  sourceWidth: 12,
  sourceY: 8,
  sourceHeight: SURFACE.shoreStripePixels,
};

/** One strip, at the same x and width as the shoulder band it covers. */
export interface EdgeBandPlan extends TileWindow {
  readonly x: number;
  readonly width: number;
  readonly offset: number;
}

/** Road profile + distance → the two strips that paint the shoulders, back to front. */
export function planRoadEdges(
  road: RoadProfile,
  distance: number,
  spec: EdgeTileSpec,
): readonly EdgeBandPlan[] {
  const right = road.left + road.width;

  const strip = (x: number, window: TileWindow): EdgeBandPlan => ({
    x,
    width: SHOULDER_WIDTH,
    ...window,
    offset: -tileOffset(distance, window.sourceHeight),
  });

  return [strip(road.left - SHOULDER_WIDTH, spec.left), strip(right, spec.right)];
}

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
    band('terrain', right, WORLD.width - right, windows.terrain, distance),
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

/** One surface stretch as it appears on screen at one scroll distance. */
export interface SurfaceBand {
  readonly kind: SurfaceKind;
  /** Sector distance the stretch covers. */
  readonly from: number;
  readonly to: number;
  /** Screen y of the stretch's top edge, px. */
  readonly yTop: number;
  /** Screen y of its bottom edge, px. */
  readonly yBottom: number;
}

/**
 * The surface stretches visible on screen, top to bottom.
 *
 * World y is `PLAYER.y + distance - at`, so the screen shows `at` from
 * `distance + PLAYER.y - WORLD.height` (top) to `distance + PLAYER.y` (bottom). The first
 * and last stretches are extended to the horizon because `surfaceAt` is open-ended: the
 * world is authored beyond a sector's ends, and the screen must never show a hole there.
 *
 * Pure and testable without Phaser; `RoadSystem` uses it to clip each material's base fill
 * and tile layer, and to seat the shore bands.
 */
export function planSurfaceBands(shape: RoadShape, distance: number): readonly SurfaceBand[] {
  const topAt = distance + PLAYER.y;
  const bottomAt = distance + PLAYER.y - WORLD.height;
  const bands: SurfaceBand[] = [];
  const count = shape.surfaces.length;

  shape.surfaces.forEach((segment, index) => {
    const from = index === 0 ? Number.NEGATIVE_INFINITY : segment.from;
    const to = index === count - 1 ? Number.POSITIVE_INFINITY : segment.to;
    const visibleFrom = Math.max(from, bottomAt);
    const visibleTo = Math.min(to, topAt);
    if (visibleTo <= visibleFrom) return;

    bands.push({
      kind: segment.kind,
      from: segment.from,
      to: segment.to,
      yTop: PLAYER.y + distance - visibleTo,
      yBottom: PLAYER.y + distance - visibleFrom,
    });
  });

  // Top to bottom, so a caller can walk the screen once and a masked layer is always
  // created after the layer it sits above.
  return bands.sort((a, b) => a.yTop - b.yTop);
}
