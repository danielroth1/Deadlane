import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The image budget ledger.
 *
 * This module is pure: every function takes a `Ledger` and returns a new one, so the
 * rules can be unit-tested without touching disk. The CLI layer in `pipeline/cli/` owns
 * file IO.
 *
 * Rules (see pipeline/BUDGET.md):
 *   R1  A lifetime ceiling of `limit` images. Nothing can exceed it.
 *   R2  A single slot may be attempted at most `perSlotLimit` times.
 *   R3  A retry is refused while it would starve a slot that has never been tried.
 *   R4  Every attempt after the first must use a seed never used by that slot.
 *   R5  Only claimed attempts consume budget; releasing returns it.
 */

export type AttemptState = 'claimed' | 'generated' | 'released';

export interface AttemptRecord {
  readonly attempt: number;
  readonly seed: number;
  readonly promptHash: string;
  readonly state: AttemptState;
  readonly claimedAt: string;
  requestId?: string;
  url?: string;
  costUsd?: number;
  notes?: string;
}

export interface SlotRecord {
  readonly id: string;
  attempts: AttemptRecord[];
  /** Attempt number chosen by pipeline/steps/score.ts, or by a human override. */
  selected?: number;
  status: 'open' | 'approved' | 'exhausted' | 'skipped';
}

export interface Ledger {
  readonly version: 1;
  readonly limit: number;
  readonly perSlotLimit: number;
  readonly createdAt: string;
  slots: Record<string, SlotRecord>;
}

export type ClaimResult =
  | { readonly ok: true; readonly ledger: Ledger; readonly attempt: AttemptRecord }
  | { readonly ok: false; readonly reason: string };

export class BudgetError extends Error {
  constructor(
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = 'BudgetError';
  }
}

export function createLedger(slotIds: readonly string[], limit: number, perSlotLimit: number): Ledger {
  const slots: Record<string, SlotRecord> = {};
  for (const id of slotIds) {
    slots[id] = { id, attempts: [], status: 'open' };
  }
  return {
    version: 1,
    limit,
    perSlotLimit,
    createdAt: new Date().toISOString(),
    slots,
  };
}

/**
 * Lifetime ceiling for the project, in images.
 *
 * Raised 80 → 120 by an explicit human decision (WO-20), then 120 → 150 by an explicit
 * human decision (2026-11-08). Raise it only the same way — see AGENTS.md, "Do not raise
 * the ceiling without the human saying so".
 */
export const DEFAULT_IMAGE_LIMIT = 150;

/**
 * Change the lifetime ceiling, keeping every existing slot and attempt intact.
 *
 * A limit below what has already been consumed is refused: lowering the ceiling would
 * orphan recorded spend, and the ledger's whole job is to account for it.
 */
export function setLimit(ledger: Ledger, limit: number): Ledger {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new BudgetError(`Image limit must be a non-negative integer, got "${String(limit)}".`);
  }
  const used = usedImages(ledger);
  if (limit < used) {
    throw new BudgetError(
      `Refusing to set the image limit to ${limit}: ${used} image(s) are already consumed.`,
      'The ceiling can never drop below recorded spend.',
    );
  }
  return { ...ledger, limit };
}

/**
 * Add registry slots that the ledger does not know about yet.
 *
 * Existing records are returned untouched (same ids, attempts, selection, status), so
 * this is safe to run against a ledger with real spend. Slots are appended in the order
 * given; nothing is reordered, renamed or removed.
 */
export function addMissingSlots(ledger: Ledger, slotIds: readonly string[]): Ledger {
  const missing = slotIds.filter((id) => ledger.slots[id] === undefined);
  if (missing.length === 0) return ledger;

  const slots: Record<string, SlotRecord> = { ...ledger.slots };
  for (const id of missing) {
    slots[id] = { id, attempts: [], status: 'open' };
  }
  return { ...ledger, slots };
}

/** Images consumed across the whole project. Released attempts do not count. */
export function usedImages(ledger: Ledger): number {
  return Object.values(ledger.slots)
    .flatMap((slot) => slot.attempts)
    .filter((a) => a.state !== 'released').length;
}

export function remainingImages(ledger: Ledger): number {
  return Math.max(0, ledger.limit - usedImages(ledger));
}

