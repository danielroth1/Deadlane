import type Phaser from 'phaser';
import { PALETTE } from '@/palette';
import { GLYPH_HEIGHT, drawText, measureText } from '@/ui/pixel-text';
import {
  PAD_BUTTONS,
  type PadAction,
  type PadButton,
  type TouchInput,
} from '@/systems/touch-input';

/**
 * The accent colour that identifies each control.
 *
 * Seeded from the locked palette: the pad is drawn, not generated, so it needs no art
 * slot and a missing asset can never take the controls away.
 */
const ACCENT: Readonly<Record<PadAction, number>> = {
  fire: PALETTE.hotPink,
  boost: PALETTE.amber,
  brake: PALETTE.signalRed,
  oil: PALETTE.violet,
  smoke: PALETTE.bone,
  rocket: PALETTE.teal,
  flame: PALETTE.rust,
  pause: PALETTE.steelLight,
};

/**
 * The on-screen touch pad.
 *
 * One Graphics object redrawn per frame: the plate is a handful of rectangles and the
 * labels are the built-in bitmap font, so a press lights up immediately without allocating
 * a texture or touching the DOM. It lives inside the fixed 640×360 canvas, in the gutters
 * beside the road, so showing it never moves the letterbox and never covers the play field.
 */
export class TouchPad {
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly buttons: readonly PadButton[];
  private visible = false;

  constructor(
    scene: Phaser.Scene,
    depth = 210,
    buttons: readonly PadButton[] = PAD_BUTTONS,
  ) {
    this.buttons = buttons;
    // Above the pause card, so the control that resumes a paused run stays readable.
    this.plate = scene.add.graphics().setDepth(depth).setVisible(false);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.plate.setVisible(visible);
    if (!visible) this.plate.clear();
  }

  /** Redraw at the current press state. Cheap enough to run every frame. */
  render(input: TouchInput, now: number): void {
    if (!this.visible) return;

    const g = this.plate;
    g.clear();
    for (const button of this.buttons) {
      this.drawButton(g, button, input.isPressed(button.action, now));
    }
  }

  destroy(): void {
    this.plate.destroy();
  }

  private drawButton(
    g: Phaser.GameObjects.Graphics,
    button: PadButton,
    pressed: boolean,
  ): void {
    const { x, y, width, height } = button.rect;
    const edge = 1;

    g.fillStyle(pressed ? PALETTE.asphaltLight : PALETTE.void, pressed ? 0.8 : 0.5);
    g.fillRect(x, y, width, height);

    // A 1 px frame drawn as four rectangles rather than a stroke, so the pixel grid stays
    // sharp at every scale factor.
    g.fillStyle(pressed ? PALETTE.white : PALETTE.steel, pressed ? 0.95 : 0.75);
    g.fillRect(x, y, width, edge);
    g.fillRect(x, y + height - edge, width, edge);
    g.fillRect(x, y, edge, height);
    g.fillRect(x + width - edge, y, edge, height);

    // Accent bar along the top edge: which control this is, readable at arm's length.
    g.fillStyle(ACCENT[button.action], pressed ? 1 : 0.8);
    g.fillRect(x + edge, y + edge, width - edge * 2, 2);

    if (button.label.length === 0) {
      this.drawPauseBars(g, button, pressed);
      return;
    }

    // Scale the label to the button, capped at 2× so it stays a label rather than a banner.
    const natural = Math.max(1, measureText(button.label, 1));
    const scale = Math.min(2, Math.max(1, Math.floor((width - 10) / natural)));
    const labelWidth = measureText(button.label, scale);
    const labelHeight = GLYPH_HEIGHT * scale;

    drawText(
      g,
      button.label,
      Math.round(x + (width - labelWidth) / 2),
      Math.round(y + (height - labelHeight) / 2 + 3),
      { color: pressed ? PALETTE.white : PALETTE.bone, scale },
    );
  }

  /** Pause is two bars, not a glyph: legible at any size and unmistakably a pause. */
  private drawPauseBars(
    g: Phaser.GameObjects.Graphics,
    button: PadButton,
    pressed: boolean,
  ): void {
    const { x, y, width, height } = button.rect;
    const barWidth = 5;
    const barHeight = Math.round(height * 0.42);
    const gap = 6;
    const left = Math.round(x + width / 2 - (barWidth * 2 + gap) / 2);
    const top = Math.round(y + height / 2 - barHeight / 2 + 2);

    g.fillStyle(pressed ? PALETTE.white : PALETTE.bone, 1);
    g.fillRect(left, top, barWidth, barHeight);
    g.fillRect(left + barWidth + gap, top, barWidth, barHeight);
  }
}
