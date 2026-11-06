import Phaser from 'phaser';
import { GAME } from '@/config';
import { PALETTE } from '@/palette';
import type { LevelType, RoadProfile } from '@/levels/types';

/**
 * Procedural road renderer.
 *
 * The road is drawn from the locked palette rather than from tiles, for two reasons: the
 * game must look correct before any AI tiles exist, and a drawn road scrolls at any speed
 * without texture seams. When `art-13..art-18` are approved, `tileTexture` can be layered
 * underneath without changing any of this geometry.
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

export class RoadSystem {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly theme: RoadTheme;
  private readonly road: RoadProfile;

  constructor(
    scene: Phaser.Scene,
    road: RoadProfile,
    type: LevelType,
  ) {
    this.road = road;
    this.theme = THEMES[type];
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(0);
  }

  /** Redraw for the current scroll offset. Cheap: a few dozen rects. */
  render(distance: number): void {
    const g = this.graphics;
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

    // Solid edge lines.
    g.fillStyle(theme.edgeLine, 1);
    g.fillRect(road.left + 3, 0, 3, GAME.height);
    g.fillRect(right - 6, 0, 3, GAME.height);

    // Dashed lane dividers, scrolled.
    const offset = ((distance % (DASH_LENGTH + DASH_GAP)) + DASH_LENGTH + DASH_GAP) % (DASH_LENGTH + DASH_GAP);
    g.fillStyle(theme.dashLine, 0.85);

    for (let lane = 1; lane < road.lanes; lane += 1) {
      const x = road.left + lane * road.laneWidth - 2;
      for (let y = -DASH_LENGTH; y < GAME.height + DASH_LENGTH; y += DASH_LENGTH + DASH_GAP) {
        g.fillRect(x, y + offset, 4, DASH_LENGTH);
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
    this.graphics.setVisible(visible);
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
