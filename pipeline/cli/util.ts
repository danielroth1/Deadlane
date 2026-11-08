import { SLOTS, requireSlot } from '../registry/slots.js';
import { loadLedger, saveLedger, summarize, type Ledger } from '../lib/ledger.js';

/** Tiny flag parser: `--slot art-01 --attempt 2 --seed 42 --flag`. */
export function parseArgs(argv: readonly string[]): {
  flags: Record<string, string | true>;
  positional: string[];
} {
  const flags: Record<string, string | true> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(token);
    }
  }
  return { flags, positional };
}

export function requireFlag(flags: Record<string, string | true>, key: string): string {
  const value = flags[key];
  if (typeof value !== 'string') {
    throw new CliError(`Missing required flag --${key}.`);
  }
  return value;
}

export function numberFlag(
  flags: Record<string, string | true>,
  key: string,
  fallback?: number,
): number {
  const value = flags[key];
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    throw new CliError(`Missing required flag --${key}.`);
  }
  if (typeof value !== 'string') throw new CliError(`Flag --${key} needs a value.`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new CliError(`Flag --${key} must be a number.`);
  return parsed;
}

export class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

export function banner(text: string): void {
  console.log(`\n\x1b[1m${text}\x1b[0m`);
}

export function ok(text: string): void {
  console.log(`  \x1b[32m✓\x1b[0m ${text}`);
}

export function bad(text: string): void {
  console.log(`  \x1b[31m✗\x1b[0m ${text}`);
}

export function info(text: string): void {
  console.log(`  \x1b[90m·\x1b[0m ${text}`);
}

export function progressBar(used: number, limit?: number, width = 40): string {
  if (limit === undefined) {
    return `[ ${used} image${used === 1 ? '' : 's'} used · no lifetime cap ]`;
  }
  const filled = Math.round((used / limit) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
  return `[${bar}] ${used}/${limit}`;
}

/** Load the ledger, run a mutation, and persist it only when the mutation succeeded. */
export async function withLedger<T>(fn: (ledger: Ledger) => Promise<T> | T): Promise<T> {
  const ledger = await loadLedger();
  return fn(ledger);
}

export async function persist(ledger: Ledger): Promise<void> {
  await saveLedger(ledger);
}

export function printSummary(ledger: Ledger): void {
  const s = summarize(ledger);
  console.log(`  ${progressBar(s.used, s.limit)}`);
  const headroom = s.remaining === undefined ? 'no lifetime cap' : `remaining ${s.remaining}`;
  info(`${headroom} · unstarted slots ${s.unstarted} · approved ${s.approved}`);
  if (s.spendUsd > 0) info(`recorded spend $${s.spendUsd.toFixed(3)}`);
}

export { SLOTS, requireSlot };

/** Wrap a CLI body so errors print without a stack trace dump. */
export function run(main: () => Promise<void>): void {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n\x1b[31mError:\x1b[0m ${message}`);
    if (error instanceof Error && error.stack && process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exitCode = 1;
  });
}
