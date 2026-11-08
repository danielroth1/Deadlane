import Phaser from 'phaser';
import type { Art, SpriteRef } from '@/art';
import type { TileArtByKind, TileKind } from '@/art/ids';
import { WORLD } from '@/config';
import { PALETTE } from '@/palette';
import { roadAt, type LevelType, type RoadProfile, type RoadShape } from '@/levels/types';
import {
  ROAD_EDGE_SPECS,
  ROAD_TILE_SPECS,
  planRoadEdges,
  planRoadTiles,
  type EdgeBandPlan,
  type EdgeTileSpec,
  type RoadTileTheme,
  type TileBandPlan,
  type TileWindow,
} from './road-tiles';

/**
 * Procedural road renderer with an optional tiled surface.
 *
 * The road is drawn from the locked palette as the baseline: the game must look correct
 * before any AI tiles exist, and a drawn road scrolls at any speed without texture seams.
 * When a level type's tile sheet is approved, a tile layer is inserted between the fills
 * and the markings.
 *
 * The geometry comes from the sector's `RoadShape`: every frame samples
 * `roadAt(shape, distance)` and draws that one cross-section, centred on the world
 * aperture. That is what lets the surface tighten and open again as the car drives — the
 * fills, the tile bands and the painted markings all move together, because they are all
 * read from the same sample. The tile planner only chooses where frames sit, never where
 * the road is.
 */

interface RoadTheme {
  readonly terrainLeft: number;
  readonly terrainRight: number;
  readonly roadFill: number;
  readonly shoulder: number;
  readonly edgeLine: number;
  readonly dashLine: number;
}

const THEMES: Readonly<Record<LevelType, RoadTheme>> = {
  highway: {
    terrainLeft: PALETTE.olive,
    terrainRight: PALETTE.olive,
    roadFill: PALETTE.asphalt,
    shoulder: PALETTE.asphaltLight,
    edgeLine: PALETTE.bone,
    dashLine: PALETTE.steelLight,
  },
  canyon: {
    terrainLeft: PALETTE.rust,
    terrainRight: PALETTE.rust,
    roadFill: PALETTE.asphalt,
    shoulder: PALETTE.rust,
    edgeLine: PALETTE.sand,
    dashLine: PALETTE.bone,
  },
  river: {
    terrainLeft: PALETTE.deepBlue,
    terrainRight: PALETTE.teal,
    roadFill: PALETTE.deepBlue,
    shoulder: PALETTE.teal,
    edgeLine: PALETTE.bone,
    dashLine: PALETTE.teal,
  },
  city: {
    terrainLeft: PALETTE.asphaltLight,
    terrainRight: PALETTE.asphaltLight,
    roadFill: PALETTE.asphalt,
    shoulder: PALETTE.steel,
    edgeLine: PALETTE.bone,
    dashLine: PALETTE.bone,
  },
  tunnel: {
    terrainLeft: PALETTE.void,
    terrainRight: PALETTE.void,
    roadFill: PALETTE.asphalt,
    shoulder: PALETTE.steel,
    edgeLine: PALETTE.steelLight,
    dashLine: PALETTE.steelLight,
  },
};

const DASH_LENGTH = 22;
const DASH_GAP = 42;

type TileFrames = Readonly<Record<TileKind, SpriteRef>>;

/** First generated frame among these ids, or null when none exists. */
function firstFrame(art: Art, ids: readonly string[]): SpriteRef | null {
  for (const id of ids) {
    const ref = art.frameFor(id);
    if (ref) return ref;
  }
  return null;
}

/** First generated frame for a role, or null when the sheet has none. */
function firstTileFrame(art: Art, table: TileArtByKind, kind: TileKind): SpriteRef | null {
  return firstFrame(art, table[kind]);
}

/**
 * Frames for every role, or null if any role is missing.
 *
 * All-or-nothing is deliberate: a partly tiled road would show one band of generated art
 * against three drawn bands. A sheet missing one role steps back to the drawn theme.
 */
function tileFrames(art: Art, table: TileArtByKind): TileFrames | null {
  const surface = firstTileFrame(art, table, 'surface');
  const dash = firstTileFrame(art, table, 'dash');
  const shoulder = firstTileFrame(art, table, 'shoulder');
  const terrain = firstTileFrame(art, table, 'terrain');

  if (!surface || !dash || !shoulder || !terrain) return null;
  return { surface, dash, shoulder, terrain };
}

/**
 * Register (once) and return the frame that shows a band's 1:1 window of its cell.
 *
 * A `TileSprite` repeats its whole frame, so repeating a 32 px cell across a wide band
 * replays every border column of the cell as a vertical line, and every border row as a
 * horizontal one. Registering a sub-frame of the window makes the repeat the window itself,
 * at its own pixel size — no scaling. The frame lives on the shared sheet texture and is
 * named after its rect, so a restarted run reuses it instead of leaking one frame per band
 * per scene.
 */
