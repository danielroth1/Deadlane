import { loadLedger, reopenSlot, saveLedger } from '../lib/ledger.js';
import { banner, info, ok, parseArgs, printSummary, requireFlag, run } from './util.js';

/**
 * Return an approved slot to `open` so a rejected selection can be retried.
 *
 * `art:select` locks a slot at `status: "approved"`, and `claimAttempt` refuses an
 * approved slot. When a reviewer rejects the selected attempt, this is the only way back
 * to a retryable slot — `budget.json` is generated and must not be hand-edited.
 *
 * Attempts are never deleted: seeds, request ids, urls and costs stay in the ledger for
 * audit. Only the slot status and the selection are cleared, so no budget moves.
 */
run(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const slotId = requireFlag(flags, 'slot');
  const note = typeof flags.note === 'string' ? flags.note : 'reopened by operator';

  const ledger = await loadLedger();
  // Throws (leaving the ledger on disk untouched) for an unknown slot or a slot that is
  // already open, before anything is written.
  const next = reopenSlot(ledger, slotId);
  await saveLedger(next);

  banner(`DEADLANE · reopened ${slotId}`);
  ok(`status → ${next.slots[slotId]?.status ?? 'unknown'}`);
  ok('selection cleared · attempts kept');
  info(note);
  printSummary(next);
});
