import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REPO_ROOT } from './ledger.js';

/**
 * Raster helpers used by the asset pipeline.
 *
 * Everything here is deliberately deterministic: no smoothing, no resampling filters, no
 * interpolation. A sprite must be byte-identical when the same source is processed twice,
 * because `art:validate` and visual review both depend on reproducibility.
 */

export interface Raster {
  readonly width: number;
  readonly height: number;
  /** RGBA, 4 bytes per pixel, row-major. */
  readonly data: Buffer;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PaletteEntry {
  readonly index: number;
  readonly hex: string;
  readonly name: string;
  readonly rgb: readonly [number, number, number];
}

export interface Palette {
  readonly colors: readonly PaletteEntry[];
  readonly transparentKey: string;
  /** `reserved.playerAccent` — hot-pink, legal on the player and nowhere else. */
  readonly playerAccentKey: string;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const to = (v: number): string => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export async function loadPalette(): Promise<Palette> {
  const path = resolve(REPO_ROOT, 'pipeline', 'registry', 'palette.json');
  const raw = JSON.parse(await readFile(path, 'utf8')) as {
    colors: { index: number; hex: string; name: string }[];
    reserved: { transparentKey: string; playerAccent: string };
  };
  return {
    colors: raw.colors.map((c) => ({
      index: c.index,
      hex: c.hex.toLowerCase(),
      name: c.name,
      rgb: hexToRgb(c.hex),
    })),
    transparentKey: raw.reserved.transparentKey,
    playerAccentKey: raw.reserved.playerAccent.toLowerCase(),
  };
}

/**
 * Copy of a palette with entries removed.
 *
 * Used to make palette colour 15 unreachable for hostile sheets: the accent is reserved for
 * the player, so on an enemy sprite the nearest-colour search must not be able to pick it.
 * Removing the entry rather than remapping after quantise means a red detail lands on the
 * nearest *legal* colour (signal-red) instead of on whatever index 15 happened to be
 * reassigned to.
 */
export function paletteWithout(palette: Palette, indices: readonly number[]): Palette {
  const dropped = new Set(indices);
  return {
    colors: palette.colors.filter((entry) => !dropped.has(entry.index)),
    transparentKey: palette.transparentKey,
    playerAccentKey: palette.playerAccentKey,
  };
}

/* --------------------------------- decoding -------------------------------- */

export async function decode(path: string): Promise<Raster> {
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    // ensureAlpha guarantees 4 channels, but be defensive about interleaving surprises.
    data,
  };
}

export async function encode(raster: Raster, path: string): Promise<void> {
  await sharp(raster.data, {
    raw: { width: raster.width, height: raster.height, channels: 4 },
  })
    .png({ compressionLevel: 9, palette: false })
    .toFile(path);
}

/* ------------------------------- manipulation ------------------------------ */

export function crop(raster: Raster, box: Box): Raster {
  const out = Buffer.alloc(box.width * box.height * 4);
  for (let y = 0; y < box.height; y += 1) {
    const srcStart = ((box.top + y) * raster.width + box.left) * 4;
    raster.data.copy(out, y * box.width * 4, srcStart, srcStart + box.width * 4);
  }
  return { width: box.width, height: box.height, data: out };
}

/* -------------------------------- chroma key ------------------------------- */

/**
 * Hue in degrees (0–360) and saturation (0–1) for an 0–255 RGB triple.
 *
 * Brightness is deliberately not returned: the key predicate compares the max channel
 * directly, which avoids a redundant round trip through the normalised value.
 */
interface HueSaturation {
  readonly hue: number;
  readonly saturation: number;
}

function hueAndSaturation(r: number, g: number, b: number): HueSaturation {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const saturation = max === 0 ? 0 : delta / max;

  if (delta === 0) return { hue: 0, saturation };

  let hue: number;
  if (max === r) {
    hue = (60 * ((((g - b) / delta) % 6) + 6)) % 360;
  } else if (max === g) {
    hue = 60 * ((b - r) / delta + 2);
  } else {
    hue = 60 * ((r - g) / delta + 4);
  }
  return { hue, saturation };
}

/** Darker than this and the pixel is shading, not a flat plate, whatever its hue. */
const MIN_KEY_BRIGHTNESS = 90;

/** Washed-out pixels are greys, not backdrops. */
const MIN_KEY_SATURATION = 0.55;

/**
 * Warm drift of the backdrop relative to the key hue. `#ff00ff` is pure magenta at 300°;
 * the endpoint paints plates 20–40° warmer (measured: 334.8–335.7°), so the accepted family
 * is centred 22.5° into that drift, at 322.5°.
 */
const HUE_DRIFT_DEGREES = 22.5;

/** Half-width of the magenta family: 322.5° ± 27.5° gives the 295–350° band. */
const HUE_HALF_WIDTH_DEGREES = 27.5;

/**
 * Turn the flat generation background into transparency.
 *
 * Magenta is used because it is provably absent from the locked palette, so a chroma key
 * should never eat a legitimate sprite pixel. Pure white is accepted as a fallback for
 * models that ignore the background instruction, but it is a review failure if it happens
 * often.
 *
 * The predicate is a **hue and saturation test, not a distance from one hex**. A radius
 * around `#ff00ff` cannot work here: the endpoint keeps the backdrop in the magenta hue
 * band but drifts its brightness across a single sheet, so measured plate pixels sit at
 * `#df0b61`, `#ee0466` and `#c60756` — 194 to 236 away in Manhattan distance, well outside
 * any tolerance that is still safe for the palette. Widening the radius instead is worse
 * than useless, because palette colour 15 (`hot-pink`, `#ff2e63`) is also magenta and would
 * be eaten with the plate. Hue and saturation are invariant under that brightness drift,
 * which is what makes them the right feature: every one of those plate colours lands
 * between 334.8° and 335.7° at saturation > 0.94.
 *
 * A pixel is backdrop when its max channel is at least 90, its saturation is at least 0.55,
 * and its hue falls in the magenta band 295–350° (the band is anchored on the key's own hue
 * and widened by `tolerance / 12`, so `tolerance` still means "how much drift to forgive").
 *
 * Colour alone is still not sufficient: palette colour 15, `#ff2e63`, sits at hue ~345° and
 * 0.82 saturation, inside the band. It survives only because of connectivity — the backdrop
 * is the flat region that touches the image border, so only border-connected pixels in the
 * band are cleared. `#ff2e63` is drawn inside the car, enclosed by opaque body pixels, and
 * the flood fill never reaches it. The fill is 4-connected and iterative, so a full-size
 * sheet cannot blow the call stack.
 */
export function chromaKey(raster: Raster, keyHex: string, tolerance = 90): Raster {
  const [keyR, keyG, keyB] = hexToRgb(keyHex);
  const keyHue = hueAndSaturation(keyR, keyG, keyB).hue;
  const centre = keyHue + HUE_DRIFT_DEGREES;
  const halfWidth = HUE_HALF_WIDTH_DEGREES + tolerance / 12;

  const { width, height } = raster;
  const source = raster.data;
  const out = Buffer.from(source);

  // Unchanged fallback: a pure white plate means the model ignored the background
  // instruction entirely.
  for (let i = 0; i < out.length; i += 4) {
    const dWhite =
      Math.abs(out.readUInt8(i) - 255) +
      Math.abs(out.readUInt8(i + 1) - 255) +
      Math.abs(out.readUInt8(i + 2) - 255);

    if (dWhite < 24) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    }
  }

