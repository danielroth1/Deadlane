import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Gauntlet state machine.
 *
 * The orchestrator only ever reads this file plus short verdict summaries. That is the
 * mechanism that keeps an agent's context flat as the project grows: 50 work orders cost
 * 50 lines of state, not 50 files of source.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..', '..');
export const STATE_PATH = resolve(REPO_ROOT, 'gauntlet', 'state.json');
export const VERDICTS_DIR = resolve(REPO_ROOT, 'gauntlet', 'verdicts');

export type OrderStatus = 'pending' | 'in-review' | 'done' | 'escalated' | 'blocked';

export interface WorkOrder {
  id: string;
  title: string;
  file: string;
  status: OrderStatus;
  round: number;
  dependsOn: string[];
  lastVerdict?: string;
  note?: string;
}

export interface GauntletState {
  version: 1;
  maxRounds: number;
  orders: WorkOrder[];
}

export async function loadState(): Promise<GauntletState> {
  return JSON.parse(await readFile(STATE_PATH, 'utf8')) as GauntletState;
}

export async function saveState(state: GauntletState): Promise<void> {
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export interface Dispatch {
  readonly order: WorkOrder;
  readonly content: string;
  readonly blocked: readonly WorkOrder[];
}

/** The next order that is ready: still pending, with every dependency done. */
export async function nextOrder(state: GauntletState): Promise<Dispatch | null> {
  const byId = new Map(state.orders.map((o) => [o.id, o]));

  for (const order of state.orders) {
    if (order.status !== 'pending') continue;

    const blocked = order.dependsOn
      .map((id) => byId.get(id))
      .filter((dep): dep is WorkOrder => Boolean(dep) && dep!.status !== 'done');

    if (blocked.length > 0) continue;

    const path = resolve(REPO_ROOT, order.file);
    const content = existsSync(path) ? await readFile(path, 'utf8') : '(work order file missing)';
    return { order, content, blocked: [] };
  }

  return null;
}

export async function writeVerdict(
  order: WorkOrder,
  verdict: 'pass' | 'fail' | 'escalate',
  note: string,
): Promise<string> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(VERDICTS_DIR, { recursive: true });
  const path = resolve(VERDICTS_DIR, `${order.id}.round-${order.round + 1}.md`);
  const body = [
    `# ${order.id} — ${order.title}`,
    '',
    `- verdict: **${verdict.toUpperCase()}**`,
    `- round: ${order.round + 1}`,
    `- at: ${new Date().toISOString()}`,
    '',
    '## Reviewer note',
    '',
    note || '(none)',
    '',
  ].join('\n');
  await writeFile(path, body, 'utf8');
  return path;
}

/** Apply a verdict, advancing rounds and escalating when the round budget is spent. */
export function applyVerdict(
  state: GauntletState,
  order: WorkOrder,
  verdict: 'pass' | 'fail' | 'escalate',
  note: string,
): WorkOrder {
  if (verdict === 'pass') {
    order.status = 'done';
    order.round += 1;
    order.lastVerdict = 'pass';
    order.note = note;
    return order;
  }

  order.round += 1;
  order.lastVerdict = verdict;
  order.note = note;

  const mustEscalate = verdict === 'escalate' || order.round >= state.maxRounds;
  order.status = mustEscalate ? 'escalated' : 'pending';
  return order;
}

export function summarise(state: GauntletState): Record<OrderStatus, number> {
  const counts: Record<OrderStatus, number> = {
    pending: 0,
    'in-review': 0,
    done: 0,
    escalated: 0,
    blocked: 0,
  };
  for (const order of state.orders) counts[order.status] += 1;
  return counts;
}
