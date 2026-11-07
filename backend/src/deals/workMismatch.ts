import type { DirectDeal } from '../db/deals.js';

/// The work check (the model that compares a delivery with the request) said
/// the current delivery does not match, which pauses the release. The buyer
/// may accept it after their own review, and a person at Karwan may clear it
/// with a reason (view 21, 7 Nov 2026). Either way only that delivery reads as
/// matching from then on; a new delivery is checked afresh. A held link and a
/// signed on-chain check are not touched here. Pure: the caller supplies the
/// deal and the clock.

export type WorkCheckLifter = 'buyer' | 'admin' | 'support';

export interface WorkCheckOverride {
  deliveryRevision: number;
  by: WorkCheckLifter;
  /// A person at Karwan writes what they checked; the buyer's acceptance needs none.
  reason?: string;
  at: number;
  /// The check's own words, kept for the record.
  originalReason: string;
}

export type LiftResult =
  | { ok: true; patch: Partial<DirectDeal>; override: WorkCheckOverride }
  | { ok: false; code: 'closed' | 'not-delivered' | 'not-held' | 'link-held' | 'reason-required'; message: string };

const MIN_REASON = 10;
const MAX_REASON = 1000;

type MismatchDeal = Pick<DirectDeal, 'delivered' | 'settledAt' | 'cancelledAt' | 'deliveryMatch' | 'verificationStatus'>;

export function workMismatchOpen(deal: MismatchDeal): boolean {
  return (
    !deal.settledAt
    && !deal.cancelledAt
    && deal.delivered === true
    && deal.deliveryMatch?.verdict === 'mismatch'
    && deal.verificationStatus !== 'suspicious'
    && deal.verificationStatus !== 'malicious'
  );
}

const READS: Record<WorkCheckLifter, string> = {
  buyer: 'The buyer checked this delivery and accepted it.',
  admin: 'Karwan support checked this delivery and found it matches the request.',
  support: 'Karwan support checked this delivery and found it matches the request.',
};

export function liftWorkMismatch(
  deal: DirectDeal,
  input: { by: WorkCheckLifter; reason?: string },
  now: number,
): LiftResult {
  if (deal.settledAt || deal.cancelledAt) return { ok: false, code: 'closed', message: 'This deal is closed.' };
  if (!deal.delivered) return { ok: false, code: 'not-delivered', message: 'Nothing is delivered yet.' };
  if (deal.verificationStatus === 'suspicious' || deal.verificationStatus === 'malicious') {
    return { ok: false, code: 'link-held', message: 'The delivery link is held for a safety check. Review the link first.' };
  }
  if (deal.deliveryMatch?.verdict !== 'mismatch') {
    return { ok: false, code: 'not-held', message: 'The check found no gap in this delivery.' };
  }
  const reason = input.reason?.trim();
  if (input.by !== 'buyer' && (!reason || reason.length < MIN_REASON)) {
    return { ok: false, code: 'reason-required', message: 'Write what you checked and what you found.' };
  }
  const revision = deal.deliveryRevision ?? 0;
  const override: WorkCheckOverride = {
    deliveryRevision: revision,
    by: input.by,
    ...(input.by !== 'buyer' && reason ? { reason: reason.slice(0, MAX_REASON) } : {}),
    at: now,
    originalReason: deal.deliveryMatch.reason,
  };
  const deliveryMatch = { verdict: 'aligned' as const, reason: READS[input.by] };
  const patch: Partial<DirectDeal> = {
    workCheckOverride: override,
    deliveryMatch,
    deliveryHistory: deal.deliveryHistory?.map((entry) => (entry.revision === revision ? { ...entry, deliveryMatch } : entry)),
    ...(deal.releaseBlockedReason === 'requirement-mismatch'
      ? { releaseBlockedReason: undefined, releaseBlockedAt: undefined, releaseBlockedDetail: undefined }
      : {}),
    // The buyer had no reason to look while the check said it was wrong, so
    // their review window starts when a person clears it.
    ...(input.by !== 'buyer' ? { deliveredAt: now } : {}),
  };
  return { ok: true, patch, override };
}

/// The chat line both people read. The reviewer's note never goes in it.
export function liftedLine(by: WorkCheckLifter): string {
  return by === 'buyer'
    ? 'The buyer checked this delivery and accepted it, although the check had found a gap with the request.'
    : 'Karwan support checked this delivery and found it matches the request. The buyer can review it and release as usual.';
}
