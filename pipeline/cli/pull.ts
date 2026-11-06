import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { REPO_ROOT, loadLedger, recordGeneration, saveLedger } from '../lib/ledger.js';
import { bad, banner, info, numberFlag, ok, parseArgs, printSummary, requireFlag, run } from './util.js';

/**
 * Download a generated image and attach it to its ledger attempt.
 *
 * The download is verified before the ledger is written: a zero-byte or non-image
 * response would otherwise silently become "the art" and only be discovered at atlas time.
 */
run(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const slotId = requireFlag(flags, 'slot');
  const attempt = numberFlag(flags, 'attempt');
  const requestId = requireFlag(flags, 'request-id');
  const url = requireFlag(flags, 'url');
  const cost = flags.cost !== undefined ? numberFlag(flags, 'cost') : undefined;

  const target = resolve(REPO_ROOT, 'pipeline', 'raw', slotId, `attempt-${attempt}.png`);
  await mkdir(dirname(target), { recursive: true });

  info(`fetching ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    bad(`HTTP ${response.status} while downloading ${url}`);
    info('The image was still generated and billed. Record it manually if a mirror URL exists,');
    info('otherwise release the attempt and retry with a fresh seed.');
    process.exitCode = 1;
    return;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const isPng = bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;

  if (!isPng && !isJpeg) {
    bad(`Downloaded ${bytes.length} bytes that are not a PNG or JPEG.`);
    process.exitCode = 1;
    return;
  }

  const finalPath = isPng ? target : target.replace(/\.png$/, '.jpg');
  await writeFile(finalPath, bytes);

  const ledger = await loadLedger();
  const next = recordGeneration(ledger, slotId, attempt, {
    requestId,
    url,
    ...(cost !== undefined ? { costUsd: cost } : {}),
  });
  await saveLedger(next);

  const size = await stat(finalPath);
  banner(`DEADLANE · pulled ${slotId} attempt #${attempt}`);
  ok(`${finalPath.replace(REPO_ROOT + '/', '')} (${(size.size / 1024).toFixed(0)} KB)`);
  if (cost !== undefined) info(`recorded cost $${cost.toFixed(3)}`);
  printSummary(next);

  console.log('');
  console.log('  Next:');
  console.log(`    npm run art:process -- --slot ${slotId}`);
});
