import { describe, expect, it } from 'vitest';
import { CAMERA, GAME, ROAD, TOUCH } from '@/config';
import {
  PAD_BUTTONS,
  TouchInput,
  buttonAt,
  pointInRect,
  steerTowards,
  type PadButton,
} from './touch-input';

/**
 * Touch control, with no Phaser in sight.
 *
 * The pad is pure geometry plus a small state machine, so the two things that actually go
 * wrong on a phone — a second finger stealing the steer drag, and a tap being lost or
 * firing twice — are pinned here rather than in a browser test.
 */

const FIRE = mustFind('fire');
const BOOST = mustFind('boost');
const OIL = mustFind('oil');
const SMOKE = mustFind('smoke');
const PAUSE = mustFind('pause');

function mustFind(action: PadButton['action']): PadButton {
  const button = PAD_BUTTONS.find((candidate) => candidate.action === action);
  if (!button) throw new Error(`no pad button for ${action}`);
  return button;
}

const centre = (button: PadButton): { x: number; y: number } => ({
  x: button.rect.x + button.rect.width / 2,
  y: button.rect.y + button.rect.height / 2,
});

/**
 * The road's extent as the player sees it.
 *
 * `ROAD` is authored in world pixels and the world camera is zoomed out, so the drawn road is
 * `zoom` times narrower than its world width. The pad is drawn by the HUD at 1:1, so a gutter
 * only has to clear the road on screen.
 */
const ROAD_ON_SCREEN = {
  left: ROAD.left * CAMERA.zoom,
  right: (ROAD.left + ROAD.width) * CAMERA.zoom,
};

describe('pad layout', () => {
  it('hits every button at its own centre and the play field in the middle of the road', () => {
    for (const button of PAD_BUTTONS) {
      expect(buttonAt(centre(button).x, centre(button).y)).toBe(button);
    }

    expect(buttonAt(ROAD.left + ROAD.width / 2, GAME.height / 2)).toBeNull();
  });

  it('never overlaps the road or a HUD strip', () => {
    for (const button of PAD_BUTTONS) {
      const { x, y, width, height } = button.rect;

      // Play field.
      const overlapsRoad = x < ROAD_ON_SCREEN.right && x + width > ROAD_ON_SCREEN.left;
      expect(overlapsRoad, `${button.action} covers the road`).toBe(false);

      // The HUD owns the top 28 px and the bottom 24 px of the screen.
      expect(y, `${button.action} covers the top strip`).toBeGreaterThanOrEqual(28);
      expect(y + height, `${button.action} covers the bottom strip`).toBeLessThanOrEqual(
        GAME.height - 24,
      );

      // Inside the canvas.
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(GAME.width);
    }
  });

  it('keeps the buttons apart from each other', () => {
    for (const a of PAD_BUTTONS) {
      for (const b of PAD_BUTTONS) {
        if (a === b) continue;
        const overlap =
          a.rect.x < b.rect.x + b.rect.width &&
          a.rect.x + a.rect.width > b.rect.x &&
          a.rect.y < b.rect.y + b.rect.height &&
          a.rect.y + a.rect.height > b.rect.y;
        expect(overlap, `${a.action} overlaps ${b.action}`).toBe(false);
      }
    }
  });

  it('treats a point on the right or bottom edge as outside', () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(pointInRect(10, 10, rect)).toBe(true);
    expect(pointInRect(29, 29, rect)).toBe(true);
    expect(pointInRect(30, 20, rect)).toBe(false);
    expect(pointInRect(20, 30, rect)).toBe(false);
  });
});

describe('steerTowards', () => {
  it('holds the line inside the deadzone and pulls toward the pointer outside it', () => {
    expect(steerTowards(100, 100)).toBe(0);
    expect(steerTowards(100 + TOUCH.steerDeadzone, 100)).toBe(0);
    expect(steerTowards(100 + TOUCH.steerDeadzone + 1, 100)).toBe(1);
    expect(steerTowards(100 - TOUCH.steerDeadzone - 1, 100)).toBe(-1);
  });
});

describe('TouchInput', () => {
  it('holds a button for as long as the finger is down', () => {
    const input = new TouchInput();

    input.press(1, FIRE, 0);
    expect(input.isHeld('fire')).toBe(true);

    input.release(1);
    expect(input.isHeld('fire')).toBe(false);
  });

  it('counts a held action once even with two fingers on it', () => {
    const input = new TouchInput();

    input.press(1, FIRE, 0);
    input.press(2, FIRE, 0);
    input.release(1);
    expect(input.isHeld('fire')).toBe(true);

    input.release(2);
    expect(input.isHeld('fire')).toBe(false);
  });

  it('queues a tap exactly once', () => {
    const input = new TouchInput();

    input.press(1, OIL, 0);
    expect(input.isHeld('oil')).toBe(false);
    expect(input.takeTap('oil')).toBe(true);
    expect(input.takeTap('oil')).toBe(false);
  });

  it('lets the first finger own the steer drag', () => {
    const input = new TouchInput();

    input.beginSteer(1, 200);
    input.beginSteer(2, 500); // second finger lands later, far to the right
    expect(input.steerFor(320)).toBe(-1);

    input.move(2, 100);
    expect(input.steerFor(320)).toBe(-1);
  });

  it('hands the drag to a new finger once the owner lifts', () => {
    const input = new TouchInput();

    input.beginSteer(1, 200);
    input.release(1);
    expect(input.steerFor(320)).toBe(0);

    input.beginSteer(2, 500);
    expect(input.steerFor(320)).toBe(1);
  });

  it('steers while a second finger holds the trigger', () => {
    const input = new TouchInput();

    input.beginSteer(1, 200);
    input.press(2, FIRE, 0);

    expect(input.steerFor(320)).toBe(-1);
    expect(input.isHeld('fire')).toBe(true);

    input.release(1);
    expect(input.steerFor(320)).toBe(0);
    expect(input.isHeld('fire')).toBe(true);
  });

  it('drops everything on reset, so a pause cannot leave a control stuck', () => {
    const input = new TouchInput();

    input.beginSteer(1, 200);
    input.press(2, BOOST, 0);
    input.press(3, SMOKE, 0);
    input.reset();

    expect(input.steering).toBe(false);
    expect(input.steerFor(320)).toBe(0);
    expect(input.isHeld('boost')).toBe(false);
    expect(input.takeTap('smoke')).toBe(false);
  });

  it('lights a tapped button for the flash window and no longer', () => {
    const input = new TouchInput();

    input.press(1, PAUSE, 1_000);
    expect(input.isPressed('pause', 1_000)).toBe(true);
    expect(input.isPressed('pause', 1_000 + TOUCH.tapFlashMs - 1)).toBe(true);
    expect(input.isPressed('pause', 1_000 + TOUCH.tapFlashMs)).toBe(false);
  });
});