  const isKeyFamily = (pixel: number): boolean => {
    const i = pixel * 4;
    const r = source.readUInt8(i);
    const g = source.readUInt8(i + 1);
    const b = source.readUInt8(i + 2);

    if (Math.max(r, g, b) < MIN_KEY_BRIGHTNESS) return false;

    const { hue, saturation } = hueAndSaturation(r, g, b);
    if (saturation < MIN_KEY_SATURATION) return false;

    // Signed angular distance to the centre of the family, which wraps cleanly at 0/360.
    const offset = ((hue - centre + 540) % 360) - 180;
    return Math.abs(offset) <= halfWidth;
  };

  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let tail = 0;

  const visit = (x: number, y: number): void => {
    const pixel = y * width + x;
    if (seen.at(pixel) === 1) return;
    seen[pixel] = 1;
    if (!isKeyFamily(pixel)) return;
    queue[tail] = pixel;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    visit(0, y);
    visit(width - 1, y);
  }

  for (let head = 0; head < tail; head += 1) {
    const pixel = queue.at(head);
    if (pixel === undefined) break;

    const i = pixel * 4;
    out[i] = 0;
    out[i + 1] = 0;
    out[i + 2] = 0;
    out[i + 3] = 0;

    const x = pixel % width;
    const y = (pixel - x) / width;
    if (x > 0) visit(x - 1, y);
    if (x < width - 1) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y < height - 1) visit(x, y + 1);
  }

  return { width, height, data: out };
}