/** Slots that have never consumed an image — these hold a reservation (R3). */
export function unstartedSlots(ledger: Ledger): number {
  return Object.values(ledger.slots).filter(
    (slot) => !slot.attempts.some((a) => a.state !== 'released'),
  ).length;
}

export function attemptsFor(ledger: Ledger, slotId: string): number {
  const slot = ledger.slots[slotId];
  if (!slot) return 0;
  return slot.attempts.filter((a) => a.state !== 'released').length;
}

export function isSlotExhausted(ledger: Ledger, slotId: string): boolean {
  return attemptsFor(ledger, slotId) >= ledger.perSlotLimit;
}

/**
 * Reserve one image for a slot.
 *
 * Call this immediately before invoking the fal `run_model` tool, and never afterwards.
 * If generation fails, `release` the attempt so the budget is returned.
 */
export function claimAttempt(
  ledger: Ledger,
  slotId: string,
  opts: { seed: number; promptHash: string; now?: string },
): ClaimResult {
  const slot = ledger.slots[slotId];
  if (!slot) {
    return { ok: false, reason: `Unknown slot "${slotId}".` };
  }
  if (slot.status === 'approved') {
    return { ok: false, reason: `Slot "${slotId}" is already approved; it needs no new art.` };
  }
  if (slot.status === 'skipped') {
    return { ok: false, reason: `Slot "${slotId}" was intentionally skipped.` };
  }

  const live = slot.attempts.filter((a) => a.state !== 'released');
  const attemptNumber = slot.attempts.length + 1;

  // R2 — per-slot cap.
  if (live.length >= ledger.perSlotLimit) {
    return {
      ok: false,
      reason: `Slot "${slotId}" has used all ${ledger.perSlotLimit} attempts. Pick the best existing attempt with \`npm run art:select\`.`,
    };
  }

  // R1 — lifetime ceiling.
  const used = usedImages(ledger);
  if (used >= ledger.limit) {
    return {
      ok: false,
      reason: `Lifetime image budget exhausted (${used}/${ledger.limit}).`,
    };
  }

  // R3 — a retry may not starve a slot that has never been attempted.
  const isRetry = live.length > 0;
  if (isRetry) {
    const unstarted = unstartedSlots(ledger);
    if (remainingImages(ledger) - 1 < unstarted) {
      return {
        ok: false,
        reason:
          `Refusing retry for "${slotId}": ${unstarted} slot(s) have never been attempted and only ` +
          `${remainingImages(ledger)} image(s) remain. Finish the first pass across all slots first.`,
      };
    }
  }

  // R4 — retries must change the seed, otherwise they are duplicate spends.
  if (isRetry && live.some((a) => a.seed === opts.seed)) {
    return {
      ok: false,
      reason:
        `Seed ${opts.seed} was already used by an earlier attempt in "${slotId}". A retry must ` +
        `change the seed; use a new one so the attempt is not a duplicate.`,
    };
  }

  const attempt: AttemptRecord = {
    attempt: attemptNumber,
    seed: opts.seed,
    promptHash: opts.promptHash,
    state: 'claimed',
    claimedAt: opts.now ?? new Date().toISOString(),
  };

  const next: Ledger = {
    ...ledger,
    slots: {
      ...ledger.slots,
      [slotId]: { ...slot, attempts: [...slot.attempts, attempt] },
    },
  };

  return { ok: true, ledger: next, attempt };
}

/** Attach the fal request id, CDN url and cost once generation succeeds. */
export function recordGeneration(
  ledger: Ledger,
  slotId: string,
  attemptNumber: number,
  info: { requestId: string; url: string; costUsd?: number },
): Ledger {
  const slot = requireSlotRecord(ledger, slotId);
  const attempts = slot.attempts.map((a) =>
    a.attempt === attemptNumber
      ? {
          ...a,
          state: 'generated' as const,
          requestId: info.requestId,
          url: info.url,
          ...(info.costUsd !== undefined ? { costUsd: info.costUsd } : {}),
        }
      : a,
  );
  if (!attempts.some((a) => a.attempt === attemptNumber)) {
    throw new BudgetError(`Attempt ${attemptNumber} does not exist in slot "${slotId}".`);
  }
  return { ...ledger, slots: { ...ledger.slots, [slotId]: { ...slot, attempts } } };
}

