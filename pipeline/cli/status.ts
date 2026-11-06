import { loadLedger } from '../lib/ledger.js';
import { SLOTS } from '../registry/slots.js';
import { attemptsFor, summarize } from '../lib/ledger.js';
import { banner, info, printSummary, run } from './util.js';

/**
 * Print the budget ledger in a form an agent can act on without reading the JSON.
 */
run(async () => {
  banner('DEADLANE · image budget');
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
      attempts: `${used}/${ledger.perSlotLimit}`.padStart(3),
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
    info('Budget exhausted. Do not generate. Review, select, and ship.');
  } else if (s.unstarted > 0) {
    info(`${s.unstarted} slot(s) still need a first attempt before any retries are allowed.`);
  } else {
    info('All slots have at least one attempt. Retries are available within the cap.');
  }
});
