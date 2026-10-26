import type { DirectDeal } from '@/core/api';

export type Problem = 'cancel' | 'moreTime' | 'moreReview' | 'reclaim' | 'dispute' | 'propose';

const DAY_MS = 86_400_000;

/// What "Something is wrong" offers this viewer at this point of the deal.
/// Empty means the row is not shown. Mirrors the routes' own rules, so the
/// page never offers a move the backend would refuse.
export function problemOptions(deal: DirectDeal, viewer: 'buyer' | 'seller' | null, now: number): Problem[] {
  const stage = deal.view?.stage;
  if (!viewer || !stage || deal.cancellationProposal) return [];
  if (stage === 'awaiting-acceptance' || stage === 'awaiting-funding') {
    if (viewer !== 'buyer') return [];
    // Money the seller never accepted on the escrow comes back whenever the buyer asks.
    const takeBack = deal.escrowVersion === 'v3' || deal.escrowVersion === 'suite';
    return !deal.fundTxHash || takeBack ? ['cancel'] : [];
  }
  if (stage === 'awaiting-delivery') {
    const dueMs = deal.deadlineUnix ? deal.deadlineUnix * 1000 : null;
    const reclaimAt = dueMs === null ? null : dueMs + (deal.deadlineReclaimGraceMs ?? DAY_MS);
    if (viewer === 'seller') {
      if (deal.extensionRequest || dueMs === null || reclaimAt === null) return [];
      // After the date the seller asks once, while the grace runs (deals/deliveryDeadline.ts).
      if (now <= dueMs) return ['moreTime'];
      if (now > reclaimAt || (deal.extensionHistory ?? []).some((h) => h.requestedAt > dueMs)) return [];
      return ['moreTime'];
    }
    if (reclaimAt === null || deal.deadlineRecovery?.state === 'running') return [];
    return now >= reclaimAt ? ['reclaim'] : [];
  }
  if (stage === 'awaiting-first-release' || stage === 'awaiting-final-release') {
    // The buyer may add review time once; the route holds the exact limit.
    return viewer === 'buyer' && !(deal.reviewExtensionCount ?? 0) ? ['dispute', 'moreReview', 'propose'] : ['dispute', 'propose'];
  }
  // A dispute can still end by agreement: either side proposes a full refund and
  // the other accepts, without waiting for the arbiter.
  if (stage === 'disputed') return ['propose'];
  return [];
}

/// Cancellation proposals the new page answers itself. Dispute rulings keep
/// their own wording on the full view.
export function answersCancelHere(deal: DirectDeal): boolean {
  const kind = deal.cancellationProposal?.kind;
  return kind === 'mutual' || kind === 'platform-attributed';
}
