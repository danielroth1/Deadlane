import { describe, expect, it } from 'vitest';
import { PLAYER, WEAPON_FX } from '@/config';
import {
  forwardShot,
  oilCatches,
  returnShot,
  screenYFromWorldAt,
  smokeBlocksFire,
  worldAtFromScreenY,
} from './weapons';

/**
 * Weapon geometry, with no Phaser in sight.
 *
 * The world is one number (`at`): the player sits at the run's `distance`, and a point at
 * `at` is drawn at `PLAYER.y + distance - at`. These tests pin that projection and the
 * three behaviours the scene builds on top of it.
 */

const PLAYER_Y = PLAYER.y;

describe('world projection', () => {
  it('projects and unprojects a screen point', () => {
    expect(screenYFromWorldAt(1200, 1000)).toBe(PLAYER_Y + 1000 - 1200);
    expect(worldAtFromScreenY(PLAYER_Y + 1000 - 1200, 1000)).toBe(1200);
  });

  it('puts anything ahead of the car above it on screen', () => {
    const ahead = screenYFromWorldAt(1300, 1000);
    expect(ahead).toBeLessThan(PLAYER_Y);
  });

  it('takes an explicit horizon for tests', () => {
    expect(worldAtFromScreenY(0, 500, 300)).toBe(800);
  });
});

describe('forwardShot', () => {
  it('leaves the muzzle ahead of the car and keeps travelling away', () => {
    const muzzleY = PLAYER_Y - 26;
    const shot = forwardShot(muzzleY, 1000, 640);

    expect(shot.at).toBe(1026);
    expect(shot.at).toBeGreaterThan(1000);
    expect(shot.speed).toBe(640);
    expect(shot.driftX).toBe(0);
    expect(screenYFromWorldAt(shot.at, 1000)).toBe(muzzleY);
  });
});

describe('returnShot', () => {
  const input = {
    enemyX: 200,
    enemyY: 100,
    playerX: 320,
    playerY: PLAYER_Y,
    distance: 0,
    scroll: 300,
    projectileSpeed: 260,
  };

  it('spawns at the hostile, not below the player', () => {
    const shot = returnShot(input);

    // The old bug seeded the shell with `distance - (PLAYER.y - enemy.y)`, which put the
    // origin *below* the car and sent the shot further away. The origin must be ahead.
    expect(shot.at).toBeGreaterThan(input.distance);
    expect(screenYFromWorldAt(shot.at, input.distance, PLAYER_Y)).toBe(input.enemyY);
  });

  it('travels toward the car', () => {
    expect(returnShot(input).speed).toBeLessThan(0);
  });

  it('arrives in the player lane it was aimed at', () => {
    const shot = returnShot(input);

    let at = shot.at;
    let x = input.enemyX;
    let distance = input.distance;
    let y = input.enemyY;
    const dt = 1 / 120;

    for (let step = 0; step < 4000 && y < input.playerY; step += 1) {
      at += shot.speed * dt;
      distance += input.scroll * dt;
      x += shot.driftX * dt;
      y = screenYFromWorldAt(at, distance, PLAYER_Y);
    }

    expect(y).toBeGreaterThanOrEqual(input.playerY);
    expect(Math.abs(x - input.playerX)).toBeLessThan(8);
  });

  it('does not drift when the player is already in line', () => {
    expect(returnShot({ ...input, playerX: input.enemyX }).driftX).toBe(0);
  });

  it('caps the lead so a point-blank shot cannot snap sideways', () => {
    const pointBlank = { ...input, enemyY: PLAYER_Y - 2, playerX: 600, maxDrift: 900 };
    const shot = returnShot(pointBlank);

    expect(Math.abs(shot.driftX)).toBe(900);
  });

  it('never aims backwards from a hostile that is already past the car', () => {
    const shot = returnShot({ ...input, enemyY: PLAYER_Y + 20 });

    expect(shot.driftX).toBe(0);
    expect(shot.at).toBeLessThan(input.distance);
  });
});

describe('oilCatches', () => {
  const slick = { x: 320, y: PLAYER_Y + WEAPON_FX.oilOffset };

  it('catches a pursuer sitting on the slick', () => {
    expect(
      oilCatches(
        slick,
        { x: 320, y: slick.y },
        WEAPON_FX.oilCatchHalfWidth,
        WEAPON_FX.oilCatchHalfHeight,
      ),
    ).toBe(true);
  });

  it('catches at the edge of the window but not past it', () => {
    const inside = slick.x + WEAPON_FX.oilCatchHalfWidth - 1;
    const outside = slick.x + WEAPON_FX.oilCatchHalfWidth + 1;

    expect(oilCatches(slick, { x: inside, y: slick.y }, 34, 30)).toBe(true);
    expect(oilCatches(slick, { x: outside, y: slick.y }, 34, 30)).toBe(false);
  });

  it('misses a pursuer dragging behind the slick', () => {
    expect(
      oilCatches(
        slick,
        { x: slick.x, y: slick.y + WEAPON_FX.oilCatchHalfHeight + 10 },
        WEAPON_FX.oilCatchHalfWidth,
        WEAPON_FX.oilCatchHalfHeight,
      ),
    ).toBe(false);
  });

  it('is true for a slick dropped at the car rear, which the old gate rejected', () => {
    // `hazard.sprite.y < PLAYER.y - 80` could never hold for a slick at PLAYER.y + 30.
    expect(slick.y).toBeGreaterThan(PLAYER_Y);
    expect(oilCatches(slick, { x: slick.x, y: slick.y }, 34, 30)).toBe(true);
  });
});

describe('smokeBlocksFire', () => {
  const playerAt = 1000;
  const cloudAt = playerAt - WEAPON_FX.smokeOffset;

  it('blinds a hostile beyond the cloud', () => {
    expect(smokeBlocksFire(cloudAt, playerAt + 200, playerAt, WEAPON_FX.smokeCover)).toBe(true);
  });

  it('does not blind a hostile on the car side of the cloud', () => {
    // A tight cloud one cannot see through, with the hostile still between it and the car.
    expect(smokeBlocksFire(cloudAt, playerAt + 10, playerAt, 10)).toBe(false);
    expect(smokeBlocksFire(cloudAt, playerAt + 30, playerAt, 10)).toBe(true);
  });

  it('protects nobody when the cloud has fallen behind the car', () => {
    expect(smokeBlocksFire(playerAt - 30, playerAt + 200, playerAt, WEAPON_FX.smokeCover)).toBe(
      false,
    );
  });

  it('never blinds a hostile that is behind the car', () => {
    expect(smokeBlocksFire(cloudAt, playerAt - 100, playerAt, WEAPON_FX.smokeCover)).toBe(false);
  });
});