/* --------------------------- enclosed chroma residue ----------------------- */

/**
 * Options for {@link keyEnclosedMagenta}. Every field has a measured default; they are
 * exposed so a test can shrink a region without reaching into module constants.
 */
export interface EnclosedResidueOptions {
  readonly hueCentre?: number;
  readonly hueHalfWidth?: number;
  readonly minSaturation?: number;
  readonly minBrightness?: number;
  readonly minArea?: number;
}

/** Centre of the residue band. 20° below the border key's 322.5°, see below. */
export const ENCLOSED_RESIDUE_HUE_CENTRE = 320;

/** Half-width of the residue band, which makes it 300–340°. */
export const ENCLOSED_RESIDUE_HUE_HALF_WIDTH = 20;

export const ENCLOSED_RESIDUE_MIN_SATURATION = 0.5;

/**
 * Far below the border key's brightness floor on purpose: this pass is not asking "is this
 * the plate?", it is asking "is this a colour the palette does not contain?".
 */
export const ENCLOSED_RESIDUE_MIN_BRIGHTNESS = 40;

/**
 * Smallest enclosed region worth clearing.
 *
 * 24 px at 512 px per cell is 1.5 px at the 128 px final size, i.e. below anything the
 * downsample could carry. The point of the floor is to leave anti-aliased fringes of
 * legitimate hot-pink artwork alone rather than to describe a real region: the residue this
 * pass exists for measured 8,329 px in art-05 cell 0.
 */
export const MIN_ENCLOSED_RESIDUE_AREA = 24;

/**
 * The other half of the chroma key: magenta-family colour that the border fill cannot reach.
 *
 * `chromaKey` only clears the key family where it touches the image border. That is what
 * keeps palette colour 15 (`#ff2e63`, hot-pink) alive when it is drawn inside a car — and
 * it is also how the art-05 rotor fan shipped. The model painted the fan with the backdrop
 * colour and fenced it in with a 1 px highlight, so the fill never reached those 8,329 px
 * and `quantize` snapped every one of them to hot-pink (WO-24 defect 2).
 *
 * The band here is deliberately *narrower* than the border key's 295–350°: 300–340°. The
 * reserved player accent `#ff2e63` measures 344.8°, so it stays outside the band even when
 * enclosed, while every plate region measured so far (331.8–339.2° per-region mean) is
 * inside it. Narrowing is what makes this pass safe enough to run at all; widening it to the
 * border key's band would eat the player's tail lights first.
 *
 * Brightness is floored at 40 rather than 90 because the question is different: the border
 * fill asks "is this the plate?", where dark pixels are shading, while this pass asks "is
 * this outside the palette?", and the hue band already excludes every palette entry. The
 * floor exists only to keep near-black outline pixels — whose hue is numerical noise — out
 * of a component.
 *
 * A component that touches the raster border is skipped. Once `chromaKey` has run the border
 * is transparent, so a border-touching component means the caller passed in an unkeyed
 * raster, where a magenta plate would otherwise look like one enormous enclosed region.
 */
