import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import type { Art } from '@/art';
import { OFFROAD, JUMP, PLAYER, SURFACE } from '@/config';
import { roadProfileFor } from '@/levels/types';
import {
  displayScale,
  HALF_HEIGHT_RATIO,
  HALF_WIDTH_RATIO,
  playerArtState,
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
  rotation = 0;
  alpha = 1;
  textureKey = '';
  frame = -1;

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

  setRotation(rotation: number): this {
    this.rotation = rotation;
    return this;
  }

  setAlpha(alpha: number): this {
    this.alpha = alpha;
    return this;
  }

  setTexture(key: string, frame?: number): this {
    this.textureKey = key;
    if (frame !== undefined) this.frame = frame;
    return this;
  }

  setTint(): this {
    return this;
  }

  clearTint(): this {
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

describe('playerArtState', () => {
  it('is clean at or above the starting armour', () => {
    expect(playerArtState(PLAYER.startArmor)).toBe('clean');
    expect(playerArtState(PLAYER.maxArmor)).toBe('clean');
  });

  it('is damaged after losing armour but before it runs out', () => {
    expect(playerArtState(PLAYER.startArmor - 1)).toBe('damaged');
    expect(playerArtState(1)).toBe('damaged');
  });

  it('is wrecked at zero or below', () => {
    expect(playerArtState(0)).toBe('wrecked');
    expect(playerArtState(-2)).toBe('wrecked');
  });

  it('walks the tiers from full armour down to wrecked', () => {
    // 5, 4, 3 are at or above the starting loadout; 2 and 1 are damaged; 0 is wrecked.
    expect([
      playerArtState(5),
      playerArtState(4),
      playerArtState(3),
      playerArtState(2),
      playerArtState(1),
      playerArtState(0),
    ]).toEqual(['clean', 'clean', 'clean', 'damaged', 'damaged', 'wrecked']);
  });
});

describe('lean', () => {
  function sceneAt(now: number): Phaser.Scene {
    return { time: { now } } as unknown as Phaser.Scene;
  }

  function playerAt(now = 0): { player: PlayerVehicle; image: StubImage } {
    const image = new StubImage(64, 64);
    const art = { imageAny: () => image } as unknown as Art;
    return { player: new PlayerVehicle(sceneAt(now), art), image };
  }

  const thresholdSteer = PLAYER.leanThreshold / PLAYER.lateralSpeed;
  /** The road the car leans on: the highway's nominal cross-section. */
  const ROAD = roadProfileFor('highway');

  it('does not lean below PLAYER.leanThreshold', () => {
    const { player, image } = playerAt();

    player.update(0, thresholdSteer * 0.99, 0, ROAD);

    expect(image.rotation).toBe(0);
  });

  it('leans above PLAYER.leanThreshold', () => {
    const { player, image } = playerAt();

    player.update(0, thresholdSteer * 1.01, 0, ROAD);

    expect(image.rotation).toBeCloseTo((2.5 * Math.PI) / 180);
  });

  it('leans the other way for negative steer', () => {
    const { player, image } = playerAt();

    player.update(0, -1, 0, ROAD);

    expect(image.rotation).toBeCloseTo((-2.5 * Math.PI) / 180);
  });

  it('may leave the surface, but only as far as the apron', () => {
    const { player, image } = playerAt();
    // The stub image is not placed by `imageAny`, so start the car where the road is.
    image.x = ROAD.left + ROAD.width / 2;

    // A full second of full steer is 260 px, far past the right edge.
    for (let i = 0; i < 60; i += 1) player.update(1 / 60, 1, 0, ROAD);

    expect(player.isOffRoad(ROAD)).toBe(true);
    expect(image.x).toBeCloseTo(ROAD.left + ROAD.width + OFFROAD.apron);

    for (let i = 0; i < 120; i += 1) player.update(1 / 60, -1, 0, ROAD);

    expect(player.isOffRoad(ROAD)).toBe(true);
    expect(image.x).toBeCloseTo(ROAD.left - OFFROAD.apron);
  });
});

describe('ramp jump', () => {
  const ROAD = roadProfileFor('highway');

  function jumpable(): { player: PlayerVehicle; image: StubImage } {
    const image = new StubImage(64, 64);
    const art = { imageAny: () => image } as unknown as Art;
    const scene = { time: { now: 0 } } as unknown as Phaser.Scene;
    return { player: new PlayerVehicle(scene, art), image };
  }

  it('starts on the ground', () => {
    const { player } = jumpable();

    expect(player.isAirborne).toBe(false);
    expect(player.airHeight).toBe(0);
  });

  it('lifts the sprite by its height and puts it back on landing', () => {
    const { player, image } = jumpable();

    player.jump(400);
    expect(player.isAirborne).toBe(true);

    // Half the arc: the apex, so the sprite is above its station by the apex height.
    player.update(0.2, 0, 0, ROAD);
    expect(player.airHeight).toBeCloseTo(JUMP.apexHeight);
    expect(image.y).toBeCloseTo(PLAYER.y - JUMP.apexHeight);

    const landed = player.update(0.2, 0, 0, ROAD);
    expect(landed).toBe(true);
    expect(player.isAirborne).toBe(false);
    expect(image.y).toBe(PLAYER.y);
  });

  it('reports the landing on exactly one frame', () => {
    const { player } = jumpable();
    player.jump(200);

    expect(player.update(0.1, 0, 0, ROAD)).toBe(false);
    expect(player.update(0.1, 0, 0, ROAD)).toBe(true);
    expect(player.update(0.1, 0, 0, ROAD)).toBe(false);
  });
});

describe('player art states', () => {
  interface ArtCall {
    readonly ids: readonly string[];
  }

  interface StubClock {
    now: number;
    delayedCall: (ms: number, callback: () => void) => void;
  }

  function makeScene(): { scene: Phaser.Scene; clock: StubClock } {
    const clock: StubClock = {
      now: 0,
      delayedCall: (_ms: number, callback: () => void) => callback(),
    };
    return { scene: { time: clock } as unknown as Phaser.Scene, clock };
  }

  function makeFixture(): {
    player: PlayerVehicle;
    image: StubImage;
    calls: ArtCall[];
    clock: StubClock;
  } {
    const image = new StubImage(128, 128);
    const calls: ArtCall[] = [];
    const art = {
      imageAny: () => image,
      refAny: (ids: readonly string[]) => {
        calls.push({ ids });
        return { key: `sheet:${ids[0]}`, frame: calls.length };
      },
    } as unknown as Art;
    const { scene, clock } = makeScene();
    return { player: new PlayerVehicle(scene, art), image, calls, clock };
  }

  /** Spend every point of armour through the real hit path, stepping past i-frames. */
  function wreck(player: PlayerVehicle, clock: StubClock): void {
    for (let i = 0; i < PLAYER.startArmor; i += 1) {
      clock.now += PLAYER.iFrames;
      expect(player.takeHit(clock.now)).toBe(true);
    }
  }

  it('starts on the clean frame', () => {
    const { player } = makeFixture();

    expect(player.armor).toBe(PLAYER.startArmor);
    expect(playerArtState(player.armor)).toBe('clean');
  });

  it('switches to the damaged frame after a hit and back when repaired', () => {
    const { player, image, calls } = makeFixture();

    expect(player.takeHit(0)).toBe(true);
    expect(calls.at(-1)?.ids[0]).toBe('player-vehicle/interceptor-damaged');
    expect(image.textureKey).toBe('sheet:player-vehicle/interceptor-damaged');

    player.addArmor(PLAYER.maxArmor);
    expect(calls.at(-1)?.ids[0]).toBe('player-vehicle/interceptor-clean');
    expect(image.textureKey).toBe('sheet:player-vehicle/interceptor-clean');
  });

  it('shows the wrecked frame when the run ends', () => {
    const { player, image, calls } = makeFixture();

    player.showWrecked();

    expect(calls.at(-1)?.ids[0]).toBe('player-vehicle/interceptor-wrecked');
    expect(image.textureKey).toBe('sheet:player-vehicle/interceptor-wrecked');
  });

  it('shows the wrecked frame when the last point of armour goes', () => {
    const { player, image, calls, clock } = makeFixture();

    wreck(player, clock);

    expect(player.isDestroyed).toBe(true);
    expect(calls.at(-1)?.ids[0]).toBe('player-vehicle/interceptor-wrecked');
    expect(image.textureKey).toBe('sheet:player-vehicle/interceptor-wrecked');
  });

  it('stays wrecked when a pickup lands during the game-over delay', () => {
    const { player, image, clock } = makeFixture();
    wreck(player, clock);

    // The scene keeps ticking for 600 ms after `endRun()`, so an armour or shield
    // pickup overlapping the player still reaches `applyPickup` → `addArmor`.
    player.addArmor(1);

    expect(player.armor).toBe(1);
    expect(image.textureKey).toBe('sheet:player-vehicle/interceptor-wrecked');
  });

  it('keeps the footprint at PLAYER.spriteSize across state changes', () => {
    const { player } = makeFixture();
    const before = player.sprite.displayWidth;

    player.showWrecked();

    expect(before).toBe(PLAYER.spriteSize);
    expect(player.sprite.displayWidth).toBe(PLAYER.spriteSize);
  });

  it('comes back on the clean frame with a full loadout after a respawn', () => {
    const { player, image, calls, clock } = makeFixture();

    wreck(player, clock);
    expect(player.isDestroyed).toBe(true);

    clock.now += 50;
    player.respawn(clock.now);

    expect(player.armor).toBe(PLAYER.startArmor);
    expect(player.isDestroyed).toBe(false);
    expect(calls.at(-1)?.ids[0]).toBe('player-vehicle/interceptor-clean');
    expect(image.textureKey).toBe('sheet:player-vehicle/interceptor-clean');
  });

  it('grants a longer invulnerability window on respawn than on a hit', () => {
    const { player, clock } = makeFixture();

    wreck(player, clock);
    player.respawn(clock.now);

    expect(player.isInvulnerable).toBe(true);
    // Past the ordinary i-frame window and still protected: a respawn is not a hit.
    clock.now += PLAYER.iFrames + 1;
    expect(player.isInvulnerable).toBe(true);
    clock.now += PLAYER.respawnIFrames;
    expect(player.isInvulnerable).toBe(false);
  });

  it('lets the debug control arm a killing hit past the i-frame window', () => {
    const { player, clock } = makeFixture();

    wreck(player, clock);
    player.respawn(clock.now);
    expect(player.isInvulnerable).toBe(true);

    player.debugArmLastHit();

    expect(player.armor).toBe(1);
    expect(player.isInvulnerable).toBe(false);
    expect(player.takeHit(clock.now)).toBe(true);
    expect(player.isDestroyed).toBe(true);
  });
});

describe('weapon cooldowns', () => {
  /** The player never touches the clock here, so an empty scene is enough. */
  function makeBarePlayer(): PlayerVehicle {
    const image = new StubImage(64, 64);
    const art = {
      imageAny: () => image,
      refAny: (ids: readonly string[]) => ({ key: `sheet:${ids[0]}`, frame: 0 }),
    } as unknown as Art;
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

/**
 * Land and water hulls.
 *
 * The car and the hover interceptor are one entity with two looks and two handling
 * models: the same controls, but the hull carries lateral momentum instead of steering
 * directly. These tests pin the switch and the inertia; the art id is asserted so the boat
 * frame cannot quietly fall back to the car.
 */
describe('surface hull', () => {
  function hullPlayer(): { player: PlayerVehicle; image: StubImage; ids: string[] } {
    const image = new StubImage(64, 64);
    const ids: string[] = [];
    const art = {
      imageAny: () => image,
      has: () => true,
      refAny: (candidates: readonly string[]) => {
        const id = candidates[0] ?? 'fallback';
        ids.push(id);
        return { key: id, frame: 0 };
      },
    } as unknown as Art;
    const scene = { time: { now: 0 } } as unknown as Phaser.Scene;
    return { player: new PlayerVehicle(scene, art), image, ids };
  }

  const WATER = { ...roadProfileFor('river'), surface: 'water' } as const;
  const LAND = roadProfileFor('highway');

  it('starts as the car on land and swaps to the shipped hull on water', () => {
    const { player, ids } = hullPlayer();

    expect(player.body).toBe('car');
    player.setSurface('water');

    expect(player.surface).toBe('water');
    expect(player.body).toBe('boat');
    expect(ids.at(-1)).toBe('player-vehicle/hover-interceptor');
  });

  it('swaps back to the car on land', () => {
    const { player } = hullPlayer();
    player.setSurface('water');
    player.setSurface('land');

    expect(player.body).toBe('car');
    expect(player.surface).toBe('land');
  });

  it('carries lateral momentum on water instead of snapping to the helm', () => {
    const { player, image } = hullPlayer();
    image.x = WATER.left + WATER.width / 2;
    player.setSurface('water');

    // One 16 ms frame cannot reach the hull's full lateral speed.
    player.update(0.016, 1, 0, WATER);
    const first = Math.abs(player.vx);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(SURFACE.waterLateralSpeed);

    // Held helm keeps accelerating toward it.
    for (let i = 0; i < 120; i += 1) player.update(1 / 60, 1, 0, WATER);
    expect(player.vx).toBeCloseTo(SURFACE.waterLateralSpeed);
  });

  it('keeps direct steering on land', () => {
    const { player, image } = hullPlayer();
    image.x = LAND.left + LAND.width / 2;

    player.update(0.016, 1, 0, LAND);

    expect(player.vx).toBe(PLAYER.lateralSpeed);
  });
});
