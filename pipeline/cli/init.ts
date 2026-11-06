import { existsSync } from 'node:fs';
import { SLOTS } from '../registry/slots.js';
import { createLedger, LEDGER_PATH, saveLedger, summarize } from '../lib/ledger.js';
import { banner, info, ok, progressBar, run } from './util.js';

/**
 * Create pipeline/budget.json from the slot registry.
 *
 * Refuses to overwrite an existing ledger: the ledger is the audit trail of real money.
 */
run(async () => {
  banner('DEADLANE · initialise image budget');

  if (existsSync(LEDGER_PATH) && !process.argv.includes('--force')) {
    throw new Error(
      `${LEDGER_PATH} already exists. Refusing to overwrite real spend history. ` +
        `Pass --force only if you are deliberately resetting the project budget.`,
    );
  }

  const ledger = createLedger(
    SLOTS.map((s) => s.id),
    80,
    6,
  );
  await saveLedger(ledger);
  const s = summarize(ledger);

  ok(`created ${LEDGER_PATH}`);
  info(`${SLOTS.length} slots registered`);
  console.log(`  ${progressBar(s.used, s.limit)}`);
});