export function keyEnclosedMagenta(
  raster: Raster,
  options: EnclosedResidueOptions = {},
): Raster {
  const hueCentre = options.hueCentre ?? ENCLOSED_RESIDUE_HUE_CENTRE;
  const hueHalfWidth = options.hueHalfWidth ?? ENCLOSED_RESIDUE_HUE_HALF_WIDTH;
  const minSaturation = options.minSaturation ?? ENCLOSED_RESIDUE_MIN_SATURATION;
  const minBrightness = options.minBrightness ?? ENCLOSED_RESIDUE_MIN_BRIGHTNESS;
  const minArea = options.minArea ?? MIN_ENCLOSED_RESIDUE_AREA;

  const { width, height, data } = raster;
  const out = Buffer.from(data);

  const inFamily = (pixel: number): boolean => {
    const i = pixel * 4;
    if (data.readUInt8(i + 3) === 0) return false;

    const r = data.readUInt8(i);
    const g = data.readUInt8(i + 1);
    const b = data.readUInt8(i + 2);
    if (Math.max(r, g, b) < minBrightness) return false;

    const { hue, saturation } = hueAndSaturation(r, g, b);
    if (saturation < minSaturation) return false;

    const offset = ((hue - hueCentre + 540) % 360) - 180;
    return Math.abs(offset) <= hueHalfWidth;
  };

  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const region = new Int32Array(width * height);

  for (let start = 0; start < width * height; start += 1) {
    if (seen.at(start) === 1) continue;
    seen[start] = 1;
    if (!inFamily(start)) continue;

    let tail = 0;
    let area = 0;
    let touchesBorder = false;
    queue[0] = start;
    tail += 1;

    for (let head = 0; head < tail; head += 1) {
      const pixel = queue.at(head);
      if (pixel === undefined) break;

      region[area] = pixel;
      area += 1;

      const x = pixel % width;
      const y = (pixel - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;

      const neighbours = [
        x > 0 ? pixel - 1 : -1,
        x < width - 1 ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1,
        y < height - 1 ? pixel + width : -1,
      ];

      for (const next of neighbours) {
        if (next < 0 || seen.at(next) === 1) continue;
        seen[next] = 1;
        if (!inFamily(next)) continue;
        queue[tail] = next;
        tail += 1;
      }
    }

    if (touchesBorder || area < minArea) continue;

    for (let k = 0; k < area; k += 1) {
      const i = (region.at(k) ?? 0) * 4;
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    }
  }

  return { width, height, data: out };
}

/* -------------------------------- exhaust plume ---------------------------- */

/** Options for {@link dropExhaustPlume}; defaults are the calibrated values. */
export interface PlumeOptions {
  readonly hueMin?: number;
  readonly hueMax?: number;
  readonly minSaturation?: number;
  readonly minBrightness?: number;
  readonly minArea?: number;
  readonly minCorePixels?: number;
}

/**
 * Warm band the flame occupies, from its red outer rim to its yellow core.
 *
 * `hueMin > hueMax` deliberately means "wrap through 0°": the measured art-05 flame has a
 * bright red rim at 0.0–359.7°, and a plain `hue >= min && hue <= max` test abandoned that
 * rim as a detached 244 px component below every threshold. Widening the band to 340–70°
 * joins the rim to the body — a 3,038 px component with a 275 px white-hot core — and, on
 * all four hostile sheets, still matches that one region and nothing else.
 */
export const PLUME_HUE_MIN = 340;
export const PLUME_HUE_MAX = 70;
export const PLUME_MIN_SATURATION = 0.5;
export const PLUME_MIN_BRIGHTNESS = 150;

/**
 * Smallest warm component that can be a flame. Measured on the four hostile sheets, the
 * art-05 plume is 3,038 px including its red rim at 512 px per cell.
 */
export const MIN_PLUME_AREA = 900;

/**
 * A flame is drawn with a white-hot interior. Instrument lights, canopy frames and lit
 * instrument panels peak at a few dozen near-white yellow pixels; the measured art-05 plume
 * carries 285, the next brightest legitimate warm region in the whole sheet (the hunter
 * drone's canopy) carries 88.
 */
export const MIN_PLUME_CORE_PIXELS = 128;

/**
 * Remove exhaust plumes from a keyed raster.
 *
 * `docs/ART_BIBLE.md` §8 forbids plumes and art-05 cell 3 shipped one anyway: a white-hot
 * jet flame hanging off the engine nozzle. Keying it is preferred over refusing the cell
 * because the jet itself is a usable sprite once the flame is gone (WO-27 repacks the
 * sheets; it should not have to replace a good aircraft).
 *
 * There is no colour that means "flame" — the same sheet contains a bright yellow-green
 * bulldozer body (4,550 px of warm pixels) and an orange drone canopy, and the keyed plate
 * blend makes geometry unreliable too: the model casts a drop shadow below every vehicle,
 * so "hangs below the silhouette" is not a usable test either. What does separate them is
 * the white-hot core. A component is a plume when it is warm, at least {@link MIN_PLUME_AREA}
 * px, and contains at least {@link MIN_PLUME_CORE_PIXELS} near-white yellow pixels; the two
 * floors together matched exactly one region across all four hostile sheets.
 *
 * The raster must already have been through {@link chromaKey}: the pass is a component walk
 * over opaque pixels and clears whole components, never individual pixels.
 */
export function dropExhaustPlume(raster: Raster, options: PlumeOptions = {}): Raster {
  const hueMin = options.hueMin ?? PLUME_HUE_MIN;
  const hueMax = options.hueMax ?? PLUME_HUE_MAX;
  const minSaturation = options.minSaturation ?? PLUME_MIN_SATURATION;
  const minBrightness = options.minBrightness ?? PLUME_MIN_BRIGHTNESS;
  const minArea = options.minArea ?? MIN_PLUME_AREA;
  const minCorePixels = options.minCorePixels ?? MIN_PLUME_CORE_PIXELS;

  const { width, height, data } = raster;
  const out = Buffer.from(data);

  /** White-hot interior of a flame: a near-white yellow, brighter than any palette colour. */
  const isCore = (r: number, g: number, b: number): boolean => r >= 230 && g >= 220 && b <= 150;

  const isWarm = (pixel: number): boolean => {
    const i = pixel * 4;
    if (data.readUInt8(i + 3) === 0) return false;

    const r = data.readUInt8(i);
    const g = data.readUInt8(i + 1);
    const b = data.readUInt8(i + 2);
    if (Math.max(r, g, b) < minBrightness) return false;

    const { hue, saturation } = hueAndSaturation(r, g, b);
    if (saturation < minSaturation) return false;

    // `hueMin > hueMax` means the band wraps through red, so the flame's outer rim stays
    // attached to its body instead of being left behind as a detached bright-red fragment.
    return hueMin <= hueMax
      ? hue >= hueMin && hue <= hueMax
      : hue >= hueMin || hue <= hueMax;
  };

  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const region = new Int32Array(width * height);

  for (let start = 0; start < width * height; start += 1) {
    if (seen.at(start) === 1) continue;
    seen[start] = 1;
    if (!isWarm(start)) continue;

    let tail = 0;
    let area = 0;
    let cores = 0;
    queue[0] = start;
    tail += 1;

    for (let head = 0; head < tail; head += 1) {
      const pixel = queue.at(head);
      if (pixel === undefined) break;

      region[area] = pixel;
      area += 1;

      const i = pixel * 4;
      if (isCore(data.readUInt8(i), data.readUInt8(i + 1), data.readUInt8(i + 2))) {
        cores += 1;
      }

      const x = pixel % width;
      const y = (pixel - x) / width;
      const neighbours = [
        x > 0 ? pixel - 1 : -1,
        x < width - 1 ? pixel + 1 : -1,
        y > 0 ? pixel - width : -1,
        y < height - 1 ? pixel + width : -1,
      ];

      for (const next of neighbours) {
        if (next < 0 || seen.at(next) === 1) continue;
        seen[next] = 1;
        if (!isWarm(next)) continue;
        queue[tail] = next;
        tail += 1;
      }
    }

    if (area < minArea || cores < minCorePixels) continue;

    for (let k = 0; k < area; k += 1) {
      const i = (region.at(k) ?? 0) * 4;
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    }
  }

  return { width, height, data: out };
}

/**
 * Tight box around every pixel above an alpha threshold, or null when the cell is empty.
 *
 * This is the literal box: a single stray pixel on the cell border drags it across the
 * whole cell. Use {@link subjectBounds} when the box is going to be used to trim a sprite.
 */
export function alphaBounds(raster: Raster, threshold = 8): Box | null {
  let minX = raster.width;
  let minY = raster.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (raster.data[(y * raster.width + x) * 4 + 3]! > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Smallest 4-connected group of opaque pixels that counts as part of a sprite.
 *
 * Generated sheets carry 1–3 px specks where the flat plate meets a cell seam, and a
 * speck sitting on the cell border is catastrophic for trimming: it stretches the trim
 * box to the full cell, so the sprite is scaled down and pushed off-centre. At 512 px per
 * cell a 16 px component is 0.006% of the cell area — orders of magnitude below the
 * smallest legitimate sprite detail — so an area floor separates specks from subject
 * without any guesswork about colour or position.
 */
export const MIN_SUBJECT_COMPONENT_AREA = 16;

/**
 * Trim box for a sprite: like {@link alphaBounds}, but each 4-connected component is
 * measured first and components smaller than `minComponentArea` are ignored.
 *
 * Connectivity is 4-way on purpose. An 8-way fill would join a speck that merely touches
 * the subject diagonally onto the subject component, which is exactly the case the area
 * floor is meant to reject.
 *
 * If *every* component is below the floor, the largest one is still returned: a cell is
 * never reported empty merely because its content is small, and the pipeline degrades to
 * the old behaviour rather than discarding a cell.
 */
export function subjectBounds(
  raster: Raster,
  threshold = 8,
  minComponentArea = MIN_SUBJECT_COMPONENT_AREA,
): Box | null {
  const { width, height, data } = raster;
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const neighbours = new Int32Array(4);
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  let kept = false;

  let largestArea = 0;
  let largestBox: Box | null = null;

  for (let start = 0; start < width * height; start += 1) {
    if (seen[start] === 1) continue;
    seen[start] = 1;
    if (data[start * 4 + 3]! <= threshold) continue;

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    let sp = 0;
    stack[sp] = start;
    sp += 1;

    while (sp > 0) {
      sp -= 1;
      const pixel = stack[sp]!;
      const x = pixel % width;
      const y = (pixel - x) / width;

      area += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      neighbours[0] = x > 0 ? pixel - 1 : -1;
      neighbours[1] = x < width - 1 ? pixel + 1 : -1;
      neighbours[2] = y > 0 ? pixel - width : -1;
      neighbours[3] = y < height - 1 ? pixel + width : -1;

      for (let n = 0; n < 4; n += 1) {
        const next = neighbours[n]!;
        if (next < 0 || seen[next] === 1) continue;
        seen[next] = 1;
        if (data[next * 4 + 3]! > threshold) {
          stack[sp] = next;
          sp += 1;
        }
      }
    }

    const box: Box = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };

    if (area > largestArea) {
      largestArea = area;
      largestBox = box;
    }

    if (area < minComponentArea) continue;

    kept = true;
    if (minX < left) left = minX;
    if (minY < top) top = minY;
    if (maxX > right) right = maxX;
    if (maxY > bottom) bottom = maxY;
  }

  if (!kept) return largestBox;
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * Rotate a raster by 180°.
 *
 * Exact, not resampled: destination pixel `(width-1-x, height-1-y)` gets source pixel
 * `(x, y)`, so every colour and alpha value survives untouched. Used to bring a cell the
 * model drew nose-down back to the game's nose-up convention.
 */
export function rotate180(raster: Raster): Raster {
  const { width, height, data } = raster;
  const out = Buffer.alloc(data.length);
  const last = width * height - 1;

  for (let pixel = 0; pixel <= last; pixel += 1) {
    const si = pixel * 4;
    const di = (last - pixel) * 4;
    out[di] = data[si]!;
    out[di + 1] = data[si + 1]!;
    out[di + 2] = data[si + 2]!;
    out[di + 3] = data[si + 3]!;
  }

  return { width, height, data: out };
}

/**
 * Nearest-neighbour scale-to-fit inside a square canvas, centred.
 *
 * Aspect ratio is preserved so a long car does not become a fat car. Sampling is
 * point-sampled from the centre of each destination pixel, which keeps hard edges hard.
 */
export function fitCentered(source: Raster, canvasSize: number, maxFill = 0.94): Raster {
  const limit = Math.floor(canvasSize * maxFill);
  const scale = Math.min(limit / source.width, limit / source.height);
  const targetW = Math.max(1, Math.round(source.width * scale));
  const targetH = Math.max(1, Math.round(source.height * scale));

  const out = Buffer.alloc(canvasSize * canvasSize * 4);
  const offX = Math.floor((canvasSize - targetW) / 2);
  const offY = Math.floor((canvasSize - targetH) / 2);

  for (let y = 0; y < targetH; y += 1) {
    const sy = Math.min(source.height - 1, Math.floor((y * source.height) / targetH));
    for (let x = 0; x < targetW; x += 1) {
      const sx = Math.min(source.width - 1, Math.floor((x * source.width) / targetW));
      const si = (sy * source.width + sx) * 4;
      const di = ((offY + y) * canvasSize + offX + x) * 4;
      out[di] = source.data[si]!;
      out[di + 1] = source.data[si + 1]!;
      out[di + 2] = source.data[si + 2]!;
      out[di + 3] = source.data[si + 3]!;
    }
  }

  return { width: canvasSize, height: canvasSize, data: out };
}

/* -------------------------------- quantising ------------------------------- */

function nearestPaletteIndex(
  r: number,
  g: number,
  b: number,
  colors: readonly PaletteEntry[],
): { index: number; distance: number } {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const c of colors) {
    // Weighted Euclidean distance approximates perceived difference better than plain RGB.
    const dr = r - c.rgb[0];
    const dg = g - c.rgb[1];
    const db = b - c.rgb[2];
    const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = c.index;
    }
  }
  return { index: bestIndex, distance: Math.sqrt(bestDistance) };
}

export interface QuantizeResult {
  readonly raster: Raster;
  /** Mean distance from the source colour to its palette slot, 0–441. Lower is better. */
  readonly meanDistance: number;
  /** Distinct palette indices actually used. A sprite using one colour is a failure. */
  readonly distinctColors: number;
}

/**
 * Force every pixel onto the locked palette.
 *
 * Order is important: quantise *after* downscaling so the palette is applied to final
 * pixels, and *without* dithering because dithering is what makes AI pixel art look noisy.
 */
export function quantize(source: Raster, palette: Palette, alphaThreshold = 90): QuantizeResult {
  const out = Buffer.alloc(source.width * source.height * 4);
  const used = new Set<number>();
  let distanceSum = 0;
  let counted = 0;

  for (let i = 0; i < source.data.length; i += 4) {
    const a = source.data[i + 3]!;
    if (a < alphaThreshold) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }

    const r = source.data[i]!;
    const g = source.data[i + 1]!;
    const b = source.data[i + 2]!;
    const { index, distance } = nearestPaletteIndex(r, g, b, palette.colors);
    const entry = palette.colors.find((c) => c.index === index)!;

    out[i] = entry.rgb[0];
    out[i + 1] = entry.rgb[1];
    out[i + 2] = entry.rgb[2];
    out[i + 3] = 255;

    used.add(index);
    distanceSum += distance;
    counted += 1;
  }

  return {
    raster: { width: source.width, height: source.height, data: out },
    meanDistance: counted === 0 ? 0 : distanceSum / counted,
    distinctColors: used.size,
  };
}

