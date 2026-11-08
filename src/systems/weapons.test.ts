import { describe, expect, it } from 'vitest';
import { PLAYER, WEAPON_FX } from '@/config';
import {
  createSpin,
  flameCatches,
  forwardShot,
  isSpinning,
  oilCatches,
  projectHazard,
  returnShot,
  screenYFromWorldAt,
  smokeBlocksFire,
  spinDrift,
  withinBlast,
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
  const slick = { x: 320, y: PLAYER_Y - WEAPON_FX.oilDropAhead };

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

  it('is true for a slick laid up the road, which is where a drop now lands', () => {
    // A world-static slick has to be ahead: everything that can cross it is ahead too.
    expect(slick.y).toBeLessThan(PLAYER_Y);
    expect(oilCatches(slick, { x: slick.x, y: slick.y }, 34, 30)).toBe(true);
  });
});

describe('smokeBlocksFire', () => {
  const playerAt = 1000;
  /** A cloud laid one cover-length up the road: the smallest window that can blind anyone. */
  const cloudAt = playerAt + WEAPON_FX.smokeCover;

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

  it('is laid ahead of the car, where it can screen the hostiles it is hiding from', () => {
    expect(cloudAt).toBeGreaterThan(playerAt);
  });
});

describe('projectHazard', () => {
  it('leaves the drop point alone and only moves the screen projection', () => {
    const spot = { at: 1500, x: 320 };

    const fresh = projectHazard(spot, 1400);
    const later = projectHazard(spot, 2000);

    // The hazard itself never moves: it is the car that drives away from it.
    expect(fresh.at).toBe(1500);
    expect(later.at).toBe(1500);
    expect(fresh.x).toBe(320);
    expect(later.x).toBe(320);

    // A hundred px ahead is drawn ABOVE the car, and the same spot falls behind it as the
    // run advances.
    expect(fresh.y).toBe(PLAYER_Y - 100);
    expect(later.y).toBe(PLAYER_Y + 500);
  });

  it('does not ride with the car: the gap grows by exactly the distance travelled', () => {
    const spot = { at: 900, x: 100 };

    expect(projectHazard(spot, 0).y - projectHazard(spot, 600).y).toBe(-600);
  });
});

describe('oil spin', () => {
  const spin = createSpin(1000, WEAPON_FX.oilSpinMs);

  it('lasts exactly the window the slick hands out', () => {
    expect(isSpinning(spin, 999)).toBe(false);
    expect(isSpinning(spin, 1000)).toBe(true);
    expect(isSpinning(spin, 1000 + WEAPON_FX.oilSpinMs - 1)).toBe(true);
    expect(isSpinning(spin, 1000 + WEAPON_FX.oilSpinMs)).toBe(false);
    expect(isSpinning(null, 1000)).toBe(false);
  });

  it('drifts sideways on both sides of the lane and settles when control returns', () => {
    const quarter = WEAPON_FX.oilSpinMs / 4;
    const peak = 90;
    // Half a hertz over a 1.5 s spin: a quarter of the window is a quarter turn, so the two
    // ends of the drift have opposite signs by construction.
    const hz = 0.5;

    expect(spinDrift(spin, 1000, peak, hz)).toBeCloseTo(0, 5);
    expect(spinDrift(spin, 1000 + quarter, peak, hz)).toBeGreaterThan(0);
    expect(spinDrift(spin, 1000 + quarter * 3, peak, hz)).toBeLessThan(0);
    expect(spinDrift(spin, 1000 + WEAPON_FX.oilSpinMs, peak, hz)).toBe(0);
    expect(spinDrift(null, 1000 + quarter, peak, hz)).toBe(0);
  });

  it('is deterministic: the same clock always drifts the same way', () => {
    const at = 1000 + WEAPON_FX.oilSpinMs / 3;

    expect(spinDrift(spin, at, 90, WEAPON_FX.oilSpinHz)).toBe(
      spinDrift(createSpin(1000, WEAPON_FX.oilSpinMs), at, 90, WEAPON_FX.oilSpinHz),
    );
  });

  it('never drifts faster than its peak', () => {
    for (let t = 0; t <= WEAPON_FX.oilSpinMs; t += 25) {
      expect(Math.abs(spinDrift(spin, 1000 + t, 90, WEAPON_FX.oilSpinHz))).toBeLessThanOrEqual(90);
    }
  });
});

describe('flameCatches', () => {
  const range = 140;
  const near = WEAPON_FX.flameConeNearWidth;
  const far = 30;
  const origin = { x: 320, y: PLAYER_Y };

  it('burns a target directly ahead inside the cone', () => {
    expect(flameCatches(origin, { x: 320, y: PLAYER_Y - 60 }, range, near, far)).toBe(true);
  });

  it('reaches nothing past its range', () => {
    expect(flameCatches(origin, { x: 320, y: PLAYER_Y - range }, range, near, far)).toBe(true);
    expect(flameCatches(origin, { x: 320, y: PLAYER_Y - range - 1 }, range, near, far)).toBe(false);
    // The old long-range weapon test: a target across the screen is untouched.
    expect(flameCatches(origin, { x: 320, y: PLAYER_Y - 300 }, range, near, far)).toBe(false);
  });

  it('never burns anything behind the car', () => {
    expect(flameCatches(origin, { x: 320, y: PLAYER_Y + 20 }, range, near, far)).toBe(false);
    expect(flameCatches(origin, { x: 320, y: PLAYER_Y }, range, near, far)).toBe(false);
  });

  it('opens out with distance, so the far edge is the widest part of the cone', () => {
    // A target just outside the nose's spread is a miss close in, and the same offset is
    // inside the cone once it is two-thirds of the way out.
    const narrowMiss = near + 4;
    const farOffset = near + (far - near) * (2 / 3) - 1;

    expect(
      flameCatches(origin, { x: 320 + narrowMiss, y: PLAYER_Y - 10 }, range, near, far),
    ).toBe(false);
    expect(
      flameCatches(origin, { x: 320 + farOffset, y: PLAYER_Y - 90 }, range, near, far),
    ).toBe(true);
  });
});

describe('withinBlast', () => {
  const centre = { x: 320, y: 100 };

  it('reaches everything inside the radius and nothing outside it', () => {
    expect(withinBlast(centre, { x: 320, y: 100 }, 56)).toBe(true);
    expect(withinBlast(centre, { x: 320 + 55, y: 100 }, 56)).toBe(true);
    expect(withinBlast(centre, { x: 320 + 57, y: 100 }, 56)).toBe(false);
  });

  it('is a circle, not a box: a corner beyond the radius is a miss', () => {
    const corner = { x: 320 + 40, y: 100 + 40 };

    expect(Math.hypot(40, 40)).toBeGreaterThan(56);
    expect(withinBlast(centre, corner, 56)).toBe(false);
  });
});

