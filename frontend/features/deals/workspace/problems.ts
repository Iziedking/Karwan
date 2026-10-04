import type { DirectDeal } from '@/core/api';

export type Problem = 'cancel' | 'moreTime' | 'reclaim' | 'dispute' | 'propose';

const DAY_MS = 86_400_000;

/// What "Something is wrong" offers this viewer at this point of the deal.
/// Empty means the row is not shown. Mirrors the routes' own rules, so the
/// page never offers a move the backend would refuse.
export function problemOptions(deal: DirectDeal, viewer: 'buyer' | 'seller' | null, now: number): Problem[] {
  const stage = deal.view?.stage;
  if (!viewer || !stage || deal.cancellationProposal) return [];
  if (stage === 'awaiting-acceptance' || stage === 'awaiting-funding') {
    return viewer === 'buyer' && !deal.fundTxHash ? ['cancel'] : [];
  }
  if (stage === 'awaiting-delivery') {
    if (viewer === 'seller') return deal.extensionRequest ? [] : ['moreTime'];
    if (!deal.deadlineUnix || deal.deadlineRecovery?.state === 'running') return [];
    const reclaimAt = deal.deadlineUnix * 1000 + (deal.deadlineReclaimGraceMs ?? DAY_MS);
    return now >= reclaimAt ? ['reclaim'] : [];
  }
  if (stage === 'awaiting-first-release' || stage === 'awaiting-final-release') return ['dispute', 'propose'];
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
