import {
  addMissingSlots,
  LEDGER_PATH,
  loadLedger,
  saveLedger,
  setLimit,
  summarize,
} from '../lib/ledger.js';
import { banner, info, numberFlag, ok, parseArgs, printSummary, run, SLOTS } from './util.js';

/**
 * Migrate `pipeline/budget.json` without hand-editing it.
 *
 * `budget.json` is generated output: `art:init` recreates it from scratch, which would
 * wipe every recorded attempt and every recorded cent. This command instead applies the
 * two changes that slot-list and budget decisions actually need, in place:
 *
 *   - raise (or lower, never below recorded spend) the lifetime image limit
 *   - append slots that exist in `pipeline/registry/slots.ts` but not yet in the ledger
 *
 * Everything is computed in memory first and written once at the end, so a validation
 * failure leaves the ledger on disk exactly as it was.
 */
run(async () => {
  banner('DEADLANE · migrate image budget');

  const { flags } = parseArgs(process.argv.slice(2));
  const ledger = await loadLedger();
  const targetLimit = numberFlag(flags, 'limit', ledger.limit);

  const slotIds = SLOTS.map((s) => s.id);
  const missing = slotIds.filter((id) => ledger.slots[id] === undefined);

  // Both steps are pure and throw before returning anything usable.
  const next = addMissingSlots(setLimit(ledger, targetLimit), slotIds);
  const limitChanged = targetLimit !== ledger.limit;

  if (limitChanged) {
    ok(`limit ${ledger.limit} → ${targetLimit}`);
  } else {
    info(`limit unchanged (${ledger.limit})`);
  }

  if (missing.length > 0) {
    ok(`${missing.length} slot(s) added`);
    for (const id of missing) info(id);
  } else {
    info('no missing slots');
  }

  if (!limitChanged && missing.length === 0) {
    info('nothing to write');
  } else {
    await saveLedger(next);
    ok(`wrote ${LEDGER_PATH}`);
  }

  const s = summarize(next);
  info(`${Object.keys(next.slots).length} slots in ledger · per-slot cap ${next.perSlotLimit}`);
  if (s.spendUsd > 0) info(`recorded spend $${s.spendUsd.toFixed(3)}`);
  printSummary(next);
});
