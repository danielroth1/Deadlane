import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { REPO_ROOT } from './ledger.js';

/**
 * The pinned image model.
 *
 * We do not guess endpoint ids. `status` stays `unresolved` until an agent has confirmed,
 * through the fal MCP server, that (a) the endpoint exists, (b) it is the cheapest viable
 * text-to-image endpoint, and (c) what its parameter names actually are. Only then is it
 * written here, and every later generation uses exactly this endpoint.
 */
export interface ModelRegistry {
  status: 'unresolved' | 'resolved';
  /** What the human asked for, in their words. Kept for the audit trail. */
  requested: string;
  endpointId: string | null;
  /** Parameter names, which differ per model. Never hardcode these elsewhere. */
  params: {
    /** Parameter that sets how many images one call produces. Always set to 1. */
    count: string;
    seed: string;
    imageSize: string;
    /** Optional reference-image parameter, when the model supports one. */
    imageUrl?: string;
  };
  /** Unit price recorded from `get_pricing`, for the cost column in the ledger. */
  pricing?: { unit: string; amountUsd: number } | null;
  /** The `get_model_schema` output, cached so agents do not re-fetch it. */
  schemaPath: string | null;
  resolvedAt: string | null;
  notes: string[];
}

export const MODEL_PATH = resolve(REPO_ROOT, 'pipeline', 'registry', 'model.json');

export async function loadModel(): Promise<ModelRegistry> {
  const raw = await readFile(MODEL_PATH, 'utf8');
  return JSON.parse(raw) as ModelRegistry;
}

export async function saveModel(model: ModelRegistry): Promise<void> {
  await writeFile(MODEL_PATH, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
}
