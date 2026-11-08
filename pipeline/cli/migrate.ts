import {
  addMissingSlots,
  clearLimits,
  LEDGER_PATH,
  loadLedger,
  saveLedger,
  setLimit,
  setPerSlotLimit,
  summarize,
} from '../lib/ledger.js';
import { banner, info, numberFlag, ok, parseArgs, printSummary, run, SLOTS } from './util.js';

/**
 * Migrate `pipeline/budget.json` without hand-editing it.
 *
 * `budget.json` is generated output: `art:init` recreates it from scratch, which would
 * wipe every recorded attempt and every recorded cent. This command instead applies the
 * changes that slot-list and ledger decisions actually need, in place:
 *
 *   - `--unlimited` removes the lifetime ceiling and the per-slot cap (the default state
 *     after the human removed the image-cost constraint)
 *   - `--limit <n>` sets an explicit, optional lifetime ceiling
 *   - `--per-slot <n>` sets an explicit, optional per-slot attempt cap
 *   - append slots that exist in `pipeline/registry/slots.ts` but not yet in the ledger
 *
 * Everything is computed in memory first and written once at the end, so a validation
 * failure leaves the ledger on disk exactly as it was.
 */
run(async () => {
  banner('DEADLANE · migrate image ledger');

  const { flags } = parseArgs(process.argv.slice(2));
  const ledger = await loadLedger();

  const wantUnlimited = flags.unlimited === true;
  const wantLimit = flags.limit !== undefined;
  const wantPerSlot = flags['per-slot'] !== undefined;

  if (wantUnlimited && (wantLimit || wantPerSlot)) {
    throw new Error('Pass either --unlimited or an explicit --limit/--per-slot, not both.');
  }

  const beforeLimit = ledger.limit;
  const beforePerSlot = ledger.perSlotLimit;
  let next = ledger;

  if (wantUnlimited) {
    next = clearLimits(next);
  }
  if (wantLimit) {
    next = setLimit(next, numberFlag(flags, 'limit'));
  }
  if (wantPerSlot) {
    next = setPerSlotLimit(next, numberFlag(flags, 'per-slot'));
  }

  const slotIds = SLOTS.map((s) => s.id);
  const missing = slotIds.filter((id) => next.slots[id] === undefined);
  next = addMissingSlots(next, slotIds);

  const capsChanged = beforeLimit !== next.limit || beforePerSlot !== next.perSlotLimit;

  if (capsChanged) {
    ok(
      `limits ${describeLimit(beforeLimit)} / ${describePerSlot(beforePerSlot)} → ` +
        `${describeLimit(next.limit)} / ${describePerSlot(next.perSlotLimit)}`,
    );
  } else {
    info(`limits unchanged (${describeLimit(next.limit)} / ${describePerSlot(next.perSlotLimit)})`);
  }

  if (missing.length > 0) {
    ok(`${missing.length} slot(s) added`);
    for (const id of missing) info(id);
  } else {
    info('no missing slots');
  }

  if (!capsChanged && missing.length === 0) {
    info('nothing to write');
  } else {
    await saveLedger(next);
    ok(`wrote ${LEDGER_PATH}`);
  }

  const s = summarize(next);
  info(`${Object.keys(next.slots).length} slots in ledger`);
  if (s.spendUsd > 0) info(`recorded spend $${s.spendUsd.toFixed(3)}`);
  printSummary(next);
});

function describeLimit(limit: number | undefined): string {
  return limit === undefined ? 'no lifetime cap' : `lifetime limit ${limit}`;
}

function describePerSlot(limit: number | undefined): string {
  return limit === undefined ? 'no per-slot cap' : `per-slot cap ${limit}`;
}