/**
 * Draw a 1px inner outline in the void colour.
 *
 * Inner rather than outer so the sprite keeps its cell footprint — an outer ring would
 * clip against neighbouring cells at atlas time and change the sprite's apparent size
 * between sheets.
 */
export function outline(raster: Raster, palette: Palette, hex = '#0b0d10'): Raster {
  const voidEntry = palette.colors.find((c) => c.hex === hex.toLowerCase());
  const rgb = voidEntry ? voidEntry.rgb : hexToRgb(hex);
  const out = Buffer.from(raster.data);
  const { width, height } = raster;

  const opaque = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return raster.data[(y * width + x) * 4 + 3]! > 0;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (!opaque(x, y)) continue;
      const edge = !opaque(x - 1, y) || !opaque(x + 1, y) || !opaque(x, y - 1) || !opaque(x, y + 1);
      if (edge) {
        out[i] = rgb[0];
        out[i + 1] = rgb[1];
        out[i + 2] = rgb[2];
        out[i + 3] = 255;
      }
    }
  }

  return { width, height, data: out };
}

/** Colour histogram in palette space, used by the scorer. */
export function paletteHistogram(raster: Raster, palette: Palette): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < raster.data.length; i += 4) {
    if (raster.data[i + 3]! < 8) continue;
    const hex = rgbToHex(raster.data[i]!, raster.data[i + 1]!, raster.data[i + 2]!).toLowerCase();
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return counts;
}

