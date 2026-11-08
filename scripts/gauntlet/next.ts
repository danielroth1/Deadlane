import { loadState, nextOrder, summarise } from './lib';

/**
 * Print the next dispatchable work order, verbatim.
 *
 * The orchestrator calls this and hands the output to a fresh implementer. Nothing else
 * needs to enter the orchestrator's context.
 */
async function main(): Promise<void> {
  const state = await loadState();
  const counts = summarise(state);

  console.log(
    `\n\x1b[1mDEADLANE · gauntlet\x1b[0m  ` +
      `done ${counts.done}  pending ${counts.pending}  escalated ${counts.escalated}  ` +
      `of ${state.orders.length}`,
  );

  const dispatch = await nextOrder(state);

  if (!dispatch) {
    const escalated = state.orders.filter((o) => o.status === 'escalated');
    if (escalated.length > 0) {
      console.log('\n\x1b[31mNothing dispatchable.\x1b[0m Escalated orders need a human decision:');
      for (const order of escalated) console.log(`  ${order.id}  ${order.title}  (${order.note ?? ''})`);
    } else {
      console.log('\n\x1b[32mQueue empty.\x1b[0m');
    }
    return;
  }

  const { order, content } = dispatch;

  console.log(`\n\x1b[1mNEXT: ${order.id} — ${order.title}\x1b[0m`);
  console.log(`  rounds used: ${order.round}/${state.maxRounds}`);
  console.log(`  file: ${order.file}`);
  console.log('\n' + '─'.repeat(78) + '\n');
  console.log(content);
  console.log('─'.repeat(78));
  console.log(`
  Dispatch an \x1b[1mimplementer\x1b[0m subagent with the work order above and nothing else
  (for art orders, add the /tmp evidence files). Let it decide what to change.

  Then dispatch a \x1b[1mreviewer\x1b[0m subagent with the work order, the diff, and the
  verification output. Never the implementer's reasoning.

  Record the outcome:
    npm run gauntlet:record -- --id ${order.id} --verdict pass|fail --note "one line"
`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
