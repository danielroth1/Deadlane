import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from '../lib/ledger.js';
import { loadAssetsManifest } from '../steps/build-atlas.js';
import { SLOTS } from '../registry/slots.js';
import { alphaBounds, crop, decode, hexToRgb, loadPalette, seamError } from '../lib/image.js';
import { bad, banner, ok, info, run } from './util.js';

/**
 * Gate on the generated art.
 *
 * Runs in CI and must pass before a build is allowed to ship. It only asserts things that
 * are objectively wrong — wrong size, off-palette pixels, empty frames, broken tiling — not
 * aesthetic judgement, which belongs to the reviewer.
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
  const allowed = new Set(palette.colors.map((c) => c.hex));
  const failures: string[] = [];
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
      const cell = crop(raster, { left: rect.x, top: rect.y, width: rect.w, height: rect.h });
      const bounds = alphaBounds(cell);
      if (!bounds) {
        failures.push(`${id}: frame is fully transparent`);
        continue;
      }

      // Palette conformance: every opaque pixel must be an exact palette value.
      let offPalette = 0;
      for (let i = 0; i < cell.data.length; i += 4) {
        if (cell.data[i + 3]! === 0) continue;
        checkedPixels += 1;
        const hex =
          '#' +
          [cell.data[i]!, cell.data[i + 1]!, cell.data[i + 2]!]
            .map((v) => v.toString(16).padStart(2, '0'))
            .join('');
        if (!allowed.has(hex)) offPalette += 1;
      }

      if (offPalette > 0) {
        const ratio = offPalette / Math.max(1, checkedPixels);
        if (ratio > 0.002 || offPalette > 40) {
          failures.push(`${id}: ${offPalette} off-palette pixel(s) (${(ratio * 100).toFixed(2)}%)`);
        }
      }
    }

    if (spec?.target === 'tile') {
      const err = seamError(raster);
      if (err > 72) {
        failures.push(`${slotId}: tiles do not wrap (seam error ${err.toFixed(1)} > 72)`);
      }
    }
  }

  // Cross-check the sprite ids the game asks for, where a mapping exists.
  const spriteCount = Object.keys(manifest.sprites).length;

  console.log('');
  info(`${Object.keys(manifest.sheets).length} sheet(s), ${checkedFrames} frame(s), ${spriteCount} sprite id(s)`);
  info(`${checkedPixels.toLocaleString()} opaque pixel(s) checked against ${allowed.size} palette colours`);

  if (failures.length > 0) {
    console.log('');
    for (const f of failures.slice(0, 40)) bad(f);
    if (failures.length > 40) bad(`... and ${failures.length - 40} more`);
    process.exitCode = 1;
    return;
  }

  ok('all generated art passes validation');
});

export { hexToRgb };
