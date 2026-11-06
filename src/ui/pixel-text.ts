import Phaser from 'phaser';

/**
 * A 5×7 bitmap font drawn straight into a Graphics object.
 *
 * Why not a webfont: the game ships as static files and must not depend on a font CDN, and
 * a canvas fallback font destroys the pixel aesthetic. Why not Phaser `Text`: it
 * rasterises through the browser's text stack, which is exactly the thing that looked wrong.
 *
 * Drawing rectangles is also faster than re-rendering a canvas for text that changes every
 * frame, which is what the HUD does.
 */

type Glyph = readonly string[];

/* prettier-ignore */
const FONT: Readonly<Record<string, Glyph>> = {
  A: ['01110','10001','10001','11111','10001','10001','10001'],
  B: ['11110','10001','10001','11110','10001','10001','11110'],
  C: ['01110','10001','10000','10000','10000','10001','01110'],
  D: ['11110','10001','10001','10001','10001','10001','11110'],
  E: ['11111','10000','10000','11110','10000','10000','11111'],
  F: ['11111','10000','10000','11110','10000','10000','10000'],
  G: ['01110','10001','10000','10111','10001','10001','01111'],
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  I: ['11111','00100','00100','00100','00100','00100','11111'],
  J: ['00111','00010','00010','00010','00010','10010','01100'],
  K: ['10001','10010','10100','11000','10100','10010','10001'],
  L: ['10000','10000','10000','10000','10000','10000','11111'],
  M: ['10001','11011','10101','10101','10001','10001','10001'],
  N: ['10001','11001','10101','10011','10001','10001','10001'],
  O: ['01110','10001','10001','10001','10001','10001','01110'],
  P: ['11110','10001','10001','11110','10000','10000','10000'],
  Q: ['01110','10001','10001','10001','10101','10010','01101'],
  R: ['11110','10001','10001','11110','10100','10010','10001'],
  S: ['01111','10000','10000','01110','00001','00001','11110'],
  T: ['11111','00100','00100','00100','00100','00100','00100'],
  U: ['10001','10001','10001','10001','10001','10001','01110'],
  V: ['10001','10001','10001','10001','10001','01010','00100'],
  W: ['10001','10001','10001','10101','10101','11011','10001'],
  X: ['10001','10001','01010','00100','01010','10001','10001'],
  Y: ['10001','10001','01010','00100','00100','00100','00100'],
  Z: ['11111','00001','00010','00100','01000','10000','11111'],
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11111','00010','00100','00010','00001','10001','01110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['00110','01000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'],
  ',': ['00000','00000','00000','00000','01100','01100','01000'],
  ':': ['00000','01100','01100','00000','01100','01100','00000'],
  ';': ['00000','01100','01100','00000','01100','01100','01000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '_': ['00000','00000','00000','00000','00000','00000','11111'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
  '=': ['00000','00000','11111','00000','11111','00000','00000'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '?': ['01110','10001','00001','00010','00100','00000','00100'],
  '/': ['00001','00010','00010','00100','01000','01000','10000'],
  '%': ['11001','11010','00010','00100','01000','01011','10011'],
  '"': ['01010','01010','00000','00000','00000','00000','00000'],
  "'": ['00100','00100','00000','00000','00000','00000','00000'],
  '(': ['00010','00100','01000','01000','01000','00100','00010'],
  ')': ['01000','00100','00010','00010','00010','00100','01000'],
  '<': ['00010','00100','01000','10000','01000','00100','00010'],
  '>': ['01000','00100','00010','00001','00010','00100','01000'],
  '*': ['00000','10101','01110','11111','01110','10101','00000'],
  '#': ['01010','01010','11111','01010','11111','01010','01010'],
};

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;
const TRACKING = 1;

export type TextAlign = 'left' | 'center' | 'right';

export function measureText(text: string, scale = 1): number {
  if (text.length === 0) return 0;
  return (text.length * (GLYPH_WIDTH + TRACKING) - TRACKING) * scale;
}

export interface DrawTextOptions {
  readonly scale?: number;
  readonly color: number;
  readonly align?: TextAlign;
  /** Extra pixels between glyphs, on top of the built-in 1px tracking. */
  readonly letterSpacing?: number;
  readonly alpha?: number;
}

/** Draw uppercase text at (x, y). Returns the width drawn. */
export function drawText(
  g: Phaser.GameObjects.Graphics,
  text: string,
  x: number,
  y: number,
  options: DrawTextOptions,
): number {
  const scale = options.scale ?? 1;
  const spacing = (TRACKING + (options.letterSpacing ?? 0)) * scale;
  const upper = text.toUpperCase();
  const count = upper.length;
  const width = count === 0 ? 0 : count * GLYPH_WIDTH * scale + (count - 1) * spacing;

  let originX = x;
  if (options.align === 'center') originX = x - width / 2;
  else if (options.align === 'right') originX = x - width;

  g.fillStyle(options.color, options.alpha ?? 1);

  let cursor = originX;
  for (const char of upper) {
    const glyph = FONT[char] ?? FONT['?']!;
    for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
      const bits = glyph[row]!;
      for (let col = 0; col < GLYPH_WIDTH; col += 1) {
        if (bits[col] === '1') {
          g.fillRect(cursor + col * scale, y + row * scale, scale, scale);
        }
      }
    }
    cursor += GLYPH_WIDTH * scale + spacing;
  }

  return width;
}

export interface PixelTextConfig extends DrawTextOptions {
  readonly x: number;
  readonly y: number;
}

/**
 * A Graphics-backed text object.
 *
 * Behaves like `Phaser.GameObjects.Text` for the small surface this game needs: set the
 * text and it redraws. Costs a handful of `fillRect` calls per frame instead of a texture
 * upload.
 */
export class PixelText extends Phaser.GameObjects.Graphics {
  private label: string;
  private options: DrawTextOptions;

  constructor(scene: Phaser.Scene, config: PixelTextConfig) {
    super(scene, { x: config.x, y: config.y });
    this.label = '';
    this.options = {
      scale: config.scale ?? 1,
      color: config.color,
      align: config.align ?? 'left',
      letterSpacing: config.letterSpacing ?? 0,
      alpha: config.alpha ?? 1,
    };
    scene.add.existing(this);
    this.redraw();
  }

  get text(): string {
    return this.label;
  }

  get textWidth(): number {
    return measureText(this.label, this.options.scale ?? 1);
  }

  setText(value: string | number): this {
    const next = String(value);
    if (next === this.label) return this;
    this.label = next;
    this.redraw();
    return this;
  }

  setColor(color: number): this {
    if (this.options.color === color) return this;
    this.options = { ...this.options, color };
    this.redraw();
    return this;
  }

  setAlphaValue(alpha: number): this {
    this.setAlpha(alpha);
    return this;
  }

  private redraw(): void {
    this.clear();
    if (this.label.length === 0) return;
    drawText(this, this.label, 0, 0, this.options);
  }
}
