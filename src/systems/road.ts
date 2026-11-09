import Phaser from 'phaser';
import type { Art, SpriteRef } from '@/art';
import { SHORE_BANK_ART, SHORE_STRIPE_ART, type TileArtByKind, type TileKind } from '@/art/ids';
import { PLAYER, SURFACE, WORLD } from '@/config';
import { PALETTE } from '@/palette';
import {
  roadAt,
  type LevelType,
  type RoadProfile,
  type RoadShape,
  type SurfaceKind,
  type SurfaceSegment,
} from '@/levels/types';
import {
  ROAD_EDGE_SPECS,
  SHORE_BANK_WINDOW,
  SHORE_STRIPE_WINDOW,
  planRoadEdges,
  planRoadTiles,
  planSurfaceBands,
  roadTileSpecFor,
  type EdgeBandPlan,
  type EdgeTileSpec,
  type RoadTileTheme,
  type SurfaceBand,
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

/** A water stretch uses the river's palette; land in a river is a tarmac causeway. */
function themeFor(type: LevelType, surface: SurfaceKind): RoadTheme {
  if (surface === 'water') return THEMES.river;
  return THEMES[type === 'river' ? 'highway' : type];
}

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

  /** Clip this layer to the rows its own surface stretch occupies on screen. */
  setMask(mask: Phaser.Display.Masks.GeometryMask): void {
    for (const sprite of this.sprites) sprite.setMask(mask);
    for (const sprite of this.edgeSprites) sprite.setMask(mask);
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

/** One surface stretch: its theme, its tile layer and the mask that clips it. */
interface SurfaceLayer {
  readonly segment: SurfaceSegment;
  readonly theme: RoadTheme;
  readonly tiles: RoadTileLayer | null;
  /** Only exists when the sector holds more than one stretch; otherwise it is full screen. */
  readonly maskGraphics: Phaser.GameObjects.Graphics | null;
}

/** The bank and its marker line at one internal surface boundary. */
interface ShoreBand {
  /** Sector distance of the boundary. */
  readonly at: number;
  readonly bank: Phaser.GameObjects.TileSprite;
  readonly stripe: Phaser.GameObjects.TileSprite;
}

export class RoadSystem {
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly markings: Phaser.GameObjects.Graphics;
  private readonly layers: readonly SurfaceLayer[];
  /** The sector's width plan. Every band is sampled out of it at render time. */
  private readonly shape: RoadShape;
  /**
   * True when the sector holds more than one surface stretch.
   *
   * A single-stretch sector keeps the old path exactly: one unclipped tile layer covering
   * the screen. Only a mixed sector pays for masks and a bank band.
   */
  private readonly split: boolean;
  private readonly shores: readonly ShoreBand[];

  constructor(
    scene: Phaser.Scene,
    shape: RoadShape,
    type: LevelType,
    art: Art,
  ) {
    this.shape = shape;
    this.split = shape.surfaces.length > 1;

    // Three layers, back to front: drawn fills, generated tiles, drawn markings. The
    // fills stay underneath so the road still reads when a sheet is missing or rejected,
    // and so a band that has no frame for one lane divider cannot leave a hole.
    this.base = scene.add.graphics().setDepth(0);
    // Every stretch draws the same cross-section: the camera is one screen tall, so a
    // stretch boundary moves the material, never the road's geometry under it.
    const profile = roadAt(shape, 0);

    this.layers = shape.surfaces.map((segment) => {
      const spec = roadTileSpecFor(type, segment.kind);
      const frames = spec ? tileFrames(art, spec.art) : null;
      // A causeway keeps the level type's own shoulder blend; water's channel edge is the
      // sheet's deck, so no transition strip belongs there.
      const edgeSpec = segment.kind === 'land' ? ROAD_EDGE_SPECS[type] ?? null : null;
      const edgeFrame = edgeSpec ? firstFrame(art, edgeSpec.art) : null;
      const tiles =
        spec && frames
          ? new RoadTileLayer(scene, profile, frames, spec.windows, edgeSpec, edgeFrame)
          : null;

      const maskGraphics = this.split && tiles ? scene.make.graphics() : null;
      if (tiles && maskGraphics) tiles.setMask(maskGraphics.createGeometryMask());

      return { segment, theme: themeFor(type, segment.kind), tiles, maskGraphics };
    });

    this.markings = scene.add.graphics().setDepth(2);
    this.shores = this.createShores(scene, art);
  }

  /**
   * The bank and marker at every internal boundary.
   *
   * Cosmetic and world-static: each band sits at the boundary's own sector distance and is
   * repositioned from the scroll every frame, so it stays glued to the material change.
   * Missing frames leave the boundary to the two surface themes, which already differ.
   */
  private createShores(scene: Phaser.Scene, art: Art): ShoreBand[] {
    if (!this.split) return [];

    const bankFrame = firstFrame(art, SHORE_BANK_ART);
    const stripeFrame = firstFrame(art, SHORE_STRIPE_ART);
    if (!bankFrame && !stripeFrame) return [];

    const out: ShoreBand[] = [];
    for (let i = 1; i < this.shape.surfaces.length; i += 1) {
      const boundary = this.shape.surfaces[i];
      if (!boundary) continue;

      const bank = bankFrame
        ? scene.add
            .tileSprite(
              0,
              0,
              WORLD.width,
              SURFACE.shoreBandPixels,
              bankFrame.key,
              windowFrame(scene, bankFrame, SHORE_BANK_WINDOW),
            )
            .setOrigin(0, 0)
            .setDepth(1.7)
        : this.hiddenTile(scene, SURFACE.shoreBandPixels);

      const stripe = stripeFrame
        ? scene.add
            .tileSprite(
              0,
              0,
              WORLD.width,
              SURFACE.shoreStripePixels,
              stripeFrame.key,
              windowFrame(scene, stripeFrame, SHORE_STRIPE_WINDOW),
            )
            .setOrigin(0, 0)
            .setDepth(1.8)
        : this.hiddenTile(scene, SURFACE.shoreStripePixels);

      out.push({ at: boundary.from, bank, stripe });
    }

    return out;
  }

  /** An invisible placeholder so a half-drawn shore still has a stable pair of sprites. */
  private hiddenTile(scene: Phaser.Scene, height: number): Phaser.GameObjects.TileSprite {
    return scene.add
      .tileSprite(0, 0, 1, height, '__DEFAULT')
      .setOrigin(0, 0)
      .setVisible(false);
  }

  /** The layer that draws one visible band, matched by the stretch it belongs to. */
  private layerFor(band: SurfaceBand): SurfaceLayer | undefined {
    return this.layers.find(
      (layer) => layer.segment.from === band.from && layer.segment.kind === band.kind,
    );
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
    const bands = planSurfaceBands(this.shape, distance);

    this.drawBase(profile, bands);
    this.renderLayers(profile, distance, bands);
    this.drawMarkings(profile, distance, bands);
    this.renderShores(distance);
  }

  /** Every tile layer, clipped to the rows its stretch covers. */
  private renderLayers(
    profile: RoadProfile,
    distance: number,
    bands: readonly SurfaceBand[],
  ): void {
    if (!this.split) {
      this.layers[0]?.tiles?.render(profile, distance);
      return;
    }

    for (const layer of this.layers) layer.tiles?.setVisible(false);

    bands.forEach((band) => {
      const layer = this.layerFor(band);
      if (!layer) return;
      layer.tiles?.render(profile, distance);
      if (!layer.maskGraphics) return;

      // Overlap the mask by a pixel at each edge: a fractional camera row would otherwise
      // leave a hairline of the drawn base between two materials. The bank band covers it.
      const top = Math.max(0, Math.floor(band.yTop));
      const bottom = Math.min(WORLD.height, Math.ceil(band.yBottom) + 1);
      if (bottom <= top) return;

      layer.tiles?.setVisible(true);
      layer.maskGraphics.clear();
      layer.maskGraphics.fillStyle(0xffffff, 1);
      layer.maskGraphics.fillRect(0, top, WORLD.width, bottom - top);
    });
  }

  /** Terrain, shoulders and surface, one fill set per visible surface stretch. */
  private drawBase(road: RoadProfile, bands: readonly SurfaceBand[]): void {
    const g = this.base;
    const right = road.left + road.width;

    g.clear();

    bands.forEach((band) => {
      const theme = this.layerFor(band)?.theme ?? THEMES.highway;
      const top = Math.max(0, Math.floor(band.yTop));
      const bottom = Math.min(WORLD.height, Math.ceil(band.yBottom));
      const height = bottom - top;
      if (height <= 0) return;

      g.fillStyle(theme.terrainLeft, 1);
      g.fillRect(0, top, road.left, height);
      g.fillStyle(theme.terrainRight, 1);
      g.fillRect(right, top, WORLD.width - right, height);

      g.fillStyle(theme.shoulder, 1);
      g.fillRect(road.left - 8, top, 8, height);
      g.fillRect(right, top, 8, height);

      g.fillStyle(theme.roadFill, 1);
      g.fillRect(road.left, top, road.width, height);
    });
  }

  /**
   * Edge lines, lane dashes and guardrail ticks on land stretches only.
   *
   * The channel has no paint: its lane wakes come from the water sheet's foam band. Assumes
   * every land stretch in a sector draws the same theme, which is true because the causeway
   * is the only land a water-heavy sector has.
   */
  private drawMarkings(
    road: RoadProfile,
    distance: number,
    bands: readonly SurfaceBand[],
  ): void {
    const g = this.markings;
    const right = road.left + road.width;
    const landLayer = this.layers.find((layer) => layer.segment.kind === 'land');
    const landTiled = Boolean(landLayer?.tiles);
    const theme = landLayer?.theme ?? THEMES.highway;

    g.clear();

    for (const band of bands) {
      if (band.kind !== 'land') continue;

      const top = Math.max(0, Math.floor(band.yTop));
      const bottom = Math.min(WORLD.height, Math.ceil(band.yBottom));
      const height = bottom - top;
      if (height <= 0) continue;

      // Solid edge lines.
      g.fillStyle(theme.edgeLine, 1);
      g.fillRect(road.left + 3, top, 3, height);
      g.fillRect(right - 6, top, 3, height);

      // Dashed lane dividers, scrolled. The sheet draws them when it is present.
      if (!landTiled) {
        const period = DASH_LENGTH + DASH_GAP;
        const offset = ((distance % period) + period) % period;
        g.fillStyle(theme.dashLine, 0.85);

        for (let lane = 1; lane < road.lanes; lane += 1) {
          const x = road.left + lane * road.laneWidth - 2;
          for (let y = top - DASH_LENGTH; y < bottom + DASH_LENGTH; y += period) {
            g.fillRect(x, y + offset, 4, DASH_LENGTH);
          }
        }
      }

      // Guardrail ticks on the shoulder, scrolling at the same rate: cheap speed cue.
      g.fillStyle(theme.edgeLine, 0.35);
      const railOffset = ((distance % 48) + 48) % 48;
      for (let y = top - 48; y < bottom + 48; y += 48) {
        g.fillRect(road.left - 7, y + railOffset, 5, 12);
        g.fillRect(right + 2, y + railOffset, 5, 12);
      }
    }
  }

  /** Seat the shore bands on their own boundaries. */
  private renderShores(distance: number): void {
    for (const shore of this.shores) {
      const y = PLAYER.y + distance - shore.at;
      shore.bank.setPosition(0, Math.round(y - SURFACE.shoreBandPixels / 2));
      shore.stripe.setPosition(0, Math.round(y - SURFACE.shoreStripePixels / 2));
      const visible =
        y > -SURFACE.shoreBandPixels && y < WORLD.height + SURFACE.shoreBandPixels;
      shore.bank.setVisible(visible);
      shore.stripe.setVisible(visible);
    }
  }

  setVisible(visible: boolean): void {
    this.base.setVisible(visible);
    this.markings.setVisible(visible);
    for (const layer of this.layers) layer.tiles?.setVisible(visible);
    for (const shore of this.shores) {
      shore.bank.setVisible(visible);
      shore.stripe.setVisible(visible);
    }
  }

  destroy(): void {
    this.base.destroy();
    this.markings.destroy();
    for (const layer of this.layers) {
      layer.tiles?.destroy();
      layer.maskGraphics?.destroy();
    }
    for (const shore of this.shores) {
      shore.bank.destroy();
      shore.stripe.destroy();
    }
  }
}
