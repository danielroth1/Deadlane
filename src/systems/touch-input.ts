import { TOUCH } from '@/config';

/**
 * The touch pad's geometry and input state, with no Phaser in it.
 *
 * Three things are deliberately decided here rather than in a scene: which button a point
 * hits, which pointer owns the steer drag, and what a press turns into. That keeps the
 * interesting parts of touch control — multi-touch ownership, taps versus holds, the steer
 * deadzone — testable in plain unit tests, and it means the drawing code and the gameplay
 * code cannot disagree about where a button is.
 */

/** Everything a finger can do on the pad. Steer has no button: it is a drag. */
export type PadAction = 'boost' | 'brake' | 'fire' | 'oil' | 'smoke' | 'pause';

/**
 * `hold` behaves like a held key (accelerate, brake, fire); `tap` fires once per press,
 * exactly as Shift and X do for smoke and oil.
 */
export type PadBehaviour = 'hold' | 'tap';

export interface PadRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PadButton {
  readonly action: PadAction;
  readonly label: string;
  readonly behaviour: PadBehaviour;
  readonly rect: PadRect;
}

/** The pad, in authored pixels. See `TOUCH.pad` for the reasoning behind the layout. */
export const PAD_BUTTONS: readonly PadButton[] = [
  { action: 'fire', label: 'FIRE', behaviour: 'hold', rect: TOUCH.pad.fire },
  { action: 'boost', label: 'GAS', behaviour: 'hold', rect: TOUCH.pad.boost },
  { action: 'brake', label: 'BRK', behaviour: 'hold', rect: TOUCH.pad.brake },
  { action: 'oil', label: 'OIL', behaviour: 'tap', rect: TOUCH.pad.oil },
  { action: 'smoke', label: 'SMOKE', behaviour: 'tap', rect: TOUCH.pad.smoke },
  { action: 'pause', label: '', behaviour: 'tap', rect: TOUCH.pad.pause },
];

export function pointInRect(x: number, y: number, rect: PadRect): boolean {
  return (
    x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height
  );
}

/** The button under a point, or null when the point belongs to the play field. */
export function buttonAt(
  x: number,
  y: number,
  buttons: readonly PadButton[] = PAD_BUTTONS,
): PadButton | null {
  return buttons.find((button) => pointInRect(x, y, button.rect)) ?? null;
}

/**
 * Steering intent for a drag: the car pulls toward the pointer, once the pointer is more
 * than a deadzone away. `-1` left, `0` hold the line, `1` right.
 */
export function steerTowards(
  pointerX: number,
  playerX: number,
  deadzone: number = TOUCH.steerDeadzone,
): number {
  const dx = pointerX - playerX;
  if (Math.abs(dx) <= deadzone) return 0;
  return Math.sign(dx);
}

/**
 * Live touch state, fed by pointer events and read by the run.
 *
 * Pointers are tracked by `pointer.id`, which is what makes two thumbs work: a button
 * belongs to the finger that landed on it until that finger lifts, and the first pointer
 * that lands on the play field owns the steer drag — a second one can press buttons without
 * taking the car away from the first.
 */
export class TouchInput {
  /** Pointer id → the action it is holding. Two fingers on the same action both count. */
  private readonly held = new Map<number, PadAction>();
  /** One-shot presses waiting to be consumed, so a tap can be neither missed nor doubled. */
  private readonly taps = new Set<PadAction>();
  /** When each action was last pressed, for the pad's own pressed feedback. */
  private readonly pressedAt = new Map<PadAction, number>();
  private steerPointerId: number | null = null;
  private steerX = 0;

  /** A pointer landed on a button. */
  press(pointerId: number, button: PadButton, at: number): void {
    this.pressedAt.set(button.action, at);
    if (button.behaviour === 'tap') {
      this.taps.add(button.action);
      return;
    }
    this.held.set(pointerId, button.action);
  }

  /** A pointer landed on the play field. The first one steers; later ones do not hijack. */
  beginSteer(pointerId: number, x: number): void {
    if (this.steerPointerId !== null) return;
    this.steerPointerId = pointerId;
    this.steerX = x;
  }

  /** Follow the steer pointer. Other pointers are ignored on purpose. */
  move(pointerId: number, x: number): void {
    if (pointerId === this.steerPointerId) this.steerX = x;
  }

  release(pointerId: number): void {
    this.held.delete(pointerId);
    if (pointerId === this.steerPointerId) this.steerPointerId = null;
  }

  /** Drop everything, e.g. when the run freezes and pointer-up events stop arriving. */
  reset(): void {
    this.held.clear();
    this.taps.clear();
    this.pressedAt.clear();
    this.steerPointerId = null;
  }

  /** True while a finger is dragging the play field. */
  get steering(): boolean {
    return this.steerPointerId !== null;
  }

  /**
   * Steering intent toward the live drag, or 0 when nothing is dragging.
   *
   * The deadzone is a parameter because the caller compares world-space X while the value is
   * authored in screen pixels: a zoomed world camera has to scale it before asking.
   */
  steerFor(playerX: number, deadzone: number = TOUCH.steerDeadzone): number {
    return this.steerPointerId === null ? 0 : steerTowards(this.steerX, playerX, deadzone);
  }

  isHeld(action: PadAction): boolean {
    for (const value of this.held.values()) {
      if (value === action) return true;
    }
    return false;
  }

  /** Held, or tapped recently enough to still be lit. Used only by the pad's own drawing. */
  isPressed(action: PadAction, at: number): boolean {
    if (this.isHeld(action)) return true;
    const pressedAt = this.pressedAt.get(action);
    return pressedAt !== undefined && at - pressedAt < TOUCH.tapFlashMs;
  }

  /** Consume a one-shot press. True exactly once per press. */
  takeTap(action: PadAction): boolean {
    return this.taps.delete(action);
  }
}