function windowFrame(
  scene: Phaser.Scene,
  frame: SpriteRef,
  window: TileWindow,
): string | number {
  const index = frame.frame ?? 0;
  const texture = scene.textures.get(frame.key);
  // Addressed as a string so frame 0 does not fall into `Texture.get(0)`'s falsy-name
  // branch, which resolves `firstFrame` instead of the frame asked for.
  const base = texture.get(String(index));

  const fullWidth = window.sourceX === 0 && window.sourceWidth >= base.cutWidth;
  const fullHeight = window.sourceY === 0 && window.sourceHeight >= base.cutHeight;
  if (fullWidth && fullHeight) return index;

  const name = `${index}:${window.sourceX}+${window.sourceWidth}:${window.sourceY}+${window.sourceHeight}`;
  if (texture.has(name)) return name;

  // `cutX/cutY/cutWidth/cutHeight` are the source rectangle. `x/y` are render offsets and
  // are zero on every untrimmed spritesheet frame — using them samples the sheet's
  // top-left cell for every band, which is exactly what the first render did.
  const added = texture.add(
    name,
    base.sourceIndex,
    base.cutX + window.sourceX,
    base.cutY + window.sourceY,
    window.sourceWidth,
    window.sourceHeight,
  );
  return added ? name : index;
}

/** The tiled road surface, scrolled by the same distance the drawn road uses. */
class RoadTileLayer {
  private readonly windows: RoadTileTheme;
  private readonly sprites: Phaser.GameObjects.TileSprite[];
  private readonly edgeSpec: EdgeTileSpec | null;
  private readonly edgeSprites: Phaser.GameObjects.TileSprite[];

  constructor(
    scene: Phaser.Scene,
    road: RoadProfile,
    frames: TileFrames,
    windows: RoadTileTheme,
    edgeSpec: EdgeTileSpec | null,
    edgeFrame: SpriteRef | null,
  ) {
    this.windows = windows;
    const edge = edgeSpec && edgeFrame ? { spec: edgeSpec, frame: edgeFrame } : null;
    this.edgeSpec = edge?.spec ?? null;
    this.sprites = planRoadTiles(road, 0, windows).map((band) =>
      this.createSprite(scene, band, frames[band.kind]),
    );
    this.edgeSprites = edge
      ? planRoadEdges(road, 0, edge.spec).map((band) =>
          this.createEdgeSprite(scene, band, edge.frame),
        )
      : [];
  }

  private createSprite(
    scene: Phaser.Scene,
    band: TileBandPlan,
    frame: SpriteRef,
  ): Phaser.GameObjects.TileSprite {
    const sprite = scene.add.tileSprite(
      band.x,
      0,
      band.width,
      WORLD.height,
      frame.key,
      windowFrame(scene, frame, band),
    );

    sprite.setOrigin(0, 0).setDepth(1);
    sprite.tilePositionY = band.offset;

    return sprite;
  }

  /**
   * The transition strip covering a shoulder.
   *
   * One depth above the bands and one below the drawn markings, so the road furniture
   * (edge line, guardrail ticks) still paints over it.
   */
  private createEdgeSprite(
    scene: Phaser.Scene,
    band: EdgeBandPlan,
    frame: SpriteRef,
  ): Phaser.GameObjects.TileSprite {
    const sprite = scene.add.tileSprite(
      band.x,
      0,
      band.width,
      WORLD.height,
      frame.key,
      windowFrame(scene, frame, band),
    );

    sprite.setOrigin(0, 0).setDepth(1.5);
    sprite.tilePositionY = band.offset;

    return sprite;
  }

  /**
   * Follow the road's current cross-section.
   *
   * The band plan is geometry, not texture: a `TileSprite` repeats its window at native
   * size, so moving the band and resizing it reveals more or less of the same repeat and
   * nothing is ever scaled. That is what lets a variable-width road keep its generated
   * tiles instead of falling back to the drawn theme.
   */
  render(road: RoadProfile, distance: number): void {
    const bands = planRoadTiles(road, distance, this.windows);
    bands.forEach((band, index) => {
      const sprite = this.sprites[index];
      if (!sprite) return;
      sprite.setPosition(band.x, 0);
      if (sprite.width !== band.width) sprite.setSize(band.width, WORLD.height);
      sprite.tilePositionY = band.offset;
    });

    if (!this.edgeSpec) return;
    const edges = planRoadEdges(road, distance, this.edgeSpec);
    edges.forEach((band, index) => {
      const sprite = this.edgeSprites[index];
      if (!sprite) return;
      sprite.setPosition(band.x, 0);
      sprite.tilePositionY = band.offset;
    });
  }

  setVisible(visible: boolean): void {
    for (const sprite of this.sprites) sprite.setVisible(visible);
    for (const sprite of this.edgeSprites) sprite.setVisible(visible);
  }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
    for (const sprite of this.edgeSprites) sprite.destroy();
  }
}

