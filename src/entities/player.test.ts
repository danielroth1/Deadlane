import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import type { Art } from '@/art';
import { PLAYER } from '@/config';
import {
  displayScale,
  HALF_HEIGHT_RATIO,
  HALF_WIDTH_RATIO,
  PlayerVehicle,
} from './player';

/**
 * These tests deliberately avoid Phaser and jsdom.
 *
 * `PlayerVehicle` only touches four things on its sprite: `width`/`height` to read the
 * native frame, `setScale`, `setDepth`, and `displayWidth`/`displayHeight` when the
 * collision half-extents are asked for. A stub that models exactly that is enough to prove
 * the on-screen footprint, and it keeps the test fast and deterministic.
 */
class StubImage {
  x = 0;
  y = 0;
  scaleX = 1;
  scaleY = 1;
  depth = 0;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  get displayWidth(): number {
    return this.width * this.scaleX;
  }

  get displayHeight(): number {
    return this.height * this.scaleY;
  }

  setScale(x: number, y: number = x): this {
    this.scaleX = x;
    this.scaleY = y;
    return this;
  }

  setDepth(depth: number): this {
    this.depth = depth;
    return this;
  }
}

interface Fixture {
  readonly player: PlayerVehicle;
  readonly image: StubImage;
}

/** Build a player whose art resolves to a single square frame of `nativeSize` pixels. */
function makePlayer(nativeSize: number): Fixture {
  const image = new StubImage(nativeSize, nativeSize);
  const art = { imageAny: () => image } as unknown as Art;
  const scene = {} as unknown as Phaser.Scene;
  return { player: new PlayerVehicle(scene, art), image };
}

describe('displayScale', () => {
  it('halves a 128 px sheet cell', () => {
    expect(displayScale(128)).toBe(0.5);
  });

  it('leaves a 64 px placeholder frame alone', () => {
    expect(displayScale(64)).toBe(1);
  });

  it('falls back to 1 when the frame has no size', () => {
    expect(displayScale(0)).toBe(1);
  });

  it('honours an explicit target size', () => {
    expect(displayScale(128, 32)).toBe(0.25);
    expect(displayScale(32, 64)).toBe(2);
  });

  it('draws a 128 px frame at exactly PLAYER.spriteSize', () => {
    expect(128 * displayScale(128)).toBe(PLAYER.spriteSize);
  });
});

describe('PlayerVehicle footprint', () => {
  it('draws a 128 px sheet cell at PLAYER.spriteSize wide', () => {
    const { player, image } = makePlayer(128);

    expect(image.scaleX).toBe(displayScale(128));
    expect(player.sprite.displayWidth).toBe(64);
    expect(player.sprite.displayWidth).toBe(PLAYER.spriteSize);
    expect(player.sprite.displayHeight).toBe(PLAYER.spriteSize);
  });

  it('draws the 64 px placeholder at PLAYER.spriteSize wide', () => {
    const { player, image } = makePlayer(64);

    expect(image.scaleX).toBe(1);
    expect(player.sprite.displayWidth).toBe(64);
    expect(player.sprite.displayWidth).toBe(PLAYER.spriteSize);
    expect(player.sprite.displayHeight).toBe(PLAYER.spriteSize);
  });

  it('keeps the sheet and placeholder paths on the same collision box', () => {
    const sheet = makePlayer(128).player;
    const placeholder = makePlayer(64).player;

    // Logged so the reviewer sees the actual footprint, not just a green tick.
    const rows = [
      { path: 'sheet       128px', player: sheet },
      { path: 'placeholder  64px', player: placeholder },
    ];
    for (const { path, player } of rows) {
      console.log(
        `${path} → displayWidth=${player.sprite.displayWidth} displayHeight=${player.sprite.displayHeight} ` +
          `halfWidth=${player.halfWidth} halfHeight=${player.halfHeight}`,
      );
      expect(player.sprite.displayWidth).toBe(64);
      expect(player.sprite.displayHeight).toBe(64);
      expect(player.halfWidth).toBe(23.04);
      expect(player.halfHeight).toBe(26.88);
    }

    expect(sheet.halfWidth).toBe(placeholder.halfWidth);
    expect(sheet.halfHeight).toBe(placeholder.halfHeight);
  });

  it('derives the collision box from the displayed size, not the native frame', () => {
    const { player } = makePlayer(128);

    expect(player.halfWidth).toBe(PLAYER.spriteSize * HALF_WIDTH_RATIO);
    expect(player.halfHeight).toBe(PLAYER.spriteSize * HALF_HEIGHT_RATIO);
    // The 128 px native frame, unscaled, would have produced these numbers instead.
    expect(player.halfWidth).not.toBe(128 * HALF_WIDTH_RATIO);
    expect(player.halfHeight).not.toBe(128 * HALF_HEIGHT_RATIO);
  });

  it('scales non-square frames by their longest side', () => {
    const image = new StubImage(128, 96);
    const art = { imageAny: () => image } as unknown as Art;
    const scene = {} as unknown as Phaser.Scene;
    const player = new PlayerVehicle(scene, art);

    expect(player.sprite.displayWidth).toBe(PLAYER.spriteSize);
    expect(player.sprite.displayHeight).toBe(96 * displayScale(128));
  });
});

describe('weapon cooldowns', () => {
  /** The player never touches the clock here, so an empty scene is enough. */
  function makeBarePlayer(): PlayerVehicle {
    const art = { imageAny: () => new StubImage(64, 64) } as unknown as Art;
    return new PlayerVehicle({} as unknown as Phaser.Scene, art);
  }

  it('paces the gun with the cooldown it is handed, not one of its own', () => {
    const player = makeBarePlayer();

    expect(player.canFire(1_000, 180)).toBe(true);
    expect(player.canFire(1_100, 180)).toBe(false);
    expect(player.canFire(1_180, 180)).toBe(true);
  });

  it('will not spend two oils inside the slick cooldown', () => {
    const player = makeBarePlayer();
    const starting = player.oil;

    expect(player.useOil(0, 900)).toBe(true);
    expect(player.useOil(400, 900)).toBe(false);
    expect(player.oil).toBe(starting - 1);
    expect(player.useOil(900, 900)).toBe(true);
    expect(player.oil).toBe(starting - 2);
  });

  it('refuses a smoke cloud it does not have', () => {
    const player = makeBarePlayer();

    for (let i = 0; i < PLAYER.startSmoke; i += 1) {
      expect(player.useSmoke(i * 1400, 1400)).toBe(true);
    }
    expect(player.smoke).toBe(0);
    expect(player.useSmoke(PLAYER.startSmoke * 1400, 1400)).toBe(false);
  });
});
