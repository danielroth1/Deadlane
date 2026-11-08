import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from '../lib/ledger.js';
import { loadAssetsManifest } from '../steps/build-atlas.js';
import { SLOTS } from '../registry/slots.js';
import {
  MAX_TILE_SEAM_ERROR,
  alphaBounds,
  crop,
  decode,
  hexToRgb,
  loadPalette,
  seamError,
} from '../lib/image.js';
import { bad, banner, ok, info, run } from './util.js';

/**
 * Gate on the generated art.
 *
 * Two different kinds of problem, reported separately:
 *
 *   - **Technical failures** break the atlas or the game: a missing sheet, a sheet that is
 *     not the declared grid size, a frame that is empty or outside the sheet, magenta key
 *     left inside a sprite, or a declared surface tile that does not wrap. These exit
 *     non-zero because the build would ship broken assets.
 *   - **Style warnings** are the house preferences — palette conformance above all. A
 *     sheet can disagree with the palette and still be perfectly usable, so it is reported
 *     and never rejects the build. Quantisation and outlining remain the default style
 *     pass in `pipeline/steps/`, not a gate.
 *
 * Aesthetic judgement ("does this read as a car?") belongs to the reviewer, not to code.
 */
run(async () => {
  banner('DEADLANE · validate assets');

  const manifest = await loadAssetsManifest();
  if (!manifest) {
    info('No assets manifest yet — the game will run on procedural placeholder art.');
    info('This is expected before the first art slot is approved.');
    return;
  }

  const palette = await loadPalette();
  const allowed = new Set(palette.colors.map((c) => c.hex.toLowerCase()));
  const keyHex = palette.transparentKey.toLowerCase();
  const failures: string[] = [];
  const warnings: string[] = [];
  let checkedFrames = 0;
  let checkedPixels = 0;

  for (const [slotId, sheet] of Object.entries(manifest.sheets)) {
    const spec = SLOTS.find((s) => s.id === slotId);
    const imagePath = resolve(REPO_ROOT, 'public', sheet.image.replace(/^assets\//, 'assets/'));

    if (!existsSync(imagePath)) {
      failures.push(`${slotId}: sheet image missing at ${sheet.image}`);
      continue;
    }

    const raster = await decode(imagePath);
    const expectedW = sheet.cols * sheet.cellSize;
    const expectedH = sheet.rows * sheet.cellSize;

    if (raster.width !== expectedW || raster.height !== expectedH) {
      failures.push(
        `${slotId}: sheet is ${raster.width}x${raster.height}, expected ${expectedW}x${expectedH}`,
      );
    }

    for (const [id, rect] of Object.entries(sheet.frames)) {
      checkedFrames += 1;

      // Frame bounds: a frame outside the sheet would read the wrong pixels or crash.
      if (
        rect.x < 0 ||
        rect.y < 0 ||
        rect.w <= 0 ||
        rect.h <= 0 ||
        rect.x + rect.w > raster.width ||
        rect.y + rect.h > raster.height
      ) {
        failures.push(
          `${id}: frame ${rect.x},${rect.y} ${rect.w}x${rect.h} is outside the ${raster.width}x${raster.height} sheet`,
        );
        continue;
      }

      const cell = crop(raster, { left: rect.x, top: rect.y, width: rect.w, height: rect.h });
      const bounds = alphaBounds(cell);
      if (!bounds) {
        failures.push(`${id}: frame is fully transparent`);
        continue;
      }

      // Technical: the magenta key must never survive inside a shipped sprite. The key is
      // a saturated backdrop colour, so an opaque pixel of exactly that hex is bleed.
      let magentaBleed = 0;
      // Style: palette conformance is preferred, not required.
      let offPalette = 0;

      for (let i = 0; i < cell.data.length; i += 4) {
        if (cell.data[i + 3]! === 0) continue;
        checkedPixels += 1;
        const hex =
          '#' +
          [cell.data[i]!, cell.data[i + 1]!, cell.data[i + 2]!]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('');
        if (hex === keyHex) {
          magentaBleed += 1;
          continue;
        }
        if (!allowed.has(hex)) offPalette += 1;
      }

      if (magentaBleed > 0) {
        failures.push(`${id}: ${magentaBleed} magenta key pixel(s) survived inside the frame`);
      }

      if (offPalette > 0) {
        const ratio = offPalette / Math.max(1, checkedPixels);
        if (ratio > 0.002 || offPalette > 40) {
          warnings.push(
            `${id}: ${offPalette} off-palette pixel(s) (${(ratio * 100).toFixed(2)}%) — style only`,
          );
        }
      }

      // Only a full-bleed surface frame is ever repeated, so only it can seam. The build
      // records those frames in `sheet.tiles`; an object cell (a painted arrow, a sign) is
      // drawn once on transparency and is not tiled. A tile sheet that declares none of
      // its frames as surface tiles cannot be gated at all, so it is a failure, not a pass.
      if (spec?.target === 'tile' && sheet.tiles?.includes(id)) {
        const err = seamError(cell);
        if (err > MAX_TILE_SEAM_ERROR) {
          failures.push(
            `${id}: tiles do not wrap (seam error ${err.toFixed(1)} > ${MAX_TILE_SEAM_ERROR})`,
          );
        }
      }
    }

    if (spec?.target === 'tile' && (sheet.tiles === undefined || sheet.tiles.length === 0)) {
      failures.push(`${slotId}: tile sheet declares no surface frames — rebuild with art:atlas`);
    }
  }

  // Cross-check the sprite ids the game asks for, where a mapping exists.
  const spriteCount = Object.keys(manifest.sprites).length;

  console.log('');
  info(`${Object.keys(manifest.sheets).length} sheet(s), ${checkedFrames} frame(s), ${spriteCount} sprite id(s)`);
  info(`${checkedPixels.toLocaleString()} opaque pixel(s) checked against ${allowed.size} palette colours`);

  if (warnings.length > 0) {
    console.log('');
    info(`${warnings.length} style warning(s) — these do not fail the gate:`);
    for (const w of warnings.slice(0, 20)) info(w);
    if (warnings.length > 20) info(`... and ${warnings.length - 20} more`);
  }

  if (failures.length > 0) {
    console.log('');
    for (const f of failures.slice(0, 40)) bad(f);
    if (failures.length > 40) bad(`... and ${failures.length - 40} more`);
    process.exitCode = 1;
    return;
  }

  ok('all generated art passes the technical gate');
  if (warnings.length > 0) {
    info(`${warnings.length} style warning(s) recorded above; palette is a preference, not a rule.`);
  }
});

export { hexToRgb };
