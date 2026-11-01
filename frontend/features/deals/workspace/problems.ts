import type { DirectDeal } from '@/core/api';

export type Problem = 'cancel' | 'moreTime' | 'moreReview' | 'reclaim' | 'dispute' | 'propose' | 'askRelease' | 'answerAppeal';

type ProposalKind = NonNullable<DirectDeal['cancellationProposal']>['kind'];

const DAY_MS = 86_400_000;
// The route's defaults when the deal does not carry its own (deals.ts delay-appeal).
const APPEAL_GRACE_MS = 3_600_000;
const APPEAL_RESPONSE_MS = 300_000;

/// A seller's ask to release that the buyer has not answered yet.
function appealOpen(deal: DirectDeal): boolean {
  return (deal.delayAppealRaisedAt ?? 0) > (deal.delayAppealRespondedAt ?? 0);
}

/// The seller may ask once the buyer has sat on the latest release past the
/// grace, with nothing already waiting for an answer.
function canAskRelease(deal: DirectDeal, now: number): boolean {
  if (!deal.reviewWindowStartedAt || appealOpen(deal)) return false;
  const from = deal.lastReleaseAt ?? deal.reviewWindowStartedAt;
  return now >= from + (deal.delayAppealGraceMs ?? APPEAL_GRACE_MS);
}

/// The buyer answers while the window runs; after it the agent releases.
function canAnswerAppeal(deal: DirectDeal, now: number): boolean {
  if (!appealOpen(deal)) return false;
  return now < (deal.delayAppealRaisedAt ?? 0) + (deal.delayAppealResponseWindowMs ?? APPEAL_RESPONSE_MS);
}

/// What "Something is wrong" offers this viewer at this point of the deal.
/// Empty means the row is not shown. Mirrors the routes' own rules, so the
/// page never offers a move the backend would refuse.
export function problemOptions(deal: DirectDeal, viewer: 'buyer' | 'seller' | null, now: number): Problem[] {
  const stage = deal.view?.stage;
  // A deal on an older contract finishes in Earlier deals, not here.
  if (!viewer || !stage || deal.cancellationProposal || deal.legacyEscrow) return [];
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
    if (viewer === 'seller') return canAskRelease(deal, now) ? ['askRelease', 'dispute', 'propose'] : ['dispute', 'propose'];
    // The buyer may add review time once; the route holds the exact limit.
    const base: Problem[] = !(deal.reviewExtensionCount ?? 0) ? ['dispute', 'moreReview', 'propose'] : ['dispute', 'propose'];
    return canAnswerAppeal(deal, now) ? ['answerAppeal', ...base] : base;
  }
  // A dispute can still end by agreement: either side proposes refunding the
  // buyer or paying the seller, without waiting for the arbiter.
  if (stage === 'disputed') return ['propose'];
  return [];
}

/// Every proposal is answered on this page, except on an older contract,
/// which finishes in Earlier deals.
export function answersCancelHere(deal: DirectDeal): boolean {
  return !!deal.cancellationProposal && !deal.legacyEscrow;
}

/// Where the money goes if the open proposal is accepted.
export function proposalOutcome(deal: DirectDeal): 'cancel' | 'refund' | 'pay' | null {
  const kind = deal.cancellationProposal?.kind;
  if (!kind) return null;
  return kind === 'refund-from-dispute' ? 'refund' : kind === 'release-from-dispute' ? 'pay' : 'cancel';
}

/// What a proposal can ask for: in a dispute, refund the buyer or pay the
/// seller; before that, cancel by agreement.
export function proposeKinds(deal: DirectDeal): ProposalKind[] {
  return deal.view?.stage === 'disputed' ? ['refund-from-dispute', 'release-from-dispute'] : ['mutual'];
}
