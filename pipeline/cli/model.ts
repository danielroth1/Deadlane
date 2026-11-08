import { loadModel, saveModel } from '../lib/model.js';
import { loadLedger } from '../lib/ledger.js';
import { banner, info, ok, parseArgs, requireFlag, run } from './util.js';

/**
 * Record the verified model endpoint.
 *
 * Run this only after the fal MCP server has answered `search_models`, `get_pricing` and
 * `get_model_schema` for the endpoint. The point is that the id and its parameter names
 * are observed facts, not assumptions.
 */
run(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const endpointId = requireFlag(flags, 'endpoint');
  const unitPrice = flags['unit-price'];

  const model = await loadModel();
  model.status = 'resolved';
  model.endpointId = endpointId;
  model.params.count = typeof flags['count-param'] === 'string' ? flags['count-param'] : 'num_images';
  model.params.seed = typeof flags['seed-param'] === 'string' ? flags['seed-param'] : 'seed';
  model.params.imageSize = typeof flags['size-param'] === 'string' ? flags['size-param'] : 'image_size';
  if (typeof flags['image-url-param'] === 'string') {
    model.params.imageUrl = flags['image-url-param'];
  }
  if (typeof unitPrice === 'string') {
    model.pricing = { unit: 'image', amountUsd: Number(unitPrice) };
  }
  if (typeof flags['schema-file'] === 'string') {
    model.schemaPath = flags['schema-file'];
  }
  model.resolvedAt = new Date().toISOString();

  await saveModel(model);

  const ledger = await loadLedger();
  banner('DEADLANE · model pinned');
  ok(endpointId);
  info(`count=${model.params.count}  seed=${model.params.seed}  size=${model.params.imageSize}`);
  if (model.pricing) info(`$${model.pricing.amountUsd} / image`);
  info(
    `Budget of ${ledger.limit} images ≈ $` +
      ((model.pricing?.amountUsd ?? 0) * ledger.limit).toFixed(2),
  );
});
