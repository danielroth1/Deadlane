import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadLedger, saveLedger, selectAttempt } from '../lib/ledger.js';
import { requireSlot } from '../registry/slots.js';
import { metricsPath, type SlotMetrics } from '../steps/process-slot.js';
import { bad, banner, info, numberFlag, ok, parseArgs, requireFlag, run } from './util.js';

/**
 * Pick the best attempt for a slot.
 *
 * Automatic by default: highest `score` from pipeline/steps/process-slot.ts, ties broken by
 * the earlier attempt so the choice is stable across re-runs. `--attempt N` is the manual
 * override for when a reviewer disagrees with the scorer.
 */
run(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const slotId = requireFlag(flags, 'slot');
  const slot = requireSlot(slotId);
  const ledger = await loadLedger();

  const generated = ledger.slots[slotId]?.attempts.filter((a) => a.state === 'generated') ?? [];
  if (generated.length === 0) {
    bad(`No generated attempts for "${slotId}".`);
    process.exitCode = 2;
    return;
  }

  const scored: { attempt: number; metrics: SlotMetrics }[] = [];
  for (const record of generated) {
    const path = metricsPath(slotId, record.attempt);
    if (!existsSync(path)) {
      info(`attempt ${record.attempt} has not been processed yet — skipping`);
      continue;
    }
    scored.push({ attempt: record.attempt, metrics: JSON.parse(await readFile(path, 'utf8')) as SlotMetrics });
  }

  if (scored.length === 0) {
    bad('No processed attempts. Run `npm run art:process -- --slot ' + slotId + '` first.');
    process.exitCode = 2;
    return;
  }

  banner(`DEADLANE · select ${slotId}`);

  for (const entry of scored) {
    const s = entry.metrics.summary;
    console.log(
      `  #${entry.attempt}  score ${s.score.toFixed(1).padStart(5)}  ` +
        `cells ${s.usableCells}/${s.totalCells}  palette ${s.meanPaletteDistance.toFixed(0).padStart(3)}  ` +
        `sym ${(s.meanSymmetry * 100).toFixed(0).padStart(3)}%`,
    );
  }

  const manual = flags.attempt !== undefined ? numberFlag(flags, 'attempt') : undefined;
  const chosen = manual ?? scored.sort((a, b) => b.metrics.summary.score - a.metrics.summary.score || a.attempt - b.attempt)[0]!.attempt;

  const target = scored.find((s) => s.attempt === chosen);
  if (!target) {
    bad(`Attempt ${chosen} has not been processed.`);
    process.exitCode = 2;
    return;
  }

  if (target.metrics.summary.usableCells < slot.grid.cols * slot.grid.rows * 0.4) {
    info(
      `warning: only ${target.metrics.summary.usableCells} usable cells. ` +
        `The game will fall back to placeholder art for the missing sprites.`,
    );
  }

  const next = selectAttempt(ledger, slotId, chosen);
  await saveLedger(next);

  console.log('');
  ok(`selected attempt #${chosen}${manual === undefined ? ' (automatic)' : ' (manual override)'}`);
  info('run `npm run art:atlas` to repack the game assets');
});
