import { attemptsFor, loadLedger, summarize } from '../lib/ledger.js';
import { SLOTS } from '../registry/slots.js';
import { banner, info, printSummary, run } from './util.js';

/**
 * Print the image ledger in a form an agent can act on without reading the JSON.
 */
run(async () => {
  banner('DEADLANE · image ledger');
  const ledger = await loadLedger();
  printSummary(ledger);

  console.log('');
  const rows = Object.values(ledger.slots).map((slot) => {
    const used = attemptsFor(ledger, slot.id);
    const spec = SLOTS.find((s) => s.id === slot.id);
    const title = spec?.title ?? '(unregistered)';
    const selected = slot.selected ? `#${slot.selected}` : '—';
    return {
      id: slot.id.padEnd(24),
      title: title.padEnd(26),
      attempts: String(used).padStart(3),
      status: slot.status.padEnd(9),
      selected,
    };
  });

  console.log('  id                       title                        att  status     pick');
  console.log('  ' + '-'.repeat(84));
  for (const r of rows) {
    console.log(`  ${r.id} ${r.title} ${r.attempts}  ${r.status}  ${r.selected}`);
  }

  const s = summarize(ledger);
  console.log('');
  if (s.remaining === 0) {
    info('The configured lifetime limit is reached; retries need a higher limit.');
  } else if (s.unstarted > 0) {
    info(`${s.unstarted} slot(s) have never been attempted.`);
  } else {
    info('Every slot has at least one attempt. Retries are unlimited.');
  }
});
