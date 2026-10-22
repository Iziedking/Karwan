import type { DirectDeal } from '../db/deals.js';

/// A person at Karwan checks a delivery link the scanner flagged, and either
/// clears it or keeps it blocked. The scanner can be wrong; this is the way a
/// legitimate link reaches the buyer without the seller resending it.
///
/// A suspicious link is cleared by one reviewer. A link rated malicious needs
/// both credentials: one decision from the support token and one from the
/// admin token, in either order. The review belongs to one delivery revision;
/// a new delivery is scanned afresh and starts a new review.

export type ReviewerRole = 'admin' | 'support';
export type ReviewDecision = 'safe' | 'unsafe';

export interface DeliveryReview {
  deliveryRevision: number;
  originalVerdict: 'suspicious' | 'malicious';
  reasons: string[];
  decision: ReviewDecision | 'pending-approval';
  steps: Array<{ role: ReviewerRole; decision: ReviewDecision; reason: string; at: number }>;
  decidedAt?: number;
}

export type ReviewResult =
  | { ok: true; review: DeliveryReview; clears: boolean }
  | { ok: false; code: 'not-held' | 'closed' | 'reason-required' | 'already-decided' | 'needs-other-reviewer'; message: string };

const MIN_REASON = 10;

type ReviewedDeal = Pick<
  DirectDeal,
  'delivered' | 'settledAt' | 'cancelledAt' | 'deliveryRevision' | 'verificationStatus' | 'verificationReasons' | 'deliveryReview'
>;

/// The review that applies to the current delivery, if one was started.
export function reviewOpenFor(deal: ReviewedDeal): DeliveryReview | null {
  const review = deal.deliveryReview;
  return review && review.deliveryRevision === (deal.deliveryRevision ?? 0) ? review : null;
}

export function decideDeliveryReview(
  deal: ReviewedDeal,
  input: { role: ReviewerRole; decision: ReviewDecision; reason: string },
  now: number,
): ReviewResult {
  if (deal.settledAt || deal.cancelledAt) {
    return { ok: false, code: 'closed', message: 'This deal is closed, so its delivery cannot be reviewed.' };
  }
  const verdict = deal.verificationStatus;
  if (!deal.delivered || (verdict !== 'suspicious' && verdict !== 'malicious')) {
    return { ok: false, code: 'not-held', message: 'The current delivery is not held by the link check.' };
  }
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) {
    return { ok: false, code: 'reason-required', message: 'Write what you checked and what you found.' };
  }

  const open = reviewOpenFor(deal);
  if (open && open.decision !== 'pending-approval') {
    return { ok: false, code: 'already-decided', message: 'This delivery was already reviewed. A new delivery starts a new review.' };
  }
  if (open && open.steps.some((s) => s.role === input.role)) {
    return { ok: false, code: 'needs-other-reviewer', message: 'A link rated malicious needs the other credential to approve it.' };
  }

  const step = { role: input.role, decision: input.decision, reason: reason.slice(0, 1000), at: now };
  const steps = [...(open?.steps ?? []), step];
  const base = {
    deliveryRevision: deal.deliveryRevision ?? 0,
    originalVerdict: verdict,
    reasons: deal.verificationReasons ?? [],
    steps,
  };

  if (input.decision === 'unsafe') {
    return { ok: true, clears: false, review: { ...base, decision: 'unsafe', decidedAt: now } };
  }
  if (verdict === 'malicious' && steps.length < 2) {
    return { ok: true, clears: false, review: { ...base, decision: 'pending-approval' } };
  }
  return { ok: true, clears: true, review: { ...base, decision: 'safe', decidedAt: now } };
}

/// What the buyer and seller see: where the check stands, never the reviewers'
/// notes or which credential decided.
export function reviewForParty(deal: ReviewedDeal): { state: 'checking' | 'safe' | 'unsafe' } | undefined {
  const review = reviewOpenFor(deal);
  if (!review) return undefined;
  return { state: review.decision === 'pending-approval' ? 'checking' : review.decision };
}
