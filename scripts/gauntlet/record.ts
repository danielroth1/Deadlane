import { applyVerdict, loadState, saveState, writeVerdict, type OrderStatus } from './lib';

/**
 * Record a reviewer verdict.
 *
 * Legal transitions only: an order must exist, may not already be done, and a FAIL spends
 * one round from the budget. When rounds run out the order escalates instead of looping.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const id = flag('id');
  const verdict = flag('verdict');
  const note = flag('note') ?? '';

  if (!id) throw new Error('Missing --id');
  if (verdict !== 'pass' && verdict !== 'fail' && verdict !== 'escalate') {
    throw new Error('--verdict must be pass, fail, or escalate');
  }

  const state = await loadState();
  const order = state.orders.find((o) => o.id === id);
  if (!order) throw new Error(`Unknown work order "${id}"`);

  if (order.status === 'done') {
    throw new Error(`${id} is already done. Reopening it needs a new order, not a verdict.`);
  }
  if (order.status === 'escalated') {
    throw new Error(`${id} is escalated and needs a human decision.`);
  }

  const path = await writeVerdict(order, verdict, note);
  applyVerdict(state, order, verdict, note);
  await saveState(state);

  const colour = verdict === 'pass' ? '\x1b[32m' : '\x1b[31m';
  console.log(`\n${colour}${verdict.toUpperCase()}\x1b[0m  ${order.id} — ${order.title}`);
  console.log(`  round ${order.round}/${state.maxRounds} · status ${order.status}`);
  console.log(`  verdict written to ${path.replace(process.cwd() + '/', '')}`);

  // `applyVerdict` mutates in place. Re-read from the array rather than from the narrowed
  // binding above, so the compiler sees the post-verdict status.
  const updated = state.orders.find((o) => o.id === id);
  const finalStatus: OrderStatus = updated?.status ?? 'pending';
  if (finalStatus === 'escalated') {
    console.log('\n\x1b[33mEscalated.\x1b[0m Round budget spent. A human must decide:');
    console.log('  - accept the current implementation and move on, or');
    console.log('  - split the order into smaller ones and re-queue.');
  }
}

main().catch((error: unknown) => {
  console.error(`\n\x1b[31mError:\x1b[0m ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
