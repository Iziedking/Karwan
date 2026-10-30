import type { DirectDeal } from '../db/deals.js';

/// A person at Karwan checks a delivery link the scanner flagged, and either
/// clears it or keeps it blocked. The scanner can be wrong; this is the way a
/// legitimate link reaches the buyer without the seller resending it.
///
/// A suspicious link is cleared by one reviewer. A link rated malicious needs
/// both credentials: one decision from the support token and one from the
/// admin token, in either order. The review belongs to one delivery revision;
/// a new delivery is scanned afresh and starts a new review.
///
/// A review names the revision it is about. The current delivery of an open
/// deal is reviewed in full: clearing it reaches the buyer and the money. A
/// replaced delivery, or any delivery of a closed deal, can still be reviewed
/// for the record: clearing it marks that delivery clean in the history and
/// takes the offence off the seller, and changes nothing for the money.

export type ReviewerRole = 'admin' | 'support';
export type ReviewDecision = 'safe' | 'unsafe';
export type ReviewScope = 'current' | 'record-only';

export interface DeliveryReview {
  deliveryRevision: number;
  originalVerdict: 'suspicious' | 'malicious';
  reasons: string[];
  decision: ReviewDecision | 'pending-approval';
  steps: Array<{ role: ReviewerRole; decision: ReviewDecision; reason: string; at: number }>;
  decidedAt?: number;
  /// Absent on reviews written before replaced deliveries could be reviewed; those were all current.
  scope?: ReviewScope;
}

export type ReviewResult =
  | { ok: true; review: DeliveryReview; clears: boolean; scope: ReviewScope }
  | {
      ok: false;
      code: 'not-held' | 'no-such-delivery' | 'reason-required' | 'already-decided' | 'needs-other-reviewer';
      message: string;
    };

const MIN_REASON = 10;
const HELD = new Set(['suspicious', 'malicious']);

type ReviewedDeal = Pick<
  DirectDeal,
  | 'delivered'
  | 'settledAt'
  | 'cancelledAt'
  | 'deliveryRevision'
  | 'verificationStatus'
  | 'verificationReasons'
  | 'deliveryReview'
  | 'deliveryReviews'
  | 'deliveryHistory'
>;

/// The review of one delivery revision, if one was started. Reads the
/// per-revision list first, then the single field older rows carry.
export function reviewOpenFor(deal: ReviewedDeal, revision: number = deal.deliveryRevision ?? 0): DeliveryReview | null {
  const listed = (deal.deliveryReviews ?? []).find((r) => r.deliveryRevision === revision);
  if (listed) return listed;
  const single = deal.deliveryReview;
  return single && single.deliveryRevision === revision ? single : null;
}

/// What the scanner said about one revision: the deal's own fields for the
/// current delivery, the history for earlier ones.
function verdictFor(deal: ReviewedDeal, revision: number): DirectDeal['verificationStatus'] | 'none' {
  const current = deal.deliveryRevision ?? 0;
  if (revision === current) return deal.delivered ? deal.verificationStatus : undefined;
  const entry = deal.deliveryHistory?.find((e) => e.revision === revision);
  if (!entry) return 'none';
  return entry.verificationStatus;
}

export interface ReviewableDelivery {
  revision: number;
  verificationStatus: 'suspicious' | 'malicious';
  current: boolean;
  reviewed: DeliveryReview['decision'] | null;
}

/// Every delivery a reviewer may look at, with where its review stands.
export function reviewableDeliveries(deal: ReviewedDeal): ReviewableDelivery[] {
  const current = deal.deliveryRevision ?? 0;
  const seen = new Set<number>();
  const out: ReviewableDelivery[] = [];
  for (const entry of deal.deliveryHistory ?? []) {
    if (seen.has(entry.revision) || !entry.verificationStatus || !HELD.has(entry.verificationStatus)) continue;
    seen.add(entry.revision);
    out.push({ revision: entry.revision, verificationStatus: entry.verificationStatus as 'suspicious' | 'malicious', current: entry.revision === current, reviewed: reviewOpenFor(deal, entry.revision)?.decision ?? null });
  }
  if (!seen.has(current) && deal.delivered && deal.verificationStatus && HELD.has(deal.verificationStatus)) {
    out.push({ revision: current, verificationStatus: deal.verificationStatus as 'suspicious' | 'malicious', current: true, reviewed: reviewOpenFor(deal, current)?.decision ?? null });
  }
  return out.sort((a, b) => b.revision - a.revision);
}

export function decideDeliveryReview(
  deal: ReviewedDeal,
  input: { role: ReviewerRole; decision: ReviewDecision; reason: string },
  now: number,
  revision: number = deal.deliveryRevision ?? 0,
): ReviewResult {
  const closed = Boolean(deal.settledAt || deal.cancelledAt);
  const scope: ReviewScope = !closed && revision === (deal.deliveryRevision ?? 0) ? 'current' : 'record-only';
  const verdict = verdictFor(deal, revision);
  if (verdict === 'none') {
    return { ok: false, code: 'no-such-delivery', message: 'This deal has no delivery with that number.' };
  }
  if (verdict !== 'suspicious' && verdict !== 'malicious') {
    return {
      ok: false,
      code: 'not-held',
      message: scope === 'current' ? 'The current delivery is not held by the link check.' : 'That delivery was not held by the link check.',
    };
  }
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) {
    return { ok: false, code: 'reason-required', message: 'Write what you checked and what you found.' };
  }

  const open = reviewOpenFor(deal, revision);
  if (open && open.decision !== 'pending-approval') {
    return { ok: false, code: 'already-decided', message: 'This delivery was already reviewed. A new delivery starts a new review.' };
  }
  if (open && open.steps.some((s) => s.role === input.role)) {
    return { ok: false, code: 'needs-other-reviewer', message: 'A link rated malicious needs the other credential to approve it.' };
  }

  const step = { role: input.role, decision: input.decision, reason: reason.slice(0, 1000), at: now };
  const steps = [...(open?.steps ?? []), step];
  const base = {
    deliveryRevision: revision,
    originalVerdict: verdict,
    reasons: scope === 'current' ? deal.verificationReasons ?? [] : open?.reasons ?? [],
    steps,
    scope,
  };

  if (input.decision === 'unsafe') {
    return { ok: true, clears: false, scope, review: { ...base, decision: 'unsafe', decidedAt: now } };
  }
  if (verdict === 'malicious' && steps.length < 2) {
    return { ok: true, clears: false, scope, review: { ...base, decision: 'pending-approval' } };
  }
  return { ok: true, clears: true, scope, review: { ...base, decision: 'safe', decidedAt: now } };
}

/// What the buyer and seller see: where the check on the current delivery
/// stands, never the reviewers' notes or which credential decided.
export function reviewForParty(deal: ReviewedDeal): { state: 'checking' | 'safe' | 'unsafe' } | undefined {
  const review = reviewOpenFor(deal);
  if (!review) return undefined;
  return { state: review.decision === 'pending-approval' ? 'checking' : review.decision };
}
