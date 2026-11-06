import { loadState, nextOrder, summarise } from './lib';

/** Compact queue view: what is done, what is next, what needs a human. */
async function main(): Promise<void> {
  const state = await loadState();
  const counts = summarise(state);
  const next = await nextOrder(state);

  console.log('\n\x1b[1mDEADLANE · gauntlet queue\x1b[0m\n');
  console.log('  id      status       rounds  title');
  console.log('  ' + '─'.repeat(74));

  const colour: Record<string, string> = {
    done: '\x1b[32m',
    pending: '\x1b[90m',
    'in-review': '\x1b[36m',
    escalated: '\x1b[31m',
    blocked: '\x1b[33m',
  };

  for (const order of state.orders) {
    const c = colour[order.status] ?? '';
    const marker = next?.order.id === order.id ? ' \x1b[35m← next\x1b[0m' : '';
    console.log(
      `  ${order.id}  ${c}${order.status.padEnd(11)}\x1b[0m  ${String(order.round)}/${state.maxRounds}     ${order.title}${marker}`,
    );
  }

  console.log('');
  console.log(
    `  done ${counts.done} · pending ${counts.pending} · in-review ${counts['in-review']} · ` +
      `escalated ${counts.escalated} · blocked ${counts.blocked}`,
  );

  const escalated = state.orders.filter((o) => o.status === 'escalated');
  if (escalated.length > 0) {
    console.log('\n  \x1b[31mNeeds a human:\x1b[0m');
    for (const order of escalated) {
      console.log(`    ${order.id}  ${order.title}  — ${order.note ?? 'no note'}`);
    }
  }
  console.log('');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
