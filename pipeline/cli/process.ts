import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT, loadLedger } from '../lib/ledger.js';
import { requireSlot } from '../registry/slots.js';
import { processSlot } from '../steps/process-slot.js';
import { bad, banner, info, numberFlag, ok, parseArgs, requireFlag, run } from './util.js';

function findRaw(slotId: string, attempt: number): string | null {
  const base = resolve(REPO_ROOT, 'pipeline', 'raw', slotId, `attempt-${attempt}`);
  for (const ext of ['png', 'jpg', 'jpeg', 'webp']) {
    const candidate = `${base}.${ext}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Turn a pulled image into game-ready sprites and a metrics file.
 */
run(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const slotId = requireFlag(flags, 'slot');
  const slot = requireSlot(slotId);
  const ledger = await loadLedger();

  const generated = ledger.slots[slotId]?.attempts.filter((a) => a.state === 'generated') ?? [];
  if (generated.length === 0) {
    bad(`No generated attempt for "${slotId}". Run art:claim, then the fal model, then art:pull.`);
    process.exitCode = 2;
    return;
  }

  const attempt =
    flags.attempt !== undefined ? numberFlag(flags, 'attempt') : generated[generated.length - 1]!.attempt;

  const rawPath = findRaw(slotId, attempt);
  if (!rawPath) {
    bad(`Raw image for ${slotId} attempt ${attempt} is missing from pipeline/raw/.`);
    process.exitCode = 2;
    return;
  }

  banner(`DEADLANE · processing ${slotId} #${attempt}`);
  info(`source ${rawPath.replace(`${REPO_ROOT}/`, '')}`);

  const result = await processSlot(slot, attempt, rawPath);
  const s = result.metrics.summary;

  ok(`usable cells ${s.usableCells}/${s.totalCells}`);
  info(`palette distance ${s.meanPaletteDistance.toFixed(1)} · scale variance ${s.sizeVariance.toFixed(2)}`);
  if (slot.target === 'tile') {
    info(`seam error ${s.meanSeamError.toFixed(1)} (lower is better)`);
  } else if (slot.target === 'vehicle') {
    info(`mirror symmetry ${(s.meanSymmetry * 100).toFixed(0)}%`);
  }
  ok(`score ${s.score.toFixed(1)}/100`);

  if (s.usableCells === 0) {
    bad('Every cell was empty. This attempt is unusable — release it and retry with a new seed.');
    process.exitCode = 3;
    return;
  }

  console.log('');
  console.log(`  Sprites: ${result.workDir.replace(`${REPO_ROOT}/`, '')}`);
  console.log(`  Then:    npm run art:select -- --slot ${slotId}`);
});