export class RoadSystem {
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly markings: Phaser.GameObjects.Graphics;
  private readonly tiles: RoadTileLayer | null;
  private readonly theme: RoadTheme;
  /** The sector's width plan. Every band is sampled out of it at render time. */
  private readonly shape: RoadShape;
  /**
   * Whether the drawn markings are painted over the tiles.
   *
   * Every road except tiled water keeps them: edge lines and guardrail ticks are road
   * furniture. A river has no paint and no rails — the channel edge is the pier shoulder
   * in the water sheet — so the tiled water theme drops them. Without tiles the drawn
   * theme is all there is, so the fallback keeps them and still reads as a road.
   */
  private readonly painted: boolean;

  constructor(
    scene: Phaser.Scene,
    shape: RoadShape,
    type: LevelType,
    art: Art,
  ) {
    this.shape = shape;
    this.theme = THEMES[type];

    // Three layers, back to front: drawn fills, generated tiles, drawn markings. The
    // fills stay underneath so the road still reads when a sheet is missing or rejected,
    // and so a band that has no frame for one lane divider cannot leave a hole.
    this.base = scene.add.graphics().setDepth(0);
    const profile = roadAt(shape, 0);
    const spec = ROAD_TILE_SPECS[type];
    const frames = spec ? tileFrames(art, spec.art) : null;
    const edgeSpec = ROAD_EDGE_SPECS[type] ?? null;
    const edgeFrame = edgeSpec ? firstFrame(art, edgeSpec.art) : null;
    this.tiles =
      spec && frames
        ? new RoadTileLayer(scene, profile, frames, spec.windows, edgeSpec, edgeFrame)
        : null;
    this.painted = !(type === 'river' && this.tiles !== null);
    this.markings = scene.add.graphics().setDepth(2);
  }

  /**
   * Redraw for the current scroll offset.
   *
   * `distance` is the car's own world position, which is also the cross-section the whole
   * screen is drawn from: the road is centred on the aperture, so the band under the camera
   * is the one the driver is on. Cheap: a few dozen rects plus a band plan.
   */
  render(distance: number): void {
    const profile = roadAt(this.shape, distance);
    this.drawBase(profile);
    this.tiles?.render(profile, distance);
    this.drawMarkings(profile, distance);
  }

  /** Terrain, shoulders and surface. Covers the screen; always drawn, tiled or not. */
  private drawBase(road: RoadProfile): void {
    const g = this.base;
    const { theme } = this;
    const right = road.left + road.width;

    g.clear();

    // Terrain bands.
    g.fillStyle(theme.terrainLeft, 1);
    g.fillRect(0, 0, road.left, WORLD.height);
    g.fillStyle(theme.terrainRight, 1);
    g.fillRect(right, 0, WORLD.width - right, WORLD.height);

    // Shoulder strips.
    g.fillStyle(theme.shoulder, 1);
    g.fillRect(road.left - 8, 0, 8, WORLD.height);
    g.fillRect(right, 0, 8, WORLD.height);

    // Road surface.
    g.fillStyle(theme.roadFill, 1);
    g.fillRect(road.left, 0, road.width, WORLD.height);
  }

  /**
   * Edge lines, lane dashes and guardrail ticks.
   *
   * Edge lines and the rail always come from the profile, except on tiled water where the
   * channel is marked by the sheet's shoulders. The lane dashes are skipped when tiles are
   * drawing them, so the marking is not painted twice at two phases.
   */
  private drawMarkings(road: RoadProfile, distance: number): void {
    const g = this.markings;
    const { theme } = this;
    const right = road.left + road.width;

    g.clear();

    if (this.painted) {
      // Solid edge lines.
      g.fillStyle(theme.edgeLine, 1);
      g.fillRect(road.left + 3, 0, 3, WORLD.height);
      g.fillRect(right - 6, 0, 3, WORLD.height);
    }

    // Dashed lane dividers, scrolled.
    if (!this.tiles) {
      const period = DASH_LENGTH + DASH_GAP;
      const offset = ((distance % period) + period) % period;
      g.fillStyle(theme.dashLine, 0.85);

      for (let lane = 1; lane < road.lanes; lane += 1) {
        const x = road.left + lane * road.laneWidth - 2;
        for (let y = -DASH_LENGTH; y < WORLD.height + DASH_LENGTH; y += period) {
          g.fillRect(x, y + offset, 4, DASH_LENGTH);
        }
      }
    }

    if (!this.painted) return;

    // Guardrail ticks on the shoulder, scrolling at the same rate: cheap speed cue.
    g.fillStyle(theme.edgeLine, 0.35);
    const railOffset = ((distance % 48) + 48) % 48;
    for (let y = -48; y < WORLD.height + 48; y += 48) {
      g.fillRect(road.left - 7, y + railOffset, 5, 12);
      g.fillRect(right + 2, y + railOffset, 5, 12);
    }
  }

  setVisible(visible: boolean): void {
    this.base.setVisible(visible);
    this.markings.setVisible(visible);
    this.tiles?.setVisible(visible);
  }

  destroy(): void {
    this.base.destroy();
    this.markings.destroy();
    this.tiles?.destroy();
  }
}
