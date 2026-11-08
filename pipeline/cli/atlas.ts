import { loadLedger, saveLedger } from '../lib/ledger.js';
import { SLOTS, requireSlot } from '../registry/slots.js';
import { buildAtlas, loadAssetsManifest } from '../steps/build-atlas.js';
import { REPO_ROOT } from '../lib/ledger.js';
import { banner, info, ok, run } from './util.js';

/**
 * Repack every approved slot into `public/assets/`.
 *
 * Safe to run at any time: unapproved slots are simply skipped, so the game keeps working
 * with placeholders while art is still being produced. A sheet that already shipped is
 * carried over when its slot is not rebuilt — reopening a slot for a retry must not
 * delete frames the game is already drawing.
 */
run(async () => {
  const ledger = await loadLedger();
  banner('DEADLANE · build atlas');

  const entries = [];
  for (const slot of SLOTS) {
    const record = ledger.slots[slot.id];
    if (!record?.selected || record.status !== 'approved') {
      info(`${slot.id.padEnd(24)} skipped (${record?.status ?? 'unregistered'})`);
      continue;
    }
    entries.push({ slot, attempt: record.selected });
  }

  if (entries.length === 0) {
    banner('nothing approved yet');
    info('The game runs on procedural placeholder art until a slot is approved.');
    return;
  }

  const previous = await loadAssetsManifest();
  const rebuilt = new Set(entries.map((entry) => entry.slot.id));
  const manifest = await buildAtlas(entries, { carryOver: previous?.sheets ?? {} });
  const sheetCount = Object.keys(manifest.sheets).length;
  const spriteCount = Object.keys(manifest.sprites).length;

  console.log('');
  for (const slotId of Object.keys(manifest.sheets)) {
    if (rebuilt.has(slotId)) continue;
    info(`${slotId.padEnd(24)} kept (shipped sheet, slot not rebuilt)`);
  }
  ok(`${sheetCount} sheet(s), ${spriteCount} sprite id(s)`);
  info(`written to ${REPO_ROOT}/public/assets`);

  // Mark slots whose sheets were built, for the status view.
  for (const slot of SLOTS) {
    const record = ledger.slots[slot.id];
    if (record?.selected && record.status === 'approved' && !manifest.sheets[slot.id]) {
      info(`${slot.id} had no usable cells — left on placeholder art`);
    }
  }
  await saveLedger(ledger);
});

export { requireSlot };
