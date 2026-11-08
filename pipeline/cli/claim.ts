import { claimAttempt, loadLedger, saveLedger, attemptsFor, summarize } from '../lib/ledger.js';
import { deriveSeed, hashText } from '../lib/hash.js';
import { buildPrompt, retrySuffix } from '../registry/prompts.js';
import { requireSlot } from '../registry/slots.js';
import { loadModel } from '../lib/model.js';
import { bad, banner, info, numberFlag, ok, parseArgs, printSummary, requireFlag, run } from './util.js';

/**
 * Reserve one image, then print the exact `run_model` call to make.
 *
 * This is the only sanctioned way to generate: every image is claimed first, so the
 * ledger stays the audit trail. Nothing in the pipeline calls a generation model
 * directly — the agent does that through the fal MCP server, using the arguments
 * printed here. There is no lifetime ceiling and no per-slot attempt cap; the only
 * refusals left are an approved/skipped slot and a duplicate seed.
 */
run(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const slotId = requireFlag(flags, 'slot');
  const slot = requireSlot(slotId);
  const ledger = await loadLedger();

  const model = await loadModel();
  if (model.status !== 'resolved' || !model.endpointId) {
    throw new Error(
      'No image model is pinned yet. Resolve it first with the fal MCP tools ' +
        '(search_models → get_pricing → get_model_schema) and record the result with ' +
        '`npm run art:model -- --endpoint <endpoint_id> --count-param <name> --seed-param <name>`.',
    );
  }

  const nextAttempt = attemptsFor(ledger, slotId) + 1;
  const seed = flags.seed !== undefined ? numberFlag(flags, 'seed') : deriveSeed(slotId, nextAttempt);

  const base = buildPrompt(slot);
  const prompt = `${base.prompt}${retrySuffix(nextAttempt)}`;
  const promptHash = hashText(prompt);

  const result = claimAttempt(ledger, slotId, { seed, promptHash });
  if (!result.ok) {
    bad(result.reason);
    console.log('');
    info('Current ledger:');
    printSummary(ledger);
    process.exitCode = 2;
    return;
  }

  await saveLedger(result.ledger);

  banner(`DEADLANE · claimed ${slotId} attempt #${result.attempt.attempt}`);
  ok(`reserved 1 image · seed ${seed}`);
  printSummary(result.ledger);

  console.log('');
  console.log('  \x1b[1mCall the fal MCP tool now, then stop:\x1b[0m');
  console.log('');
  console.log(`    run_model(${JSON.stringify(model.endpointId, null, 0)}, {`);
  console.log(`      prompt: ${JSON.stringify(prompt)},`);
  console.log(`      ${model.params.count}: 1,   \x1b[90m// exactly one image — the ledger counts images\x1b[0m`);
  console.log(`      ${model.params.seed}: ${seed},`);
  console.log(`      ${model.params.imageSize}: "square_hd"`);
  console.log(`    })`);
  console.log('');
  info(`negative: ${base.negativePrompt}`);
  if (nextAttempt > 1) {
    info(`retry revision: ${retrySuffix(nextAttempt).trim()}`);
  }
  console.log('');
  console.log('  Then record the result:');
  console.log(
    `    npm run art:pull -- --slot ${slotId} --attempt ${result.attempt.attempt} \\\n      --request-id <request_id> --url <image_url> --cost <usd>`,
  );
  console.log('');
  info('If generation fails, give the image back: npm run art:release -- --slot ' + slotId + ' --attempt ' + result.attempt.attempt);
});