/** Give budget back when a generation never produced a usable image. */
export function releaseAttempt(ledger: Ledger, slotId: string, attemptNumber: number, note: string): Ledger {
  const slot = requireSlotRecord(ledger, slotId);
  const attempts = slot.attempts.map((a) =>
    a.attempt === attemptNumber ? { ...a, state: 'released' as const, notes: note } : a,
  );
  return { ...ledger, slots: { ...ledger.slots, [slotId]: { ...slot, attempts } } };
}

export function selectAttempt(ledger: Ledger, slotId: string, attemptNumber: number): Ledger {
  const slot = requireSlotRecord(ledger, slotId);
  const target = slot.attempts.find((a) => a.attempt === attemptNumber);
  if (!target) {
    throw new BudgetError(`Slot "${slotId}" has no attempt ${attemptNumber}.`);
  }
  if (target.state !== 'generated') {
    throw new BudgetError(
      `Attempt ${attemptNumber} of "${slotId}" is "${target.state}" — only generated attempts can be selected.`,
    );
  }
  return {
    ...ledger,
    slots: {
      ...ledger.slots,
      [slotId]: { ...slot, selected: attemptNumber, status: 'approved' },
    },
  };
}

export function markSlotStatus(ledger: Ledger, slotId: string, status: SlotRecord['status']): Ledger {
  const slot = requireSlotRecord(ledger, slotId);
  return { ...ledger, slots: { ...ledger.slots, [slotId]: { ...slot, status } } };
}

/**
 * Return a slot to `open` so a rejected selection can be retried.
 *
 * `selectAttempt` locks a slot to `approved`, which `claimAttempt` refuses, so a FAIL on
 * the selected attempt would otherwise leave the slot permanently unretryable. This
 * clears the status and the selection but keeps every attempt intact — seeds, request
 * ids, urls and costs stay in the ledger for auditability, and no image is returned to or
 * taken from the budget.
 */
export function reopenSlot(ledger: Ledger, slotId: string): Ledger {
  const slot = requireSlotRecord(ledger, slotId);
  if (slot.status === 'open') {
    throw new BudgetError(`Slot "${slotId}" is already open; there is nothing to reopen.`);
  }
  const reopened: SlotRecord = {
    id: slot.id,
    attempts: [...slot.attempts],
    status: 'open',
  };
  return { ...ledger, slots: { ...ledger.slots, [slotId]: reopened } };
}

function requireSlotRecord(ledger: Ledger, slotId: string): SlotRecord {
  const slot = ledger.slots[slotId];
  if (!slot) throw new BudgetError(`Unknown slot "${slotId}".`);
  return slot;
}

export interface LedgerSummary {
  readonly used: number;
  readonly limit: number;
  readonly remaining: number;
  readonly unstarted: number;
  readonly approved: number;
  readonly exhausted: number;
  readonly spendUsd: number;
}

export function summarize(ledger: Ledger): LedgerSummary {
  const slots = Object.values(ledger.slots);
  return {
    used: usedImages(ledger),
    limit: ledger.limit,
    remaining: remainingImages(ledger),
    unstarted: unstartedSlots(ledger),
    approved: slots.filter((s) => s.status === 'approved').length,
    exhausted: slots.filter((s) => s.status === 'exhausted').length,
    spendUsd: slots
      .flatMap((s) => s.attempts)
      .reduce((sum, a) => sum + (a.costUsd ?? 0), 0),
  };
}

/* ---------------------------------- file IO --------------------------------- */

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolvePath(HERE, '..', '..');
export const LEDGER_PATH = resolvePath(REPO_ROOT, 'pipeline', 'budget.json');

export async function loadLedger(path = LEDGER_PATH): Promise<Ledger> {
  const raw = await readFile(path, 'utf8');
  return JSON.parse(raw) as Ledger;
}

/** Write via a temp file so an interrupted run cannot corrupt the ledger. */
export async function saveLedger(ledger: Ledger, path = LEDGER_PATH): Promise<void> {
  const tmp = `${path}.tmp`;
  await writeFile(tmp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  await rename(tmp, path);
}
