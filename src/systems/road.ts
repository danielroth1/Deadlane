import Phaser from 'phaser';
import type { Art, SpriteRef } from '@/art';
import { HIGHWAY_TILE_ART, type HighwayTileKind } from '@/art/ids';
import { GAME } from '@/config';
import { PALETTE } from '@/palette';
import type { LevelType, RoadProfile } from '@/levels/types';
import { planHighwayTiles, type HighwayTileBandPlan } from './road-tiles';

/**
 * Procedural road renderer with an optional tiled surface.
 *
 * The road is drawn from the locked palette as the baseline: the game must look correct
 * before any AI tiles exist, and a drawn road scrolls at any speed without texture seams.
 * When `art-13-tiles-highway` is approved, a tile layer is inserted between the fills and
 * the markings. The profile geometry (`left`, `width`, `lanes`, `laneWidth`) stays
 * authoritative in both modes — the tile planner only chooses where frames sit, never
 * where the road is.
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

type HighwayTileFrames = Readonly<Record<HighwayTileKind, SpriteRef>>;

/** First generated frame for a role, or null when the sheet has none. */
function firstTileFrame(art: Art, kind: HighwayTileKind): SpriteRef | null {
  for (const id of HIGHWAY_TILE_ART[kind]) {
    const ref = art.frameFor(id);
    if (ref) return ref;
  }
  return null;
}

/**
 * Frames for every role, or null if any role is missing.
 *
 * All-or-nothing is deliberate: a partly tiled road would show one band of generated art
 * against three drawn bands. A sheet missing one role steps back to the drawn theme.
 */
function highwayTileFrames(art: Art): HighwayTileFrames | null {
  const surface = firstTileFrame(art, 'surface');
  const dash = firstTileFrame(art, 'dash');
  const shoulder = firstTileFrame(art, 'shoulder');
  const terrain = firstTileFrame(art, 'terrain');

  if (!surface || !dash || !shoulder || !terrain) return null;
  return { surface, dash, shoulder, terrain };
}

/** The tiled highway surface, scrolled by the same distance the drawn road uses. */
class HighwayTileLayer {
  private readonly road: RoadProfile;
  private readonly sprites: Phaser.GameObjects.TileSprite[];

  constructor(scene: Phaser.Scene, road: RoadProfile, frames: HighwayTileFrames) {
    this.road = road;
    this.sprites = planHighwayTiles(road, 0).map((band) =>
      this.createSprite(scene, band, frames[band.kind]),
    );
  }

  private createSprite(
    scene: Phaser.Scene,
    band: HighwayTileBandPlan,
    frame: SpriteRef,
  ): Phaser.GameObjects.TileSprite {
    const sprite = scene.add.tileSprite(
      band.x,
      0,
      band.width,
      GAME.height,
      frame.key,
      frame.frame,
    );

    sprite.setOrigin(0, 0).setDepth(1);
    sprite.tileScaleX = band.scaleX;
    sprite.tilePositionX = band.sourceX;
    sprite.tilePositionY = band.offset;

    return sprite;
  }

  render(distance: number): void {
    const bands = planHighwayTiles(this.road, distance);
    bands.forEach((band, index) => {
      const sprite = this.sprites[index];
      if (sprite) sprite.tilePositionY = band.offset;
    });
  }

  setVisible(visible: boolean): void {
    for (const sprite of this.sprites) sprite.setVisible(visible);
  }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
  }
}

export class RoadSystem {
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly markings: Phaser.GameObjects.Graphics;
  private readonly tiles: HighwayTileLayer | null;
  private readonly theme: RoadTheme;
  private readonly road: RoadProfile;

  constructor(
    scene: Phaser.Scene,
    road: RoadProfile,
    type: LevelType,
    art: Art,
  ) {
    this.road = road;
    this.theme = THEMES[type];

    // Three layers, back to front: drawn fills, generated tiles, drawn markings. The
    // fills stay underneath so the transparent margins of the processed tiles reveal
    // asphalt and grass instead of blanking the road.
    this.base = scene.add.graphics().setDepth(0);
    const frames = type === 'highway' ? highwayTileFrames(art) : null;
    this.tiles = frames ? new HighwayTileLayer(scene, road, frames) : null;
    this.markings = scene.add.graphics().setDepth(2);
  }

  /** Redraw for the current scroll offset. Cheap: a few dozen rects plus tile offsets. */
  render(distance: number): void {
    this.drawBase();
    this.tiles?.render(distance);
    this.drawMarkings(distance);
  }

  /** Terrain, shoulders and surface. Covers the screen; always drawn, tiled or not. */
  private drawBase(): void {
    const g = this.base;
    const { road, theme } = this;
    const right = road.left + road.width;

    g.clear();

    // Terrain bands.
    g.fillStyle(theme.terrainLeft, 1);
    g.fillRect(0, 0, road.left, GAME.height);
    g.fillStyle(theme.terrainRight, 1);
    g.fillRect(right, 0, GAME.width - right, GAME.height);

    // Shoulder strips.
    g.fillStyle(theme.shoulder, 1);
    g.fillRect(road.left - 8, 0, 8, GAME.height);
    g.fillRect(right, 0, 8, GAME.height);

    // Road surface.
    g.fillStyle(theme.roadFill, 1);
    g.fillRect(road.left, 0, road.width, GAME.height);
  }

  /**
   * Edge lines, lane dashes and guardrail ticks.
   *
   * Edge lines and the rail always come from the profile. The lane dashes are skipped
   * when tiles are drawing them, so the marking is not painted twice at two phases.
   */
  private drawMarkings(distance: number): void {
    const g = this.markings;
    const { road, theme } = this;
    const right = road.left + road.width;

    g.clear();

    // Solid edge lines.
    g.fillStyle(theme.edgeLine, 1);
    g.fillRect(road.left + 3, 0, 3, GAME.height);
    g.fillRect(right - 6, 0, 3, GAME.height);

    // Dashed lane dividers, scrolled.
    if (!this.tiles) {
      const period = DASH_LENGTH + DASH_GAP;
      const offset = ((distance % period) + period) % period;
      g.fillStyle(theme.dashLine, 0.85);

      for (let lane = 1; lane < road.lanes; lane += 1) {
        const x = road.left + lane * road.laneWidth - 2;
        for (let y = -DASH_LENGTH; y < GAME.height + DASH_LENGTH; y += period) {
          g.fillRect(x, y + offset, 4, DASH_LENGTH);
        }
      }
    }

    // Guardrail ticks on the shoulder, scrolling at the same rate: cheap speed cue.
    g.fillStyle(theme.edgeLine, 0.35);
    const railOffset = ((distance % 48) + 48) % 48;
    for (let y = -48; y < GAME.height + 48; y += 48) {
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
