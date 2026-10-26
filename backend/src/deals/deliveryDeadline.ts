import type { DirectDeal } from '../db/deals.js';

/// The delivery date (owner, 26 Oct 2026). The seller is reminded before it,
/// both sides are told when it passes, and after the grace the buyer is
/// refunded. A request for more time the buyer has not answered holds that
/// refund until they answer; the buyer is reminded meanwhile.

export const DEADLINE_REMIND_BEFORE_MS = 24 * 3_600_000;
export const WAITING_REMIND_EVERY_MS = 24 * 3_600_000;
export const WAITING_REMINDERS = 3;

type DeadlineDeal = Pick<
  DirectDeal,
  'deadlineUnix' | 'acceptedAt' | 'delivered' | 'disputed' | 'extensionRequest' | 'extensionHistory' | 'deadlineRemindedFor' | 'extensionWaitReminder'
>;

/// A day before the date, or halfway when the whole delivery time is shorter
/// than two days, so a short deal is not reminded the moment it starts.
export function deadlineReminderDue(deal: DeadlineDeal, nowMs: number): boolean {
  if (!deal.deadlineUnix || deal.delivered || deal.disputed || deal.extensionRequest) return false;
  if (deal.deadlineRemindedFor === deal.deadlineUnix) return false;
  const dueMs = deal.deadlineUnix * 1000;
  if (nowMs >= dueMs) return false;
  const lead = deal.acceptedAt ? Math.min(DEADLINE_REMIND_BEFORE_MS, (dueMs - deal.acceptedAt) / 2) : DEADLINE_REMIND_BEFORE_MS;
  return nowMs >= dueMs - lead;
}

/// Which reminder to the buyer is due while their answer holds the refund, or
/// null. Counted per request, so a replaced request starts again at one.
export function waitingReminderDue(deal: DeadlineDeal, nowMs: number, graceMs: number): number | null {
  const ask = deal.extensionRequest;
  if (!ask || !deal.deadlineUnix || nowMs < deal.deadlineUnix * 1000 + graceMs) return null;
  const sent = deal.extensionWaitReminder;
  if (!sent || sent.requestedAt !== ask.requestedAt) return 1;
  if (sent.count >= WAITING_REMINDERS || nowMs < sent.lastAt + WAITING_REMIND_EVERY_MS) return null;
  return sent.count + 1;
}

export type MoreTimeAsk = 'ok' | 'no-deadline' | 'too-late' | 'already-asked';

/// Before the date the seller may ask as often as they like, one request at a
/// time. After it they ask once, and only while the grace runs: past it the
/// refund is due and the escrow refuses a delivery.
export function sellerMayAskMoreTime(deal: DeadlineDeal, nowMs: number, graceMs: number): MoreTimeAsk {
  if (!deal.deadlineUnix) return 'no-deadline';
  const dueMs = deal.deadlineUnix * 1000;
  if (nowMs <= dueMs) return 'ok';
  if (nowMs > dueMs + graceMs) return 'too-late';
  return (deal.extensionHistory ?? []).some((h) => h.requestedAt > dueMs) ? 'already-asked' : 'ok';
}

/// An approval adds the extra time to the later of the old date and now, so a
/// buyer who answers late still gives the seller the time they asked for.
export function approvedDeadline(deadlineUnix: number, nowUnix: number, additionalSeconds: number): number {
  return Math.max(deadlineUnix, nowUnix) + additionalSeconds;
}