/**
 * Left/right mirror overlap, 0–1.
 *
 * Vehicles are near-symmetric from above, so this is a cheap, objective way to catch a
 * sheet where the model drew warped or half-missing cars.
 */
export function mirrorSymmetry(raster: Raster): number {
  const { width, height, data } = raster;
  let matching = 0;
  let opaque = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const left = data[(y * width + x) * 4 + 3]! > 8;
      const right = data[(y * width + (width - 1 - x)) * 4 + 3]! > 8;
      if (left || right) {
        opaque += 1;
        if (left === right) matching += 1;
      }
    }
  }

  return opaque === 0 ? 0 : matching / opaque;
}

/** Mean absolute difference between opposing edges, 0–255. Lower means more tileable. */
export function seamError(raster: Raster): number {
  const { width, height, data } = raster;
  let vertical = 0;
  let horizontal = 0;

  for (let y = 0; y < height; y += 1) {
    for (let c = 0; c < 3; c += 1) {
      const l = data[(y * width + 0) * 4 + c]!;
      const r = data[(y * width + width - 1) * 4 + c]!;
      vertical += Math.abs(l - r);
    }
  }

  for (let x = 0; x < width; x += 1) {
    for (let c = 0; c < 3; c += 1) {
      const t = data[(0 * width + x) * 4 + c]!;
      const b = data[((height - 1) * width + x) * 4 + c]!;
      horizontal += Math.abs(t - b);
    }
  }

  const samples = height * 3 + width * 3;
  return samples === 0 ? 0 : (vertical + horizontal) / samples;
}
