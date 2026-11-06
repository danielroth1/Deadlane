import { loadLedger, releaseAttempt, saveLedger } from '../lib/ledger.js';
import { banner, info, numberFlag, ok, parseArgs, printSummary, requireFlag, run } from './util.js';

/**
 * Give an image back when a generation produced nothing usable.
 *
 * Use this when `run_model` errored or returned no image. Do not use it to "undo" a bad
 * generation — a bad image still cost money and must stay in the ledger for auditability.
 * Retry instead.
 */
run(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const slotId = requireFlag(flags, 'slot');
  const attempt = numberFlag(flags, 'attempt');
  const note = typeof flags.note === 'string' ? flags.note : 'generation produced no image';

  const ledger = await loadLedger();
  const next = releaseAttempt(ledger, slotId, attempt, note);
  await saveLedger(next);

  banner(`DEADLANE · released ${slotId} attempt #${attempt}`);
  ok('budget returned');
  info(note);
  printSummary(next);
});
